import { expect, test, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let testTargetUserId: string;
let testSenderUserId: string;
let testSongId: string;
let testSongId2: string;
let createdWishIds: string[] = [];

beforeAll(async () => {
  // Create Target User
  const targetUsername = `target_${Date.now()}`;
  const targetUser = await prisma.user.create({
    data: {
      username: targetUsername,
      password: 'password123',
      nickname: targetUsername,
      shareCode: `code_t_${Date.now()}`,
    },
  });
  testTargetUserId = targetUser.id;

  // Create Sender User
  const senderUsername = `sender_${Date.now()}`;
  const senderUser = await prisma.user.create({
    data: {
      username: senderUsername,
      password: 'password123',
      nickname: senderUsername,
      shareCode: `code_s_${Date.now()}`,
    },
  });
  testSenderUserId = senderUser.id;

  // Create Test Song 1
  const song1 = await prisma.song.create({
    data: {
      slug: `test/song_wish1_${Date.now()}`,
      title: 'Wish Test Song 1',
      brand: 'music_ml',
      musicType: 'solo',
    },
  });
  testSongId = song1.id;

  // Create Test Song 2
  const song2 = await prisma.song.create({
    data: {
      slug: `test/song_wish2_${Date.now()}`,
      title: 'Wish Test Song 2',
      brand: 'music_ml',
      musicType: 'solo',
    },
  });
  testSongId2 = song2.id;
});

afterAll(async () => {
  // Cleanup test data
  if (createdWishIds.length > 0) {
    await prisma.songWish.deleteMany({
      where: { id: { in: createdWishIds } },
    });
  }
  await prisma.song.deleteMany({
    where: { id: { in: [testSongId, testSongId2] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [testTargetUserId, testSenderUserId] } },
  });
  await prisma.$disconnect();
});

test('SongWish successfully persists comments in the database', async () => {
  const commentText = '祝你歐氣滿滿，這首歌超好聽！';

  // 1. Create a song wish with a comment
  const wish = await prisma.songWish.create({
    data: {
      targetUserId: testTargetUserId,
      senderUserId: testSenderUserId,
      songId: testSongId,
      comment: commentText,
    },
  });
  createdWishIds.push(wish.id);

  expect(wish).not.toBeNull();
  expect(wish.comment).toBe(commentText);

  // 2. Fetch the created wish to verify database persistence
  const fetchedWish = await prisma.songWish.findUnique({
    where: { id: wish.id },
  });

  expect(fetchedWish).not.toBeNull();
  expect(fetchedWish?.comment).toBe(commentText);
});

test('SongWish successfully handles null comments', async () => {
  // Create a song wish with no comment (null)
  const wish = await prisma.songWish.create({
    data: {
      targetUserId: testTargetUserId,
      senderUserId: testSenderUserId,
      songId: testSongId2,
      comment: null,
    },
  });
  createdWishIds.push(wish.id);

  expect(wish).not.toBeNull();
  expect(wish.comment).toBeNull();

  // Fetch from DB
  const fetchedWish = await prisma.songWish.findUnique({
    where: { id: wish.id },
  });

  expect(fetchedWish).not.toBeNull();
  expect(fetchedWish?.comment).toBeNull();
});
