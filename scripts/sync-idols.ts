/**
 * sync-idols.ts
 *
 * 從 fujiwarahaji.me v4 API (/list?type=idol) 同步全部偶像至 Member 表。
 *
 * 行為：
 * 1. 既有 Member（用 name 完全比對）→ 補上 taxId / production / kana / cvKana
 * 2. 找不到的新偶像 → create 新 Member
 * 3. 同名衝突由 unique(name) + unique(taxId) 自動防呆
 *
 * 冪等，可重複跑。
 */
import { listIdols } from './lib/api';
import { prisma } from './lib/prisma';

async function main() {
  console.log('[sync-idols] 拉取偶像列表...');
  const idols = await listIdols();
  console.log(`[sync-idols] 共 ${idols.length} 個偶像，開始寫入 DB`);

  let updated = 0;
  let created = 0;
  let skipped = 0;

  for (const idol of idols) {
    if (!idol.tax_id || !idol.name) {
      skipped++;
      continue;
    }

    const data = {
      name: idol.name,
      taxId: idol.tax_id,
      kana: idol.kana ?? null,
      cvName: idol.cv ?? null,
      cvKana: idol.cvkana ?? null,
      production: idol.production ?? null,
    };

    try {
      // 1. 優先用 taxId 找（理論上更穩）
      const byTaxId = await prisma.member.findUnique({
        where: { taxId: idol.tax_id },
      });
      if (byTaxId) {
        await prisma.member.update({
          where: { id: byTaxId.id },
          data: {
            name: data.name,
            kana: data.kana,
            cvName: data.cvName ?? byTaxId.cvName,
            cvKana: data.cvKana,
            production: data.production,
          },
        });
        updated++;
        continue;
      }

      // 2. 再用 name 找既有（爬蟲建立的 Member 還沒有 taxId）
      const byName = await prisma.member.findUnique({
        where: { name: idol.name },
      });
      if (byName) {
        await prisma.member.update({
          where: { id: byName.id },
          data: {
            taxId: data.taxId,
            kana: data.kana,
            cvName: data.cvName ?? byName.cvName,
            cvKana: data.cvKana,
            production: data.production,
          },
        });
        updated++;
        continue;
      }

      // 3. 全新偶像
      await prisma.member.create({ data });
      created++;
    } catch (err: any) {
      console.error(
        `[sync-idols] 處理 ${idol.name} (tax_id=${idol.tax_id}) 失敗:`,
        err.message,
      );
      skipped++;
    }
  }

  console.log(
    `[sync-idols] 完成 — 新增 ${created}、更新 ${updated}、略過 ${skipped}`,
  );

  // vα-liv (876) 自動重分類 — sync 寫回了上游的錯誤分類,這裡再修一次
  console.log('[sync-idols] 套用 vα-liv (876) 重分類...');
  const { reclassify876 } = await import('../lib/idolOverrides');
  const r = await reclassify876(prisma);
  console.log(
    `[sync-idols] 重分類完成 — auto=${r.autoMoved}, manual=${r.manualMoved}, total 876=${r.total876}`,
  );

  // 統計 production 分布
  const byProduction = await prisma.member.groupBy({
    by: ['production'],
    _count: true,
  });
  console.log('[sync-idols] production 分布:');
  for (const row of byProduction) {
    console.log(`  ${row.production ?? '(null)'}: ${row._count}`);
  }
}

main()
  .catch((err) => {
    console.error('[sync-idols] 中斷:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
