/**
 * fix-876.ts (CLI wrapper)
 *
 * 主要邏輯抽到 lib/idolOverrides.ts 的 reclassify876()，
 * 這支只是讓使用者能單獨跑;sync-idols.ts 跑完也會自動 call 同一函式。
 */
import { prisma } from './lib/prisma';
import { reclassify876 } from '../lib/idolOverrides';

async function main() {
  console.log('[fix-876] 開始');
  const stats = await reclassify876(prisma);
  console.log(
    `[fix-876] 完成 — auto=${stats.autoMoved}, manual=${stats.manualMoved}, total production='876' = ${stats.total876}`,
  );
}

main()
  .catch((e) => {
    console.error('[fix-876] 致命錯誤:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
