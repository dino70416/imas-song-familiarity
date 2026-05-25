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
    .replace(/[\"'"「」『』!！?？\-－—–~～+＋*＊.。,，_＿\/／\\＼★☆♥♡♪＊◆◇]/g, '')
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

/**
 * 從 YouTube nocookie embed URL 或 arve id 屬性中提取 video ID。
 * 支援的格式：
 *   - https://www.youtube-nocookie.com/embed/VIDEO_ID?...
 *   - https://www.youtube.com/embed/VIDEO_ID?...
 *   - arve 元素 id 格式：arve-youtube-VIDEO_ID
 */
function extractYouTubeId(raw: string): string | null {
  // 從 embed URL 提取
  const embedMatch = raw.match(/youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  // 從 arve id 屬性提取：arve-youtube-{videoId}
  const arveMatch = raw.match(/arve-youtube-([a-zA-Z0-9_-]{11})$/);
  if (arveMatch) return arveMatch[1];

  return null;
}

/**
 * 從歌曲詳情頁的 HTML 中提取所有公式動画的 YouTube video ID（去重）。
 * 結構：
 *   <div class="msgbox" id="movie">
 *     <select name="focus">
 *       <option value="movie_0">ミリシタMV</option>
 *       <option value="movie_1">フル MV</option>
 *     </select>
 *     <div data-focus="movie_0">
 *       <div id="arve-youtube-{videoId}" data-provider="youtube">
 *         <iframe src="https://www.youtube-nocookie.com/embed/{videoId}?...">
 *
 * 一首歌可能有 0 個（無公式動画）到 N 個影片。
 */
function parseYouTubeIds(d$: cheerio.CheerioAPI): string[] {
  const ids = new Set<string>();

  // 方法 1：從 iframe src 提取（防止 arve id 將 ID 轉為全小寫，破壞 YouTube 的大小寫敏感性）
  d$('#movie iframe').each((_, el) => {
    const src = d$(el).attr('src') || d$(el).attr('data-src-no-ap') || '';
    const vid = extractYouTubeId(src);
    if (vid) ids.add(vid);
  });

  return Array.from(ids);
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
    const existingSongs = await prisma.song.findMany({ select: { slug: true, youtubeIds: true } });
    const existingSlugs = new Set(existingSongs.map(s => s.slug));
    // 已有 YouTube 資料的 slug（不需要重新抓）
    const slugsWithYoutube = new Set(existingSongs.filter(s => s.youtubeIds !== null).map(s => s.slug));
    console.log(`資料庫中已有 ${existingSlugs.size} 首歌曲，其中 ${slugsWithYoutube.size} 首已有 YouTube 資料。`);

    const limit = pLimit(15);

    // ── 任務 A：全新歌曲（不在 DB 裡）────────────────────────────────────
    const newSongTasks: Array<{ slug: string; title: string; brand: string; musicType: string; detailUrl: string }> = [];
    // ── 任務 B：已在 DB 但 youtubeIds 為 null 的歌曲（需補抓）────────────
    const youtubeUpdateTasks: Array<{ slug: string; detailUrl: string }> = [];

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
      const detailUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

      if (!existingSlugs.has(slug)) {
        // 全新歌曲
        newSongTasks.push({ slug, title, brand, musicType, detailUrl });
      } else if (!slugsWithYoutube.has(slug)) {
        // 已存在但缺 YouTube 資料
        youtubeUpdateTasks.push({ slug, detailUrl });
      }
    }

    console.log(`全新歌曲需爬取：${newSongTasks.length} 首`);
    console.log(`已存在但缺 YouTube 連結需補抓：${youtubeUpdateTasks.length} 首`);

    // ── 處理全新歌曲 ────────────────────────────────────────────────────
    if (newSongTasks.length > 0) {
      const songDetailsList: any[] = [];
      let completedCount = 0;

      const promises = newSongTasks.map((task) =>
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

            // 抓公式動画 YouTube ID
            const youtubeIds = parseYouTubeIds(d$);

            songDetailsList.push({
              ...task,
              lyrics: lyrics || null,
              composer: composer || null,
              arranger: arranger || null,
              members,
              youtubeIds: youtubeIds.length > 0 ? youtubeIds.join(',') : null,
            });

            completedCount++;
            if (completedCount % 50 === 0 || completedCount === newSongTasks.length) {
              console.log(`[下載新歌詳情] 已完成：${completedCount}/${newSongTasks.length}`);
            }
          } catch (err: any) {
            console.error(`下載歌曲詳情失敗 [${task.title}] (${task.slug}): ${err.message}`);
          }
        })
      );

      await Promise.all(promises);
      console.log(`新歌詳情下載完成，成功獲取 ${songDetailsList.length} 筆。`);

      console.log('開始寫入資料庫（循序寫入）...');
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
              arranger: data.arranger,
              youtubeIds: data.youtubeIds,
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
      console.log('新歌寫入完成。');
    }

    // ── 補抓現有歌曲的 YouTube 連結 ─────────────────────────────────────
    if (youtubeUpdateTasks.length > 0) {
      console.log(`\n開始補抓 ${youtubeUpdateTasks.length} 首歌曲的 YouTube 連結...`);

      type YouTubeResult = { slug: string; youtubeIds: string | null };
      const results: YouTubeResult[] = [];
      let doneCount = 0;

      const updatePromises = youtubeUpdateTasks.map((task) =>
        limit(async () => {
          try {
            await delay(100 + Math.random() * 150);
            const detailRes = await axios.get(task.detailUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            const d$ = cheerio.load(detailRes.data);
            const ids = parseYouTubeIds(d$);

            results.push({
              slug: task.slug,
              // 就算 ids 為空，也要標記成空字串以示「已確認抓過，該歌無公式動画」
              // 若維持 null 則下次跑腳本還會重新抓
              youtubeIds: ids.length > 0 ? ids.join(',') : '',
            });

            doneCount++;
            if (doneCount % 100 === 0 || doneCount === youtubeUpdateTasks.length) {
              console.log(`[補抓 YouTube] 已完成：${doneCount}/${youtubeUpdateTasks.length}`);
            }
          } catch (err: any) {
            console.error(`補抓 YouTube 失敗 [${task.slug}]: ${err.message}`);
          }
        })
      );

      await Promise.all(updatePromises);
      console.log(`補抓完成，共取得 ${results.length} 筆結果，開始寫入資料庫...`);

      let updateCount = 0;
      for (const r of results) {
        try {
          await prisma.song.update({
            where: { slug: r.slug },
            data: { youtubeIds: r.youtubeIds },
          });
          updateCount++;
          if (updateCount % 200 === 0 || updateCount === results.length) {
            console.log(`[更新 YouTube] 已完成：${updateCount}/${results.length}`);
          }
        } catch (err: any) {
          console.error(`更新 youtubeIds 失敗 [${r.slug}]: ${err.message}`);
        }
      }

      const withVideo = results.filter(r => r.youtubeIds && r.youtubeIds.length > 0).length;
      console.log(`YouTube 連結更新完成：${updateCount} 筆寫入，其中 ${withVideo} 首有公式動画。`);
    }

    console.log('\n資料庫寫入完成，開始執行音域更新對照...');
    await updatePitches();
    console.log('爬蟲與音域比對全部流程順利完成！');

  } catch (err: any) {
    console.error('爬蟲主流程異常:', err.message);
  }
}

scrapeAll()
  .catch((err) => console.error('腳本異常中斷:', err))
  .finally(() => prisma.$disconnect());
