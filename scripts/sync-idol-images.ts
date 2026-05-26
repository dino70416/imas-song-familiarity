/**
 * sync-idol-images.ts
 *
 * 從 fujiwarahaji.me 抓每個偶像的縮圖。
 *
 * 流程：
 *  1. 從 v4 /list?type=idol 拿全部偶像（含 link 詳細頁 URL）
 *  2. 對每個偶像 → fetch link → regex 抓 <img src=".../media/idol/.../*.png">
 *  3. 下載圖、用 sharp resize 成 96×96 WebP
 *  4. 存到 public/idol-images/{taxId}.webp
 *  5. 更新 Member.imagePath = "/idol-images/{taxId}.webp"
 *
 * DB 體積：只多 imagePath 一欄字串(~25 char/row)。
 * 磁碟：每張 ~3–8 KB,263 隻 ≈ 1.5 MB。
 *
 * 用法：
 *   npm run sync:idol-images           # 只抓還沒有圖的
 *   npm run sync:idol-images -- --force  # 重抓全部
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import pLimit from 'p-limit';
import { prisma } from './lib/prisma';

const UA =
  'imas-song-familiarity/0.3 (+https://github.com/parlayze/imas-song-familiarity)';
const LIST_URL = 'https://api.fujiwarahaji.me/v4/list?type=idol';
const IMG_DIR = path.join(process.cwd(), 'public', 'idol-images');
// 實測 sequential 100% 成功、CONCURRENCY=2 仍會被擋成 404 —
// 來源端 rate-limit 對短時間連發很嚴；用 1 慢慢來最穩
const CONCURRENCY = 1;
const REQ_DELAY = 200;
const MAX_RETRY = 2;
const THUMB_SIZE = 96; // 縮圖邊長

const FORCE = process.argv.includes('--force');

interface ListIdol {
  name: string;
  tax_id: number;
  link: string;
  production: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 15000,
    responseType: 'text',
  });
  return res.data as string;
}

/**
 * 從 idol 詳細頁 HTML 抓 idol 縮圖 URL。
 * fujiwarahaji.me 的偶像縮圖長相: /media/idol/{prod_dir}/{filename}.png
 */
function extractImageUrl(html: string): string | null {
  const m = html.match(
    /https?:\/\/fujiwarahaji\.me\/media\/idol\/[^"'\s)]+\.(?:png|jpe?g|webp)/i,
  );
  return m ? m[0] : null;
}

/** 從 buffer 前幾個 byte 推副檔名（修副檔名與內容不符的情況，如 .png 其實是 BMP）*/
function detectExt(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49) return 'gif';
  return 'png'; // fallback
}

async function downloadAndConvert(
  url: string,
  outPathWebp: string,
): Promise<{ originalBytes: number; outBytes: number; outPath: string }> {
  const res = await axios.get<ArrayBuffer>(url, {
    headers: { 'User-Agent': UA, Referer: 'https://fujiwarahaji.me/' },
    timeout: 20000,
    responseType: 'arraybuffer',
  });
  const buf = Buffer.from(res.data);
  try {
    await sharp(buf)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'top' })
      .webp({ quality: 80 })
      .toFile(outPathWebp);
    return {
      originalBytes: buf.length,
      outBytes: fs.statSync(outPathWebp).size,
      outPath: outPathWebp,
    };
  } catch (err: any) {
    // Sharp 不支援(BMP 等) → 直接存原檔，副檔名照 magic byte 修
    const ext = detectExt(buf);
    const rawPath = outPathWebp.replace(/\.webp$/, `.${ext}`);
    fs.writeFileSync(rawPath, buf);
    return {
      originalBytes: buf.length,
      outBytes: buf.length,
      outPath: rawPath,
    };
  }
}

