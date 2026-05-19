import { expect, test, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let testUserId: string;
let testSongId: string;

beforeAll(async () => {
  // 建立測試使用者
  const username = `testuser_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      username,
      password: 'password123',
      nickname: username,
      shareCode: `code_${Date.now()}`,
    },
  });
  testUserId = user.id;

  // 建立測試歌曲
  const song = await prisma.song.create({
    data: {
      slug: `test/song_${Date.now()}`,
      title: 'Test Song',
      brand: 'music_ml',
      musicType: 'solo',
    },
  });
  testSongId = song.id;
});

afterAll(async () => {
  // 清理測試資料
  await prisma.userSelection.deleteMany({
    where: { userId: testUserId },
  });
  await prisma.song.delete({
    where: { id: testSongId },
  });
  await prisma.user.delete({
    where: { id: testUserId },
  });
  await prisma.$disconnect();
});

test('Familiarity selection upsert and zero-occupancy deletion logic', async () => {
  // 1. 測試寫入熟悉度 2
  await prisma.userSelection.upsert({
    where: {
      userId_songId: {
        userId: testUserId,
        songId: testSongId,
      },
    },
    update: { familiarity: 2 },
    create: {
      userId: testUserId,
      songId: testSongId,
      familiarity: 2,
    },
  });

  let selection = await prisma.userSelection.findUnique({
    where: {
      userId_songId: {
        userId: testUserId,
        songId: testSongId,
      },
    },
  });
  expect(selection).not.toBeNull();
  expect(selection?.familiarity).toBe(2);

  // 2. 測試當熟悉度為 0 (不記得) 時，刪除記錄 (資料庫零佔用)
  await prisma.userSelection.deleteMany({
    where: {
      userId: testUserId,
      songId: testSongId,
    },
  });

  selection = await prisma.userSelection.findUnique({
    where: {
      userId_songId: {
        userId: testUserId,
        songId: testSongId,
      },
    },
  });
  expect(selection).toBeNull();
});
