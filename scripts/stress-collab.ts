/**
 * stress-collab.ts
 *
 * 壓測 /api/collab — 依不同人數測平均回應時間。
 *
 * 用法：
 *   ts-node scripts/stress-collab.ts          # 預設 http://localhost:7650
 *   ts-node scripts/stress-collab.ts http://localhost:3001
 */
import { prisma } from './lib/prisma';

const BASE = process.argv[2] || 'http://localhost:7650';
const ROUNDS = 5; // 每組合測幾次取平均
const SIZES = [2, 5, 10, 20, 50]; // 比對人數

async function timeIt(shareCodes: string[]): Promise<{ ms: number; songCount: number; status: number; bytes: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/collab`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shareCodes }),
  });
  const body = await res.text();
  const ms = Date.now() - t0;
  let songCount = 0;
  try {
    const j = JSON.parse(body);
    songCount = Array.isArray(j.songs) ? j.songs.length : 0;
  } catch {}
  return { ms, songCount, status: res.status, bytes: body.length };
}

async function main() {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: 'stress_user_' } },
    select: { shareCode: true, _count: { select: { selections: true } } },
    orderBy: { username: 'asc' },
  });
  if (users.length === 0) {
    console.error('找不到 stress_user_* 用戶，先跑 seed-stress-users.ts');
    process.exit(1);
  }
  console.log(`找到 ${users.length} 個 stress 用戶（總 selections: ${users.reduce((s, u) => s + u._count.selections, 0)}）\n`);

  const shareCodes = users.map((u) => u.shareCode);

  console.log('開始壓測（每組合 ' + ROUNDS + ' 次取平均）...\n');
  console.log('users | rounds | min ms | avg ms | max ms | songs | bytes');
  console.log('------|--------|--------|--------|--------|-------|--------');

  for (const size of SIZES) {
    if (size > shareCodes.length) continue;
    const sliceCodes = shareCodes.slice(0, size);
    const times: number[] = [];
    let lastSongs = 0;
    let lastBytes = 0;
    for (let i = 0; i < ROUNDS; i++) {
      const r = await timeIt(sliceCodes);
      if (r.status !== 200) {
        console.error(`status ${r.status} on round ${i + 1}, shareCodes:`, sliceCodes);
        return;
      }
      times.push(r.ms);
      lastSongs = r.songCount;
      lastBytes = r.bytes;
    }
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
    console.log(
      `  ${String(size).padStart(2)} |   ${ROUNDS}    |  ${String(min).padStart(4)}  |  ${String(avg).padStart(4)}  |  ${String(max).padStart(4)}  | ${String(lastSongs).padStart(5)} | ${(lastBytes / 1024).toFixed(0).padStart(5)} KB`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
