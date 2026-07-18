/**
 * audit-song-table.ts
 *
 * 把 Song 表的可疑資料寫成 backups/song-audit-<TS>.md (人類看) +
 * backups/song-audit-<TS>.csv (Excel 看)
 *
 * 涵蓋:
 *   - 真重複的 Song row (同 title + 同 brand)
 *   - 同名同日不同 brand (cover / 翻唱合理性檢查)
 *   - YouTube videoId 格式異常 (長度不是 11)
 *   - 沒 YouTube 連結的歌 (按 brand 拆,加 sample)
 *   - 多首歌共用同一 YouTube videoId
 *   - 空字串 vs NULL (資料正規化問題)
 */
import { prisma } from './lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

interface SongMin {
  id: string;
  slug: string;
  title: string;
  brand: string;
  musicType: string;
  composer: string | null;
  lyrics: string | null;
  arranger: string | null;
  youtubeIds: string | null;
  releaseDate: string | null;
  lowestPitch: string | null;
  highestPitch: string | null;
  _count?: { selections: number; members: number };
}

function brandShort(b: string) {
  return b.replace(/^music_/, '');
}

function csvEscape(s: any) {
  if (s === null || s === undefined) return '';
  const str = String(s);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const mdPath = path.join('backups', `song-audit-${TS}.md`);
  const csvPath = path.join('backups', `song-audit-${TS}.csv`);
  const csvNoYtPath = path.join('backups', `song-no-youtube-${TS}.csv`);
  const md: string[] = [];
  const allRows: any[] = []; // 主 CSV 用

  md.push(`# Song 表審計報告\n`);
  md.push(`產生時間: ${new Date().toISOString()}`);
  md.push(`資料來源: 本地 imas_song DB (mirror prod ${TS.slice(0, 10)})`);
  md.push('');

  // ============== Section 1: 真重複 row ==============
  md.push(`## 🔴 1. 完全重複的 Song row (同 title + 同 brand)`);
  md.push('');
  const dupTitles = await prisma.$queryRaw<{ title: string; brand: string; cnt: number }[]>`
    SELECT title, brand, COUNT(*)::int cnt
    FROM "Song" GROUP BY title, brand HAVING COUNT(*) > 1 ORDER BY cnt DESC, title
  `;
  md.push(`找到 ${dupTitles.length} 組,共 ${dupTitles.reduce((a, b) => a + b.cnt, 0)} 個 row`);
  md.push('');
  md.push('| Title | Brand | Row 數 | 各 row 細節 |');
  md.push('|---|---|---:|---|');
  for (const d of dupTitles) {
    const rows = await prisma.song.findMany({
      where: { title: d.title, brand: d.brand },
      include: { _count: { select: { selections: true, members: true } } },
    });
    const detail = rows
      .map(
        (r) =>
          `<br>• id=${r.id.slice(0, 8)} sel=${r._count.selections} mem=${r._count.members} composer=${r.composer ?? '∅'} yt=\`${(r.youtubeIds ?? '∅').slice(0, 40)}\``,
      )
      .join('');
    md.push(`| ${d.title} | ${brandShort(d.brand)} | ${d.cnt} | ${detail} |`);
    rows.forEach((r) =>
      allRows.push({
        category: 'real_duplicate',
        title: d.title,
        brand: d.brand,
        song_id: r.id,
        slug: r.slug,
        composer: r.composer,
        youtubeIds: r.youtubeIds,
        releaseDate: r.releaseDate,
        selections: r._count.selections,
        members: r._count.members,
        notes: '同 title + 同 brand 多筆',
      }),
    );
  }
  md.push('');

  // ============== Section 2: 同名同日不同 brand ==============
  md.push(`## 🟡 2. 同名同日不同 brand`);
  md.push('');
  const crossBrand = await prisma.$queryRaw<
    { title: string; releaseDate: string; brand_count: number; brands: string[] }[]
  >`
    SELECT title, "releaseDate"::text, COUNT(DISTINCT brand)::int brand_count, array_agg(brand ORDER BY brand) brands
    FROM "Song"
    WHERE "releaseDate" IS NOT NULL
    GROUP BY title, "releaseDate"
    HAVING COUNT(DISTINCT brand) > 1
    ORDER BY title
  `;
  md.push(`找到 ${crossBrand.length} 組`);
  md.push('');
  md.push('| Title | releaseDate | Brands | youtubeIds 是否相同 | composer 是否相同 |');
  md.push('|---|---|---|---|---|');
  for (const c of crossBrand) {
    const rows = await prisma.song.findMany({
      where: { title: c.title, releaseDate: c.releaseDate },
      orderBy: { brand: 'asc' },
    });
    const sameYt = new Set(rows.map((r) => r.youtubeIds)).size === 1 ? '✅' : '❌';
    const sameComp = new Set(rows.map((r) => r.composer)).size === 1 ? '✅' : '❌';
    md.push(`| ${c.title} | ${c.releaseDate} | ${rows.map((r) => brandShort(r.brand)).join('+')} | ${sameYt} | ${sameComp} |`);
    rows.forEach((r) =>
      allRows.push({
        category: 'cross_brand_same_date',
        title: r.title,
        brand: r.brand,
        song_id: r.id,
        slug: r.slug,
        composer: r.composer,
        youtubeIds: r.youtubeIds,
        releaseDate: r.releaseDate,
        notes: `同日 + ${c.brands.join('/')} 撞名`,
      }),
    );
  }
  md.push('');

  // ============== Section 3: YouTube videoId 格式異常 ==============
  md.push(`## 🔴 3. YouTube videoId 格式異常 (長度不是 11)`);
  md.push('');
  const badYtRaw = await prisma.$queryRaw<
    { id: string; title: string; brand: string; vid: string; len: number }[]
  >`
    WITH expanded AS (
      SELECT id, title, brand,
             TRIM(unnest(string_to_array("youtubeIds", ','))) AS vid
      FROM "Song"
      WHERE "youtubeIds" IS NOT NULL AND "youtubeIds" <> ''
    )
    SELECT id, title, brand, vid, LENGTH(vid)::int len
    FROM expanded
    WHERE vid !~ '^[a-zA-Z0-9_-]{11}$'
    ORDER BY title
  `;
  md.push(`找到 ${badYtRaw.length} 個格式錯誤的 videoId`);
  md.push('');
  md.push('| Title | Brand | 錯誤 videoId | 長度 | 問題 |');
  md.push('|---|---|---|---:|---|');
  for (const r of badYtRaw) {
    const issue = r.len < 11 ? `缺 ${11 - r.len} 字元` : `多 ${r.len - 11} 字元`;
    md.push(`| ${r.title} | ${brandShort(r.brand)} | \`${r.vid}\` | ${r.len} | ${issue} |`);
    allRows.push({
      category: 'bad_videoId',
      title: r.title,
      brand: r.brand,
      song_id: r.id,
      bad_vid: r.vid,
      vid_length: r.len,
      notes: issue,
    });
  }
  md.push('');

  // ============== Section 4: 共用 videoId ==============
  md.push(`## 🟡 4. 多首歌共用同一 YouTube videoId`);
  md.push('');
  md.push(`(remix 借用原曲 MV 是常見設計用法,這裡列出讓你判斷)`);
  md.push('');
  const sharedVids = await prisma.$queryRaw<
    { vid: string; cnt: number; titles_brands: string[] }[]
  >`
    WITH expanded AS (
      SELECT id, title, brand,
             TRIM(unnest(string_to_array("youtubeIds", ','))) AS vid
      FROM "Song"
      WHERE "youtubeIds" IS NOT NULL AND "youtubeIds" <> ''
    ),
    shared AS (
      SELECT vid, COUNT(*)::int cnt FROM expanded GROUP BY vid HAVING COUNT(*) > 1
    )
    SELECT s.vid, s.cnt, array_agg(e.brand || '/' || e.title ORDER BY e.title) titles_brands
    FROM shared s JOIN expanded e ON e.vid = s.vid
    GROUP BY s.vid, s.cnt
    ORDER BY s.cnt DESC, s.vid
  `;
  md.push(`找到 ${sharedVids.length} 個被多首歌共用的 videoId`);
  md.push('');
  md.push('| videoId | 共用數 | 標題列表 |');
  md.push('|---|---:|---|');
  for (const s of sharedVids.slice(0, 60)) {
    const list = s.titles_brands.join('<br>• ');
    md.push(`| \`${s.vid}\` | ${s.cnt} | • ${list} |`);
    s.titles_brands.forEach((tb) => {
      allRows.push({
        category: 'shared_videoId',
        title: tb.split('/').slice(1).join('/'),
        brand: tb.split('/')[0],
        videoId: s.vid,
        shared_count: s.cnt,
        notes: 'remix? 或誤抓?',
      });
    });
  }
  if (sharedVids.length > 60) md.push(`\n_(... 還有 ${sharedVids.length - 60} 個,完整在 CSV)_`);
  md.push('');

  // ============== Section 5: 沒 YouTube 連結 ==============
  md.push(`## 🟡 5. 沒 YouTube 連結的歌`);
  md.push('');
  const noYtByBrand = await prisma.$queryRaw<
    { brand: string; total: number; no_yt: number }[]
  >`
    SELECT brand, COUNT(*)::int total,
           COUNT(*) FILTER (WHERE "youtubeIds" IS NULL OR "youtubeIds" = '')::int no_yt
    FROM "Song" GROUP BY brand ORDER BY no_yt DESC
  `;
  md.push('| Brand | total | 缺 YT | 缺率 |');
  md.push('|---|---:|---:|---:|');
  let totalNoYt = 0;
  for (const r of noYtByBrand) {
    totalNoYt += r.no_yt;
    const pct = ((100 * r.no_yt) / r.total).toFixed(1);
    md.push(`| ${brandShort(r.brand)} | ${r.total} | ${r.no_yt} | ${pct}% |`);
  }
  md.push('');
  md.push(`完整清單(${totalNoYt} 首)寫進另一個 CSV: \`${path.basename(csvNoYtPath)}\``);
  md.push('');

  // 全部缺 YT 的歌 → 寫單獨 CSV
  const noYtSongs = await prisma.song.findMany({
    where: { OR: [{ youtubeIds: null }, { youtubeIds: '' }] },
    orderBy: [{ brand: 'asc' }, { title: 'asc' }],
  });
  const noYtCsv = [
    'brand,title,slug,releaseDate,composer,lyrics,musicType,song_id',
    ...noYtSongs.map((s) =>
      [
        s.brand,
        csvEscape(s.title),
        s.slug,
        s.releaseDate ?? '',
        csvEscape(s.composer),
        csvEscape(s.lyrics),
        s.musicType,
        s.id,
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(csvNoYtPath, noYtCsv);

  // ============== Section 6: empty string vs NULL ==============
  md.push(`## 🟢 6. youtubeIds 用空字串 vs NULL (資料正規化)`);
  const ytStat = await prisma.$queryRaw<{ nulls: number; empties: number; haveIds: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE "youtubeIds" IS NULL)::int nulls,
      COUNT(*) FILTER (WHERE "youtubeIds" = '')::int empties,
      COUNT(*) FILTER (WHERE "youtubeIds" IS NOT NULL AND "youtubeIds" <> '')::int "haveIds"
    FROM "Song"
  `;
  md.push(`- NULL: ${ytStat[0].nulls}`);
  md.push(`- 空字串: ${ytStat[0].empties}`);
  md.push(`- 有 ID: ${ytStat[0].haveIds}`);
  md.push('');
  md.push(`> 沒 YT 應該用 NULL,目前 ${ytStat[0].empties} 個空字串應正規化成 NULL`);
  md.push('');

  // ============== Section 7: 摘要 ==============
  md.push(`## 📊 摘要`);
  md.push('');
  md.push('| 類別 | 數量 | 嚴重度 |');
  md.push('|---|---:|---|');
  md.push(`| 完全重複的 Song row 對 | ${dupTitles.length} 組 / ${dupTitles.reduce((a, b) => a + b.cnt, 0)} rows | 🔴 |`);
  md.push(`| 同名同日不同 brand | ${crossBrand.length} 組 | 🟡 |`);
  md.push(`| YouTube videoId 格式錯 | ${badYtRaw.length} 首 | 🔴 |`);
  md.push(`| 沒 YouTube 連結 | ${totalNoYt} 首 (${((100 * totalNoYt) / 2563).toFixed(1)}%) | 🟡 |`);
  md.push(`| 多首歌共用 videoId | ${sharedVids.length} 個 vid | 🟡 |`);
  md.push(`| 空字串 youtubeIds (應 NULL) | ${ytStat[0].empties} 首 | 🟢 |`);
  md.push('');

  // 寫主 CSV
  const csvHeader = 'category,title,brand,song_id,slug,composer,youtubeIds,releaseDate,bad_vid,vid_length,videoId,shared_count,selections,members,notes';
  const csvRows = allRows.map((r) =>
    [
      r.category,
      csvEscape(r.title),
      r.brand ?? '',
      r.song_id ?? '',
      r.slug ?? '',
      csvEscape(r.composer),
      csvEscape(r.youtubeIds),
      r.releaseDate ?? '',
      r.bad_vid ?? '',
      r.vid_length ?? '',
      r.videoId ?? '',
      r.shared_count ?? '',
      r.selections ?? '',
      r.members ?? '',
      csvEscape(r.notes),
    ].join(','),
  );
  fs.writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'));
  fs.writeFileSync(mdPath, md.join('\n'));

  console.log(`Markdown: ${mdPath}`);
  console.log(`Main CSV: ${csvPath}`);
  console.log(`No-YouTube CSV: ${csvNoYtPath}`);
  console.log('');
  console.log(`類別摘要:`);
  console.log(`  真重複 row: ${dupTitles.length} 組`);
  console.log(`  同名同日跨 brand: ${crossBrand.length} 組`);
  console.log(`  videoId 格式錯: ${badYtRaw.length} 首`);
  console.log(`  沒 YT: ${totalNoYt} 首`);
  console.log(`  共用 vid: ${sharedVids.length} 個`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
