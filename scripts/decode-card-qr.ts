/**
 * 解析歌牌背面照片的 QR code，追到最後的播放連結，抓出 Apple Music 曲目 ID。
 *
 *   npm run decode:card-qr -- photos/card1.jpg photos/card2.jpg
 *
 * 每張照片：sharp 轉灰階、縮放成幾種尺寸 → jsQR 解碼（QR 不一定要正、可倒色）
 * → fetch 連結跟隨轉址；若落地頁不是 Apple Music（例如 lnk.to 之類的聚合頁），
 *   再從 HTML 裡找 music.apple.com 的連結。
 * 最後印出可以直接貼進 scripts/seed-apple-ids.ts 的值。
 * 只在本機跑，不會寫資料庫。
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { parseAppleTrackId } from '../lib/apple';

const WIDTHS = [1200, 1800, 800, 2400];

async function decodeQr(file: string): Promise<string | null> {
  const meta = await sharp(file).rotate().metadata();
  const widths = [...new Set([meta.width ?? 1200, ...WIDTHS])].filter((w) => w <= (meta.width ?? Infinity) * 2);
  for (const width of widths) {
    // jsQR 吃 RGBA（4 通道），內部自己轉灰階；這裡只補 alpha，不要先 grayscale（會變 2 通道）
    const { data, info } = await sharp(file).rotate().resize({ width, withoutEnlargement: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw new Error(`預期 4 通道，拿到 ${info.channels}`);
    const hit = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: 'attemptBoth' });
    if (hit?.data) return hit.data;
  }
  return null;
}

async function resolveApple(url: string): Promise<{ finalUrl: string; appleUrl: string | null; trackId: string | null }> {
  // QR 本身就是 Apple Music 連結 → 不用連網
  const own = parseAppleTrackId(url);
  if (own) return { finalUrl: url, appleUrl: url, trackId: own };
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (card-qr-decoder)' } });
  const finalUrl = res.url || url;
  const direct = parseAppleTrackId(finalUrl);
  if (direct) return { finalUrl, appleUrl: finalUrl, trackId: direct };
  const html = await res.text();
  const links = [...new Set(html.match(/https?:\/\/(?:music|geo\.music|itunes)\.apple\.com\/[^\s"'<>)]+/g) ?? [])];
  for (const link of links) {
    const decoded = link.replace(/&amp;/g, '&');
    const id = parseAppleTrackId(decoded);
    if (id) return { finalUrl, appleUrl: decoded, trackId: id };
  }
  return { finalUrl, appleUrl: links[0] ?? null, trackId: null };
}

async function main() {
  const files = process.argv.slice(2).filter((f) => !f.startsWith('--'));
  if (files.length === 0) {
    console.log('用法：npm run decode:card-qr -- <照片1> <照片2> ...');
    return;
  }
  const rows: { file: string; qr: string | null; finalUrl?: string; appleUrl?: string | null; trackId?: string | null; error?: string }[] = [];
  for (const file of files) {
    const row: (typeof rows)[number] = { file: path.basename(file), qr: null };
    rows.push(row);
    if (!fs.existsSync(file)) { row.error = '檔案不存在'; continue; }
    try {
      row.qr = await decodeQr(file);
      if (!row.qr) { row.error = '解不到 QR（試試拍近一點、避免反光）'; continue; }
      if (/^https?:\/\//i.test(row.qr)) Object.assign(row, await resolveApple(row.qr));
      else row.error = 'QR 內容不是網址';
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
    }
  }

  console.log('\n=== 結果 ===');
  for (const r of rows) {
    console.log(`\n${r.file}`);
    console.log(`  QR:         ${r.qr ?? '-'}`);
    if (r.finalUrl && r.finalUrl !== r.qr) console.log(`  落地頁:     ${r.finalUrl}`);
    console.log(`  Apple:      ${r.appleUrl ?? '-'}`);
    console.log(`  trackId:    ${r.trackId ?? '-'}`);
    if (r.error) console.log(`  ⚠ ${r.error}`);
  }
  const ok = rows.filter((r) => r.trackId);
  if (ok.length) {
    console.log('\n=== 貼進 scripts/seed-apple-ids.ts（把左邊換成曲名）===');
    for (const r of ok) console.log(`  "${r.file}": "${r.appleUrl}",`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
