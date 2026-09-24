import { prisma } from './lib/prisma';

/**
 * 歌牌背面印的リリース日（2026-09-24 照實體卡片抄錄，50 首）。
 * 規則：時間軸模式的發行日以卡片為準；跟 Neon Song.releaseDate 不一致時用卡片的蓋過去。
 *
 *   npm run seed:card-dates            比對並覆寫不一致的
 *   npm run seed:card-dates -- --check 只比對不寫入
 */
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

async function main() {
  const checkOnly = process.argv.includes('--check');
  const titles = Object.keys(CARD_RELEASE_DATES);
  const songs = await prisma.song.findMany({ where: { brand: 'music_ml', title: { in: titles } }, select: { id: true, title: true, releaseDate: true } });
  const byTitle = new Map(songs.map((s) => [s.title, s]));

  let same = 0;
  let fixed = 0;
  for (const [title, card] of Object.entries(CARD_RELEASE_DATES)) {
    const song = byTitle.get(title);
    if (!song) {
      console.warn(`[找不到歌曲] ${title}`);
      continue;
    }
    if (song.releaseDate === card) {
      same++;
      continue;
    }
    console.log(`[不一致] ${title}：資料庫 ${song.releaseDate ?? '（沒有）'} → 卡片 ${card}${checkOnly ? '（--check，未寫入）' : ''}`);
    if (!checkOnly) {
      await prisma.song.update({ where: { id: song.id }, data: { releaseDate: card } });
      fixed++;
    }
  }
  console.log(`一致 ${same} / ${titles.length}${checkOnly ? '' : `，已用卡片日期覆寫 ${fixed} 首`}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
