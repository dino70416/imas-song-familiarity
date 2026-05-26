/**
 * seed-stress-users.ts
 *
 * 灌假會員 + 假公開歌單，用來壓測 /api/collab。
 *
 * 行為：
 * - 建立 N 個 stress_user_XX 帳號（已存在會略過）
 * - isPublic = true
 * - 每人從 Song 表隨機抽 100~1500 首歌，給隨機熟悉度 1~4
 * - 結束時印出 share codes，方便壓測直接用
 *
 * 用法：
 *   ts-node scripts/seed-stress-users.ts          # 預設 10 人
 *   ts-node scripts/seed-stress-users.ts 5        # 5 人
 *   ts-node scripts/seed-stress-users.ts -- --clean   # 先清掉舊 stress 用戶
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from './lib/prisma';

const NUM_USERS = Number(process.argv[2]) || 10;
const CLEAN = process.argv.includes('--clean');
const SONGS_MIN = 100;
const SONGS_MAX = 1500;

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleAndTake<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function main() {
  console.log(`[seed-stress] 開始 — 目標 ${NUM_USERS} 個壓測用戶（每人 ${SONGS_MIN}~${SONGS_MAX} 首）`);

  if (CLEAN) {
    const deleted = await prisma.user.deleteMany({
      where: { username: { startsWith: 'stress_user_' } },
    });
    console.log(`[seed-stress] 清掉 ${deleted.count} 個舊 stress 用戶`);
  }

  const allSongs = await prisma.song.findMany({ select: { id: true } });
  console.log(`[seed-stress] 母體歌曲池 ${allSongs.length} 首`);

  // 共用 bcrypt（壓測用戶不用真的登入）
  const sharedPasswordHash = await bcrypt.hash('stress-only', 4); // round 4 避免 hash 太慢

  const created: Array<{ username: string; shareCode: string; songCount: number }> = [];

  for (let i = 1; i <= NUM_USERS; i++) {
    const username = `stress_user_${String(i).padStart(2, '0')}`;
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      const cnt = await prisma.userSelection.count({ where: { userId: existing.id } });
      console.log(`[seed-stress] ${username} 已存在 (selections=${cnt})，略過`);
      created.push({ username, shareCode: existing.shareCode, songCount: cnt });
      continue;
    }

    const shareCode = crypto
      .createHash('sha256')
      .update(`${username}-${Date.now()}-${i}`)
      .digest('hex')
      .slice(0, 16);

    const songCount = randInt(SONGS_MIN, SONGS_MAX);
    const picked = shuffleAndTake(allSongs, songCount);

    // createMany 一次塞 selection 比一個一個 create 快很多
    const user = await prisma.user.create({
      data: {
        username,
        password: sharedPasswordHash,
        nickname: username,
        shareCode,
        themeColor: `#${randInt(0, 0xffffff).toString(16).padStart(6, '0')}`,
        isPublic: true,
      },
    });

    await prisma.userSelection.createMany({
      data: picked.map((s) => ({
        userId: user.id,
        songId: s.id,
        familiarity: randInt(1, 4),
      })),
      skipDuplicates: true,
    });

    created.push({ username, shareCode, songCount });
    console.log(`[seed-stress] ${username} → shareCode=${shareCode}, selections=${songCount}`);
  }

  console.log('\n[seed-stress] 完成。可直接拿這些 shareCode 壓 /api/collab：');
  for (const c of created) {
    console.log(`  ${c.username.padEnd(20)} ${c.shareCode}  (${c.songCount} 首)`);
  }

  const totalStressUsers = await prisma.user.count({ where: { username: { startsWith: 'stress_user_' } } });
  const totalStressSelections = await prisma.userSelection.count({
    where: { user: { username: { startsWith: 'stress_user_' } } },
  });
  console.log(`\n[seed-stress] 全表統計：stress 用戶 ${totalStressUsers}、stress selections ${totalStressSelections}`);
}

main()
  .catch((e) => {
    console.error('[seed-stress] 錯誤:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
