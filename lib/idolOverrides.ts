/**
 * 偶像 production 人工 override + 自動重分類。
 *
 * 為什麼需要：
 * - fujiwarahaji /list?type=idol 把 vα-liv (876) 全部歸到 '765',
 *   `production='876'` 在 DB 從來不存在。
 * - 用「歌曲歸屬 brand 多數決」自動分類已能涵蓋大多數 (レトラ / 上水流宇宙 / 灯里愛夏 等),
 *   但有些案例(例如詩花 0 首 876 brand 歌曲)需要硬編。
 *
 * sync-idols 每次跑完會把 production 寫回上游值,所以需要 sync-idols 在最後也跑一次本檔
 * 的 reclassify876() 來重新覆蓋;否則重跑 sync 就會還原 vα-liv 偶像為 '765'。
 */
import type { PrismaClient } from '@prisma/client';

/** member.name → production. 強制覆蓋 (自動規則之上) */
export const PRODUCTION_OVERRIDES: Record<string, string> = {
  // vα-liv (876) — 詩花在 fujiwarahaji 沒有 0 首 876 brand 歌曲所以自動規則抓不到
  詩花: '876',
};

interface Reclassify876Stats {
  autoMoved: number;
  manualMoved: number;
  total876: number;
}

/**
 * 把 vα-liv 偶像重新歸到 production='876'。冪等。
 *
 * 步驟：
 *   1. 自動：member 唱的歌 >= 3 首且 >= 50% 屬 brand 'music_876' → 改 production = '876'
 *   2. 人工：PRODUCTION_OVERRIDES 強制覆蓋
 */
export async function reclassify876(
  prisma: PrismaClient,
  opts: { silent?: boolean } = {},
): Promise<Reclassify876Stats> {
  const log = opts.silent ? () => {} : (...a: any[]) => console.log(...a);
  const THRESHOLD = 0.5;
  const MIN_SONGS = 3;

  // Phase 1: 自動歸類
  const members = await prisma.member.findMany({
    include: { songs: { include: { song: { select: { brand: true } } } } },
  });
  let autoMoved = 0;
  for (const m of members) {
    const total = m.songs.length;
    if (total < MIN_SONGS) continue;
    const count876 = m.songs.filter((sm) => sm.song.brand === 'music_876').length;
    const ratio = count876 / total;
    if (ratio >= THRESHOLD && m.production !== '876') {
      await prisma.member.update({
        where: { id: m.id },
        data: { production: '876' },
      });
      autoMoved++;
      log(`[reclassify-876] auto: ${m.name} (${m.production ?? 'null'} → 876, ${count876}/${total} songs)`);
    }
  }

  // Phase 2: 人工 override
  let manualMoved = 0;
  for (const [name, prod] of Object.entries(PRODUCTION_OVERRIDES)) {
    const m = await prisma.member.findUnique({
      where: { name },
      select: { id: true, production: true },
    });
    if (!m) {
      log(`[reclassify-876] override 找不到 member: ${name}`);
      continue;
    }
    if (m.production === prod) continue;
    await prisma.member.update({
      where: { id: m.id },
      data: { production: prod },
    });
    manualMoved++;
    log(`[reclassify-876] manual: ${name} (${m.production ?? 'null'} → ${prod})`);
  }

  const total876 = await prisma.member.count({ where: { production: '876' } });
  return { autoMoved, manualMoved, total876 };
}
