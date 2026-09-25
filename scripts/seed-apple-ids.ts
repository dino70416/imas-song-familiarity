import { PrismaClient } from '@prisma/client';
import { parseAppleTrackId } from '../lib/apple';

const prisma = new PrismaClient();

/**
 * 歌曲 Apple Music 曲目 ID 對照表（KAMISABI 出題機用）
 *
 * 只補「歌牌（KAMISABI 等）有收錄」的歌。格式同 seed-youtube-ids.ts：
 *   key   = 曲名（與 DB 的 Song.title 完全相同）
 *           同名歌曲（跨品牌）撞到時改用 "slug:<Song.slug>"（含「/」的舊式 slug 也可直接當 key）
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
  // ---- 2026-09-26 シャイニーカラーズ歌牌（50 首）背面 QR 解出的 Apple Music 連結；
  //      Give me some more... / 拝啓タイムカプセル 的 QR 解不到，改用 iTunes 搜尋比對歌唱者與卡片日期取得。
  //      部分 QR 直接指向「2023 Ver.」版本（Black Reverie 等 6 首），照卡片連結收錄。----
  "無垢": "https://music.apple.com/jp/song/%E7%84%A1%E5%9E%A2/1778169039",
  "フェアリー・ガール": "https://music.apple.com/jp/song/%E3%83%95%E3%82%A7%E3%82%A2%E3%83%AA%E3%83%BC-%E3%82%AC%E3%83%BC%E3%83%AB/1734552368",
  "SOS": "https://music.apple.com/jp/song/sos/1734564170",
  "スローモーション": "https://music.apple.com/jp/song/%E3%82%B9%E3%83%AD%E3%83%BC%E3%83%A2%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3/1734552142",
  "アポイント・シグナル": "https://music.apple.com/jp/song/%E3%82%A2%E3%83%9D%E3%82%A4%E3%83%B3%E3%83%88-%E3%82%B7%E3%82%B0%E3%83%8A%E3%83%AB/1734555465",
  "Secret utopIA": "https://music.apple.com/jp/song/secret-utopia/1734555969",
  "相合学舎": "https://music.apple.com/jp/song/%E7%9B%B8%E5%90%88%E5%AD%A6%E8%88%8E/1734556469",
  "Killer×Mission": "https://music.apple.com/jp/song/killer-mission/1734557140",
  "泥濘鳴鳴": "https://music.apple.com/jp/song/%E6%B3%A5%E6%BF%98%E9%B3%B4%E9%B3%B4/1779614259",
  "Heads or Tails?": "https://music.apple.com/jp/song/heads-or-tails/1776583128",
  "ハナムケのハナタバ": "https://music.apple.com/jp/song/%E3%83%8F%E3%83%8A%E3%83%A0%E3%82%B1%E3%81%AE%E3%83%8F%E3%83%8A%E3%82%BF%E3%83%90/1737148956",
  "無自覚アプリオリ": "https://music.apple.com/jp/song/%E7%84%A1%E8%87%AA%E8%A6%9A%E3%82%A2%E3%83%97%E3%83%AA%E3%82%AA%E3%83%AA/1734552413",
  "Monochromatic": "https://music.apple.com/jp/song/monochromatic/1773459011",
  "Happier": "https://music.apple.com/jp/song/happier/1745451771",
  "Fashionable": "https://music.apple.com/jp/song/fashionable/1734550953",
  "OH MY GOD": "https://music.apple.com/jp/song/oh-my-god/1734552686",
  "いつかのキミへ": "https://music.apple.com/jp/song/%E3%81%84%E3%81%A4%E3%81%8B%E3%81%AE%E3%82%AD%E3%83%9F%E3%81%B8/1766923295",
  "Reflection": "https://music.apple.com/jp/song/reflection/1734551677",
  "アスファルトを鳴らして": "https://music.apple.com/jp/song/%E3%82%A2%E3%82%B9%E3%83%95%E3%82%A1%E3%83%AB%E3%83%88%E3%82%92%E9%B3%B4%E3%82%89%E3%81%97%E3%81%A6/1734550786",
  "いつだって僕らは": "https://music.apple.com/jp/song/%E3%81%84%E3%81%A4%E3%81%A0%E3%81%A3%E3%81%A6%E5%83%95%E3%82%89%E3%81%AF/1734552152",
  "Imitation Ghost": "https://music.apple.com/jp/song/imitation-ghost/1734552093",
  "Timeless Shooting Star": "https://music.apple.com/jp/song/timeless-shooting-star/1734552361",
  "Hide & Attack": "https://music.apple.com/jp/song/hide-attack/1734551534",
  "Wandering Dream Chaser": "https://music.apple.com/jp/song/wandering-dream-chaser/1734551808",
  "Give me some more...": "https://music.apple.com/jp/album/give-me-some-more/1734550590?i=1734550592",
  "Anniversary": "https://music.apple.com/jp/song/anniversary/1734551903",
  "アルストロメリア": "https://music.apple.com/jp/song/%E3%82%A2%E3%83%AB%E3%82%B9%E3%83%88%E3%83%AD%E3%83%A1%E3%83%AA%E3%82%A2/1734551409",
  "裸足じゃイラレナイ": "https://music.apple.com/jp/song/%E8%A3%B8%E8%B6%B3%E3%81%98%E3%82%83%E3%82%A4%E3%83%A9%E3%83%AC%E3%83%8A%E3%82%A4/1725132078",
  "拝啓タイムカプセル": "https://music.apple.com/jp/album/1734551569?i=1734551571",
  "ビーチブレイバー": "https://music.apple.com/jp/song/%E3%83%93%E3%83%BC%E3%83%81%E3%83%96%E3%83%AC%E3%82%A4%E3%83%90%E3%83%BC/1734552665",
  "夢咲きAfter School": "https://music.apple.com/jp/song/%E5%A4%A2%E5%92%B2%E3%81%8Dafter-school/1734551756",
  "時限式狂騒ワンダーランド": "https://music.apple.com/jp/song/%E6%99%82%E9%99%90%E5%BC%8F%E7%8B%82%E9%A8%92%E3%83%AF%E3%83%B3%E3%83%80%E3%83%BC%E3%83%A9%E3%83%B3%E3%83%89/1753379826",
  "愚者の独白": "https://music.apple.com/jp/song/%E6%84%9A%E8%80%85%E3%81%AE%E7%8B%AC%E7%99%BD/1734555069",
  "Black Reverie": "https://music.apple.com/jp/song/black-reverie-2023-ver/1734554437",
  "バベルシティ・グレイス": "https://music.apple.com/jp/song/%E3%83%90%E3%83%99%E3%83%AB%E3%82%B7%E3%83%86%E3%82%A3-%E3%82%B0%E3%83%AC%E3%82%A4%E3%82%B9-2023-ver/1734551413",
  "Shower of light": "https://music.apple.com/jp/song/shower-of-light/1787242273",
  "スマイルシンフォニア": "https://music.apple.com/jp/song/%E3%82%B9%E3%83%9E%E3%82%A4%E3%83%AB%E3%82%B7%E3%83%B3%E3%83%95%E3%82%A9%E3%83%8B%E3%82%A2/1734552519",
  "トライアングル": "https://music.apple.com/jp/song/%E3%83%88%E3%83%A9%E3%82%A4%E3%82%A2%E3%83%B3%E3%82%B0%E3%83%AB/1734552062",
  "ヒカリのdestination": "https://music.apple.com/jp/song/%E3%83%92%E3%82%AB%E3%83%AA%E3%81%AEdestination/1734551462",
  "Migratory Echoes": "https://music.apple.com/jp/song/migratory-echoes/1785014674",
  "プリズムフレア": "https://music.apple.com/jp/song/%E3%83%97%E3%83%AA%E3%82%BA%E3%83%A0%E3%83%95%E3%83%AC%E3%82%A2/1767335207",
  "ツバサグラビティ": "https://music.apple.com/jp/song/%E3%83%84%E3%83%90%E3%82%B5%E3%82%B0%E3%83%A9%E3%83%93%E3%83%86%E3%82%A3/1738371611",
  "C'mon! Join Us": "https://music.apple.com/jp/song/cmon-join-us/1775167773",
  "星の声": "https://music.apple.com/jp/song/%E6%98%9F%E3%81%AE%E5%A3%B0/1710326926",
  "虹の行方": "https://music.apple.com/jp/song/%E8%99%B9%E3%81%AE%E8%A1%8C%E6%96%B9/1734552828",
  "Resonance⁺": "https://music.apple.com/jp/song/resonance-2023-ver/1734551849",
  "シャイノグラフィ": "https://music.apple.com/jp/song/%E3%82%B7%E3%83%A3%E3%82%A4%E3%83%8E%E3%82%B0%E3%83%A9%E3%83%95%E3%82%A3-2023-ver/1734551273",
  "Ambitious Eve": "https://music.apple.com/jp/song/ambitious-eve-2023-ver/1734552350",
  "Spread the Wings!!": "https://music.apple.com/jp/song/spread-the-wings-2023-ver/1734551581",
  // メッセージ：シンデレラガールズ也有同名曲，用 slug 指定 SC（アルストロメリア）那首
  "slug:c6cf4f84b3ed0006c3730998d6f91c7e": "https://music.apple.com/jp/song/%E3%83%A1%E3%83%83%E3%82%BB%E3%83%BC%E3%82%B8/1734552459",
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

    const where = key.startsWith('slug:') ? { slug: key.slice(5) } : key.includes('/') ? { slug: key } : { title: key };

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
