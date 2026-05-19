import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalize(str: string): string {
  if (!str) return '';
  return str
    .replace(/\s+/g, '') // Remove all whitespace
    .replace(/[（\s\(]*M@STERVERSION[）\s\)]*/gi, '')
    .replace(/[（\s\(]*HYRVERSION[）\s\)]*/gi, '')
    .replace(/[（\s\(]*REM@STER-[A-Z][）\s\)]*/gi, '')
    .replace(/[（\s\(]*GAMEVERSION[）\s\)]*/gi, '')
    .replace(/[（\s\(]*Remix[）\s\)]*/gi, '')
    .replace(/[（\s\(]*Short[）\s\)]*/gi, '')
    .replace(/\([^)]*\)/g, '') // Remove English parenthesis content
    .replace(/（[^）]*）/g, '') // Remove Japanese parenthesis content
    .replace(/["'”「」『』!！?？\-－—–~～+＋*＊.。,，_＿\/／\\＼★☆♥♡♪＊◆◇]/g, '') // Remove punctuation and special symbols
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

  console.log('正在從資料庫獲取歌曲列表...');
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

updatePitches()
  .catch((err) => console.error('更新音域腳本出錯:', err))
  .finally(() => prisma.$disconnect());
