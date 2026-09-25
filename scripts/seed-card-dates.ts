import { prisma } from './lib/prisma';

/**
 * 歌牌背面印的リリース日（依品牌分表，曲名對該品牌的 Song.title）。
 * 規則：時間軸模式的發行日以卡片為準；跟 Neon Song.releaseDate 不一致時用卡片的蓋過去。
 *
 *   npm run seed:card-dates            比對並覆寫不一致的
 *   npm run seed:card-dates -- --check 只比對不寫入
 */

/** ミリオンライブ！歌牌 50 首（2026-09-24 照實體卡片抄錄） */
export const CARD_RELEASE_DATES: Record<string, string> = {
  'ラビットファー': '2019-09-25',
  'Super Duper': '2020-03-25',
  '百花は月下に散りぬるを': '2020-02-26',
  'ハーモニクス': '2018-12-26',
  '咲くは浮世の君花火': '2018-07-25',
  '花ざかりWeekend✿': '2018-06-27',
  'I.D ～EScape from Utopia～': '2018-05-30',
  'ZETTAI × BREAK!! トゥインクルリズム': '2018-04-25',
  'Raise the FLAG': '2017-01-11',
  'NO CURRY NO LIFE': '2016-12-07',
  'ジャングル☆パーティー': '2016-03-23',
  'Upper Dog': '2024-08-28',
  'SunRiser': '2024-06-26',
  'Dance in the Light': '2023-09-27',
  '春風満帆スターティング': '2023-05-31',
  'KING of SPADE': '2022-10-26',
  'クルリウタ': '2020-07-29',
  'ABSOLUTE RUN!!!': '2021-06-23',
  'パンとフィルム': '2021-04-21',
  'Arrive You ～それが運命でも～': '2021-01-27',
  'Special Wonderful Smile': '2020-12-23',
  "Parade d'amour": '2020-09-23',
  "dans l'obscurité": '2019-08-28',
  'Supersonic Booster!': '2023-02-22',
  'ピコピコIIKO! インベーダー': '2019-04-24',
  'STANDING ALIVE': '2015-03-25',
  'ジレるハートに火をつけて': '2014-11-26',
  'HOME, SWEET FRIENDSHIP': '2014-11-26',
  'Eternal Harmony': '2014-09-24',
  'ココロがかえる場所': '2014-03-26',
  '瞳の中のシリウス': '2014-01-29',
  'カワラナイモノ': '2013-10-30',
  'Marionetteは眠らない': '2013-09-25',
  'Rat A Tat!!!': '2023-08-23',
  '蝶々むすび': '2025-07-30',
  '7Days A Week!!': '2024-07-31',
  'グッドサイン': '2023-07-26',
  'Crossing!': '2023-03-22',
  '夢にかけるRainbow': '2022-07-27',
  'Harmony 4 You': '2021-07-28',
  'Glow Map': '2020-08-26',
  'Flyers!!!': '2019-07-24',
  'UNION!!': '2018-08-29',
  'Brand New Theater!': '2017-07-26',
  'Dreaming!': '2015-09-30',
  'Thank You!': '2013-04-24',
  '深層マーメイド': '2015-12-23',
  'Welcome!!': '2014-07-30',
  'アライブファクター': '2015-12-02',
  'ハルカナミライ': '2015-10-28',
};

/** シャイニーカラーズ歌牌 50 首（2026-09-26 照實體卡片照片抄錄） */
export const CARD_RELEASE_DATES_SHINY: Record<string, string> = {
  '無垢': '2024-12-04',
  'フェアリー・ガール': '2023-07-26',
  'SOS': '2021-03-10',
  'スローモーション': '2021-02-17',
  'アポイント・シグナル': '2021-01-20',
  'Secret utopIA': '2022-04-23',
  '相合学舎': '2022-04-23',
  'Killer×Mission': '2022-04-23',
  '泥濘鳴鳴': '2024-12-11',
  'Heads or Tails?': '2024-11-27',
  'ハナムケのハナタバ': '2024-04-03',
  '無自覚アプリオリ': '2023-11-08',
  'Monochromatic': '2024-11-13',
  'Happier': '2024-05-22',
  'Fashionable': '2022-11-16',
  'OH MY GOD': '2021-11-10',
  'いつかのキミへ': '2024-10-09',
  'Reflection': '2023-09-13',
  'アスファルトを鳴らして': '2022-10-12',
  'いつだって僕らは': '2020-09-16',
  'Imitation Ghost': '2023-08-09',
  'Timeless Shooting Star': '2021-09-08',
  'Hide & Attack': '2020-08-19',
  'Wandering Dream Chaser': '2019-09-11',
  'Give me some more...': '2022-08-10',
  'Anniversary': '2020-12-09',
  'アルストロメリア': '2018-10-03',
  '裸足じゃイラレナイ': '2024-01-24',
  '拝啓タイムカプセル': '2021-07-14',
  'ビーチブレイバー': '2019-07-10',
  '夢咲きAfter School': '2018-09-05',
  '時限式狂騒ワンダーランド': '2024-07-24',
  '愚者の独白': '2022-06-15',
  'Black Reverie': '2020-11-04',
  'バベルシティ・グレイス': '2018-08-01',
  'Shower of light': '2025-01-29',
  'スマイルシンフォニア': '2021-05-19',
  'トライアングル': '2019-05-08',
  'ヒカリのdestination': '2018-07-04',
  'Migratory Echoes': '2025-01-22',
  'プリズムフレア': '2024-10-09',
  'ツバサグラビティ': '2024-04-10',
  "C'mon! Join Us": '2024-11-20',
  '星の声': '2023-10-18',
  '虹の行方': '2022-04-13',
  'Resonance⁺': '2021-04-14',
  'シャイノグラフィ': '2020-04-08',
  'Ambitious Eve': '2019-04-10',
  'Spread the Wings!!': '2018-06-06',
  'メッセージ': '2023-07-12',
};

const BRANDS: [string, Record<string, string>][] = [
  ['music_ml', CARD_RELEASE_DATES],
  ['music_shiny', CARD_RELEASE_DATES_SHINY],
];

async function main() {
  const checkOnly = process.argv.includes('--check');
  let same = 0;
  let fixed = 0;
  let total = 0;
  for (const [brand, dates] of BRANDS) {
    const titles = Object.keys(dates);
    total += titles.length;
    const songs = await prisma.song.findMany({ where: { brand, title: { in: titles } }, select: { id: true, title: true, releaseDate: true } });
    const byTitle = new Map(songs.map((s) => [s.title, s]));

    for (const [title, card] of Object.entries(dates)) {
      const song = byTitle.get(title);
      if (!song) {
        console.warn(`[找不到歌曲] ${brand} ${title}`);
        continue;
      }
      if (song.releaseDate === card) {
        same++;
        continue;
      }
      console.log(`[不一致] ${brand} ${title}：資料庫 ${song.releaseDate ?? '（沒有）'} → 卡片 ${card}${checkOnly ? '（--check，未寫入）' : ''}`);
      if (!checkOnly) {
        await prisma.song.update({ where: { id: song.id }, data: { releaseDate: card } });
        fixed++;
      }
    }
  }
  console.log(`一致 ${same} / ${total}${checkOnly ? '' : `，已用卡片日期覆寫 ${fixed} 首`}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
