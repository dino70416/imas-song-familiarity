/**
 * cleanup-member-table.ts
 *
 * 清掉 Member 表的「贓資料」:
 *   - Phase 1: 系列名 / CG 屬性類別 / SC unit 名 / 標籤 / 中文化標籤 → 直接刪
 *             (這些都沒掛 SongMember 也沒掛 UnitMember,純孤兒)
 *   - Phase 2: 反向資料 (cvName 含「役」,聲優被當偶像) → SongMember 重指向「正版」偶像 → 刪
 *
 * 用法:
 *   npx tsx scripts/cleanup-member-table.ts --dry-run   # 預演,不寫入
 *   npx tsx scripts/cleanup-member-table.ts             # 實打
 */
import { prisma } from './lib/prisma';

// Phase 1 — 直接刪除的贓資料 name list
const DELETE_BY_NAME = [
  // M-A 系列名稱被當 member (8)
  'アイドルマスター　SideM',
  'アイドルマスター　シンデレラガールズ',
  'アイドルマスター　ミリオンライブ！',
  'アイドルマスター　シャイニーカラーズ',
  'アイドルマスター XENOGLOSSIA',
  '学園アイドルマスター',
  'PROJECT IM@S vα-liv',
  // M-B CG 屬性類別被當 member (9)
  'Cute', 'Cool', 'Passion', 'Mental', 'Physical', 'Fairy', 'Princess', 'Angel', 'Intelli',
  // M-C Shiny Colors unit 被當 member (7)
  'CoMETIK', 'ALSTROEMERIA', 'illumination STARS', "L'Antica", 'noctchill', 'Straylight', 'SHHis',
  // M-D 「全体」 標籤 (1)
  '全体',
  // M-F 中文化標籤 (1)
  '偶像大师.KR',
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[cleanup-member] ${dryRun ? 'DRY RUN (不寫入)' : '實打模式'}`);
  console.log('');

  const before = await prisma.member.count();
  console.log(`Member 表起始 row 數: ${before}`);
  console.log('');

  // === Phase 1: 直接刪除清單 ===
  console.log('=== Phase 1: 直接刪除贓資料 (sc=0, uc=0 才會刪) ===');
  let p1Deleted = 0;
  let p1Skipped = 0;
  let p1NotFound = 0;
  for (const name of DELETE_BY_NAME) {
    const m = await prisma.member.findUnique({ where: { name } });
    if (!m) {
      console.log(`  (skip) name not found: ${name}`);
      p1NotFound++;
      continue;
    }
    const sc = await prisma.songMember.count({ where: { memberId: m.id } });
    const uc = await prisma.unitMember.count({ where: { memberId: m.id } });
    if (sc > 0 || uc > 0) {
      console.warn(`  ⚠ ${name} 有引用 (sc=${sc}, uc=${uc}) — 拒絕刪`);
      p1Skipped++;
      continue;
    }
    if (!dryRun) {
      await prisma.member.delete({ where: { id: m.id } });
    }
    console.log(`  ${dryRun ? '[dry] 將刪' : '已刪'}: ${name}`);
    p1Deleted++;
  }
  console.log(`  Phase 1 統計: 刪 ${p1Deleted}、跳過 ${p1Skipped}、找不到 ${p1NotFound}`);
  console.log('');

  // === Phase 2: 合併反向資料 ===
  console.log('=== Phase 2: 反向資料 merge (聲優當偶像 → 真偶像) ===');
  const reverse = await prisma.member.findMany({
    where: { cvName: { contains: '役' } },
    select: { id: true, name: true, cvName: true },
  });
  console.log(`  找到反向 row: ${reverse.length}`);

  let p2Merged = 0;
  let p2NoCanonical = 0;
  let totalReassigned = 0;
  let totalAlreadyExist = 0;
  for (const r of reverse) {
    const canonicalName = r.cvName!.replace(/役$/, '').trim();
    const canonical = await prisma.member.findUnique({ where: { name: canonicalName } });
    if (!canonical) {
      console.warn(`  ⚠ 找不到正版 [${canonicalName}] (反向:${r.name} cv=${r.cvName}) — skip`);
      p2NoCanonical++;
      continue;
    }

    // 反向 row 上掛的所有 SongMember
    const reverseSongMembers = await prisma.songMember.findMany({
      where: { memberId: r.id },
    });
    let reassigned = 0;
    let alreadyExists = 0;
    for (const sm of reverseSongMembers) {
      // 看「正版 member 是否已經有這首歌的 SongMember」
      const dup = await prisma.songMember.findUnique({
        where: { songId_memberId: { songId: sm.songId, memberId: canonical.id } },
      });
      if (dup) {
        // 正版已經有了 → 直接刪反向 row 上的 entry
        if (!dryRun) {
          await prisma.songMember.delete({
            where: { songId_memberId: { songId: sm.songId, memberId: r.id } },
          });
        }
        alreadyExists++;
      } else {
        // 重新指向正版
        if (!dryRun) {
          await prisma.songMember.delete({
            where: { songId_memberId: { songId: sm.songId, memberId: r.id } },
          });
          await prisma.songMember.create({
            data: { songId: sm.songId, memberId: canonical.id },
          });
        }
        reassigned++;
      }
    }

    // 同樣處理 UnitMember (反向 row 理論上不會掛 unit,保險檢查)
    const reverseUnitMembers = await prisma.unitMember.findMany({ where: { memberId: r.id } });
    if (reverseUnitMembers.length > 0) {
      console.warn(`  ⚠ 反向 ${r.name} 居然掛在 unit 上 (${reverseUnitMembers.length}) — 強制 skip 留你手動處理`);
      continue;
    }

    // 反向 row 上的 SongMember 已清完,刪它
    if (!dryRun) {
      await prisma.member.delete({ where: { id: r.id } });
    }
    console.log(
      `  ${dryRun ? '[dry]' : '✓'} ${r.name} (cv=${r.cvName}) → ${canonical.name}: 重指 ${reassigned}、正版已有 ${alreadyExists}`,
    );
    p2Merged++;
    totalReassigned += reassigned;
    totalAlreadyExist += alreadyExists;
  }
  console.log(
    `  Phase 2 統計: merge ${p2Merged}、找不到正版 ${p2NoCanonical}、總重指 ${totalReassigned}、總正版已有 ${totalAlreadyExist}`,
  );
  console.log('');

  // === Summary ===
  const after = await prisma.member.count();
  console.log('=== 總結 ===');
  console.log(`Member 表 ${before} → ${after} (${dryRun ? '(dry, 沒改)' : `刪了 ${before - after}`})`);
  if (dryRun) {
    console.log(`  預期刪除: ${p1Deleted + p2Merged} (Phase1=${p1Deleted}, Phase2=${p2Merged})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