async function main() {
  console.log(`[sync-idol-images] 開始 (force=${FORCE})`);

  if (!fs.existsSync(IMG_DIR)) {
    fs.mkdirSync(IMG_DIR, { recursive: true });
    console.log(`[sync-idol-images] 建目錄 ${IMG_DIR}`);
  }

  console.log('[sync-idol-images] 拉取偶像清單...');
  const listRes = await axios.get<ListIdol[]>(LIST_URL, {
    headers: { 'User-Agent': UA },
    timeout: 20000,
  });
  const idols = listRes.data;
  console.log(`[sync-idol-images] 共 ${idols.length} 個偶像`);

  // 從 DB 拿已有的 imagePath 資訊
  const dbMembers = await prisma.member.findMany({
    where: { taxId: { not: null } },
    select: { taxId: true, name: true, imagePath: true },
  });
  const dbByTaxId = new Map(dbMembers.map((m) => [m.taxId!, m]));

  let processed = 0;
  let skipped = 0;
  let fetched = 0;
  let failed = 0;
  let totalOriginal = 0;
  let totalOut = 0;

  const limit = pLimit(CONCURRENCY);
  const tasks = idols.map((idol) =>
    limit(async () => {
      processed++;
      const dbMember = dbByTaxId.get(idol.tax_id);
      if (!dbMember) {
        // DB 裡沒這個 taxId,sync-idols 沒同步到 → 跳過
        skipped++;
        return;
      }

      const outFile = `${idol.tax_id}.webp`;
      const outPath = path.join(IMG_DIR, outFile);
      const webPath = `/idol-images/${outFile}`;

      // 已抓過 + 檔還在 → skip
      if (!FORCE && dbMember.imagePath === webPath && fs.existsSync(outPath)) {
        skipped++;
        return;
      }

      try {
        await sleep(REQ_DELAY);
        let html: string | null = null;
        let lastErr: any = null;
        for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
          try {
            html = await fetchHtml(idol.link);
            break;
          } catch (err: any) {
            lastErr = err;
            // 404 / 429 / 5xx 大多是 rate-limit，往後 sleep 再試
            await sleep(700 * (attempt + 1));
          }
        }
        if (!html) throw lastErr;
        const imgUrl = extractImageUrl(html);
        if (!imgUrl) {
          console.warn(
            `[sync-idol-images] 沒在 ${idol.link} 找到圖,跳過 (${idol.name})`,
          );
          failed++;
          return;
        }
        const { originalBytes, outBytes, outPath: actualPath } =
          await downloadAndConvert(imgUrl, outPath);
        totalOriginal += originalBytes;
        totalOut += outBytes;
        // 如果 fallback 保存為非 webp,實際路徑也跟著變
        const actualWebPath = `/idol-images/${path.basename(actualPath)}`;
        await prisma.member.update({
          where: { taxId: idol.tax_id },
          data: { imagePath: actualWebPath },
        });
        fetched++;
        if (fetched % 25 === 0) {
          console.log(
            `[sync-idol-images] 進度 ${processed}/${idols.length} (fetched=${fetched}, skipped=${skipped}, failed=${failed})`,
          );
        }
      } catch (err: any) {
        failed++;
        console.error(
          `[sync-idol-images] FAIL ${idol.name} (taxId=${idol.tax_id}): ${err.message ?? err}`,
        );
      }
    }),
  );

  await Promise.all(tasks);

  console.log('\n[sync-idol-images] 完成統計:');
  console.log(`  總處理: ${processed}`);
  console.log(`  抓到並寫入: ${fetched}`);
  console.log(`  跳過(已有 / 沒對應 Member): ${skipped}`);
  console.log(`  失敗: ${failed}`);
  if (fetched > 0) {
    const kb = (b: number) => (b / 1024).toFixed(1);
    console.log(
      `  原檔總大小: ${kb(totalOriginal)} KB → 縮圖總大小: ${kb(totalOut)} KB (省 ${(((totalOriginal - totalOut) / totalOriginal) * 100).toFixed(1)}%)`,
    );
  }
}

main()
  .catch((e) => {
    console.error('[sync-idol-images] 致命錯誤:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
