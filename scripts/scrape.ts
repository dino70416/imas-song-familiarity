import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const BASE_URL = 'https://fujiwarahaji.me';
const MUSIC_LIST_URL = `${BASE_URL}/sitemap/musiclist`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(str: string): string {
  if (!str) return '';
  return str
    .replace(/\s+/g, '')
    .replace(/[（\s\(]*M@STERVERSION[）\s\)]*/gi, '')
    .replace(/[（\s\(]*HYRVERSION[）\s\)]*/gi, '')
    .replace(/[（\s\(]*REM@STER-[A-Z][）\s\)]*/gi, '')
    .replace(/[（\s\(]*GAMEVERSION[）\s\)]*/gi, '')
    .replace(/[（\s\(]*Remix[）\s\)]*/gi, '')
    .replace(/[（\s\(]*Short[）\s\)]*/gi, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/["'”「」『』!！?？\-－—–~～+＋*＊.。,，_＿\/／\\＼★☆♥♡♪＊◆◇]/g, '')
    .toLowerCase()
    .trim();
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function updatePitches() {
  console.log('開始讀取 Google 試算表音域 CSV...');
  const csvPath = path.join(process.cwd(), 'data/pitch_data.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`找不到 CSV 檔案：${csvPath}`);
    return;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').slice(5);

  const sheetSongs: Array<{ title: string; norm: string; lowest: string; highest: string }> = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = parseCSVLine(line);
    if (parts.length < 5) continue;

    let title = parts[1]?.trim() || '';
    if (title.startsWith('"') && title.endsWith('"')) {
      title = title.slice(1, -1);
    }
    const lowest = parts[3]?.trim() || '';
    const highest = parts[4]?.trim() || '';

    if (!lowest && !highest) continue;

    sheetSongs.push({
      title,
      norm: normalize(title),
      lowest,
      highest
    });
  }

  console.log(`已從 CSV 解析出 ${sheetSongs.length} 首包含音域的歌曲。`);

  console.log('正在從資料庫獲取歌曲列表以更新音域...');
  const dbSongs = await prisma.song.findMany({
    select: { id: true, title: true }
  });
  console.log(`資料庫中目前有 ${dbSongs.length} 首歌曲。`);

  let updateCount = 0;
  for (const dbSong of dbSongs) {
    const dbNorm = normalize(dbSong.title);
    const match = sheetSongs.find((s) => s.norm === dbNorm);

    if (match) {
      await prisma.song.update({
        where: { id: dbSong.id },
        data: {
          lowestPitch: match.lowest,
          highestPitch: match.highest
        }
      });
      updateCount++;
    }
  }

  console.log(`成功更新了 ${updateCount} 首歌曲的音域資料！`);
}

async function scrapeAll() {
  console.log('正在獲取歌曲列表頁面...');
  try {
    const response = await axios.get(MUSIC_LIST_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    });
    
    const $ = cheerio.load(response.data);
    const songElements = $('.musiclist .listwrap .list-group-item');
    console.log(`總共找到 ${songElements.length} 首歌曲。`);

    console.log('正在從資料庫讀取已存在的歌曲...');
    const existingSongs = await prisma.song.findMany({ select: { slug: true } });
    const existingSlugs = new Set(existingSongs.map(s => s.slug));
    console.log(`資料庫中已有 ${existingSlugs.size} 首歌曲，將進行增量過濾。`);

    const limit = pLimit(15);
    const fetchTasks: Array<{ slug: string; title: string; brand: string; musicType: string; detailUrl: string }> = [];

    for (let i = 0; i < songElements.length; i++) {
      const el = songElements[i];
      const href = $(el).find('a').attr('href') || '';
      if (!href) continue;

      let pathVal = href;
      if (href.startsWith('http')) {
        try {
          const urlObj = new URL(href);
          pathVal = urlObj.pathname;
        } catch (e) {
          pathVal = href.replace(/https?:\/\/[^\/]+/, '');
        }
      }
      const rawPath = pathVal.replace(/^\/music\//, '').replace(/^music\//, '');
      const [brandMatch, idMatch] = [rawPath.match(/^([^\/]+)/), rawPath.match(/\/(\d+)$/)];
      const brandVal = brandMatch ? brandMatch[1] : 'unknown';
      const originalId = idMatch ? idMatch[1] : '0';
      const rawSlug = `${brandVal}/${originalId}`;
      const slug = crypto.createHash('md5').update(rawSlug).digest('hex');
      const title = $(el).find('a').text().trim();
      const brand = $(el).attr('data-brand') || '';
      const musicType = $(el).attr('data-musictype') || '';

      if (existingSlugs.has(slug)) {
        continue;
      }

      const detailUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      fetchTasks.push({ slug, title, brand, musicType, detailUrl });
    }

    console.log(`需要爬取的全新歌曲詳情頁面數：${fetchTasks.length}`);

    if (fetchTasks.length === 0) {
      console.log('無全新歌曲需要爬取，直接進入音域更新流程。');
      await updatePitches();
      return;
    }

    const songDetailsList: any[] = [];
    let completedCount = 0;

    const promises = fetchTasks.map((task) =>
      limit(async () => {
        try {
          await delay(100 + Math.random() * 150);
          const detailRes = await axios.get(task.detailUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          const d$ = cheerio.load(detailRes.data);

          let lyrics = '';
          let composer = '';
          let arranger = '';

          d$('table tr').each((_, tr) => {
            const label = d$(tr).find('td').first().text().trim();
            const val = d$(tr).find('td').last().text().trim();
            if (label.includes('作詞')) lyrics = val;
            if (label.includes('作曲')) composer = val;
            if (label.includes('編曲')) arranger = val;
          });

          const members: Array<{ name: string; cvName: string }> = [];
          const memberCards = d$('.idol_card .card');
          for (let m = 0; m < memberCards.length; m++) {
            const card = memberCards[m];
            const name = d$(card).find('h5').text().trim();
            const cvText = d$(card).find('p').text().trim();
            const cvName = cvText.replace('CV:', '').replace('CV', '').trim();
            if (name) {
              members.push({ name, cvName });
            }
          }

          songDetailsList.push({
            ...task,
            lyrics: lyrics || null,
            composer: composer || null,
            arranger: arranger || null,
            members
          });

          completedCount++;
          if (completedCount % 50 === 0 || completedCount === fetchTasks.length) {
            console.log(`[下載詳情] 已完成：${completedCount}/${fetchTasks.length}`);
          }
        } catch (err: any) {
          console.error(`下載歌曲詳情失敗 [${task.title}] (${task.slug}): ${err.message}`);
        }
      })
    );

    await Promise.all(promises);
    console.log(`詳情頁面下載完成，成功獲取 ${songDetailsList.length} 筆歌曲詳情。`);

    console.log('開始寫入資料庫（循序寫入以防 SQLite 鎖定）...');
    let saveCount = 0;
    for (const data of songDetailsList) {
      try {
        const song = await prisma.song.create({
          data: {
            slug: data.slug,
            title: data.title,
            brand: data.brand,
            musicType: data.musicType,
            lyrics: data.lyrics,
            composer: data.composer,
            arranger: data.arranger
          }
        });

        for (const m of data.members) {
          const dbMember = await prisma.member.upsert({
            where: { name: m.name },
            update: { cvName: m.cvName || null },
            create: { name: m.name, cvName: m.cvName || null }
          });

          await prisma.songMember.upsert({
            where: {
              songId_memberId: {
                songId: song.id,
                memberId: dbMember.id
              }
            },
            update: {},
            create: {
              songId: song.id,
              memberId: dbMember.id
            }
          });
        }

        saveCount++;
        if (saveCount % 100 === 0 || saveCount === songDetailsList.length) {
          console.log(`[寫入資料庫] 已完成：${saveCount}/${songDetailsList.length}`);
        }
      } catch (err: any) {
        console.error(`寫入資料庫失敗 [${data.title}]: ${err.message}`);
      }
    }

    console.log('資料庫寫入完成，開始執行音域更新對照...');
    await updatePitches();
    console.log('爬蟲與音域比對全部流程順利完成！');

  } catch (err: any) {
    console.error('爬蟲主流程異常:', err.message);
  }
}

scrapeAll()
  .catch((err) => console.error('腳本異常中斷:', err))
  .finally(() => prisma.$disconnect());
