import { PrismaClient } from '@prisma/client';
import { parseAppleTrackId } from '../lib/apple';

const prisma = new PrismaClient();

/**
 * 歌曲 Apple Music 曲目 ID 對照表（KAMISABI 出題機用）
 *
 * 只補「歌牌（KAMISABI 等）有收錄」的歌。格式同 seed-youtube-ids.ts：
 *   key   = 曲名（與 DB 的 Song.title 完全相同）
 *           也可以用 slug（例如 "ml/12087"）避免同名歌曲撞到
 *   value = Apple Music 分享連結 或 純數字 trackId 或 ''（確認 Apple Music 沒有這首）
 *
 * Apple Music 連結範例（兩種都可以）：
 *   https://music.apple.com/jp/album/ready-m-ster-version/1659357818?i=1659358253
 *   → 路徑上的 1659357818 是專輯 ID，?i= 後面的 1659358253 才是曲目 ID（script 會自動取 i=）
 *   https://music.apple.com/jp/song/raise-the-flag/1718726516
 *   → 「分享歌曲」產生的格式，最後一段就是曲目 ID
 *
 * 同一首歌通常會出現在多張專輯（單曲 / BEST 盤），挑哪個版本都可以，
 * 但請優先挑 Apple Music 上「可串流」的那張（能在 App 內完整播放的即是）。
 */
const appleTrackIdMap: Record<string, string> = {
  // "READY!!": "https://music.apple.com/jp/album/ready-m-ster-version/1659357818?i=1659358253",
  "Raise the FLAG": "https://music.apple.com/jp/song/raise-the-flag/1718726516",
  "ハルカナミライ": "https://music.apple.com/jp/song/%E3%83%8F%E3%83%AB%E3%82%AB%E3%83%8A%E3%83%9F%E3%83%A9%E3%82%A4/1718502566",
  "アライブファクター": "https://music.apple.com/jp/song/%E3%82%A2%E3%83%A9%E3%82%A4%E3%83%96%E3%83%95%E3%82%A1%E3%82%AF%E3%82%BF%E3%83%BC/1718502492",
  "深層マーメイド": "https://music.apple.com/jp/song/%E6%B7%B1%E5%B1%A4%E3%83%9E%E3%83%BC%E3%83%A1%E3%82%A4%E3%83%89/1718502898",
  // ---- 2026-09-24 歌牌背面 QR（kamisabi.lnk.to）解出的 Apple Music 連結；純數字的是 QR 解不到、改用 iTunes 搜尋比對演唱者取得 ----
  "ラビットファー": "1717730191",
  "Super Duper": "https://music.apple.com/jp/song/super-duper/1717754060",
  "百花は月下に散りぬるを": "https://music.apple.com/jp/song/1717753712",
  "ハーモニクス": "https://music.apple.com/jp/song/1717730231",
  "咲くは浮世の君花火": "https://music.apple.com/jp/song/1717732421",
  "花ざかりWeekend✿": "1717730507",
  "I.D ～EScape from Utopia～": "https://music.apple.com/jp/song/i-d-escape-from-utopia/1717733089",
  "ZETTAI × BREAK!! トゥインクルリズム": "https://music.apple.com/jp/song/1717730076",
  "NO CURRY NO LIFE": "https://music.apple.com/jp/song/no-curry-no-life/1718726438",
  "ジャングル☆パーティー": "1718502640",
  "Upper Dog": "https://music.apple.com/jp/song/upper-dog/1761314263",
  "SunRiser": "1751911146",
  "Dance in the Light": "1728576272",
  "春風満帆スターティング": "https://music.apple.com/jp/song/1728576798",
  "KING of SPADE": "https://music.apple.com/jp/song/king-of-spade/1718903434",
  "クルリウタ": "https://music.apple.com/jp/song/1717753948",
  "ABSOLUTE RUN!!!": "https://music.apple.com/jp/song/absolute-run/1717753906",
  "パンとフィルム": "https://music.apple.com/jp/song/1717753984",
  "Arrive You ～それが運命でも～": "https://music.apple.com/jp/song/1717753504",
  "Special Wonderful Smile": "https://music.apple.com/jp/song/special-wonderful-smile/1717753559",
  "Parade d'amour": "https://music.apple.com/jp/song/parade-damour/1717753336",
  "dans l'obscurité": "https://music.apple.com/jp/song/1717732968",
  "Supersonic Booster!": "https://music.apple.com/jp/song/supersonic-booster/1718502091",
  "ピコピコIIKO! インベーダー": "https://music.apple.com/jp/song/1717730036",
  "STANDING ALIVE": "https://music.apple.com/jp/song/standing-alive/1718674690",
  "ジレるハートに火をつけて": "https://music.apple.com/jp/song/1718675091",
  "HOME, SWEET FRIENDSHIP": "1718503226",
  "Eternal Harmony": "https://music.apple.com/jp/song/eternal-harmony/1718503327",
  "ココロがかえる場所": "1718726419",
  "瞳の中のシリウス": "https://music.apple.com/jp/song/1718726353",
  "カワラナイモノ": "https://music.apple.com/jp/song/1718726320",
  "Marionetteは眠らない": "1718726103",
  "Rat A Tat!!!": "https://music.apple.com/jp/song/rat-a-tat/1728576114",
  "蝶々むすび": "https://music.apple.com/jp/song/1823808552",
  "7Days A Week!!": "https://music.apple.com/jp/song/7days-a-week/1754541280",
  "グッドサイン": "https://music.apple.com/jp/song/1718502826",
  "Crossing!": "https://music.apple.com/jp/song/crossing/1718674780",
  "夢にかけるRainbow": "https://music.apple.com/jp/song/1718502057",
  "Harmony 4 You": "1718674819",
  "Glow Map": "https://music.apple.com/jp/song/glow-map/1718493149",
  "Flyers!!!": "https://music.apple.com/jp/song/flyers/1717732678",
  "UNION!!": "https://music.apple.com/jp/song/union/1718502108",
  "Brand New Theater!": "https://music.apple.com/jp/song/brand-new-theater/1717730397",
  "Dreaming!": "https://music.apple.com/jp/song/dreaming/1718501962",
  "Thank You!": "https://music.apple.com/jp/song/thank-you/1718501904",
  "Welcome!!": "https://music.apple.com/jp/song/welcome/1718503198",
};

async function main() {
  console.log('--- 開始更新歌曲 Apple Music 曲目 ID ---');
  let updateCount = 0;

  const entries = Object.entries(appleTrackIdMap);
  console.log(`對照表共 ${entries.length} 筆，開始寫入資料庫...\n`);

  for (const [key, raw] of entries) {
    const value = raw.trim();
    // '' = 明確標記「Apple Music 沒有」；否則要能解析出 trackId
    const appleTrackId = value === '' ? '' : parseAppleTrackId(value);

    if (appleTrackId === null) {
      console.warn(`[跳過] 「${key}」 的值無法解析成 Apple 曲目 ID：${raw}`);
      continue;
    }

    const where = key.includes('/') ? { slug: key } : { title: key };

    try {
      const result = await prisma.song.updateMany({ where, data: { appleTrackId } });

      if (result.count > 0) {
        console.log(`[更新成功] 「${key}」 -> appleTrackId: ${appleTrackId || '(無)'} (${result.count} 首)`);
        updateCount += result.count;
      } else {
        console.warn(`[找不到歌曲] 資料庫中找不到 「${key}」。`);
      }
    } catch (error: unknown) {
      console.error(`[更新失敗] 「${key}」 寫入錯誤: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n--- Apple Music 曲目 ID 更新完畢！共更新了 ${updateCount} 筆記錄 ---`);
}

main()
  .catch((e) => {
    console.error('執行 Seed 腳本時發生錯誤:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
