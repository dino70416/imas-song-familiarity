import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const { shareCodes } = await request.json();

    if (!shareCodes || !Array.isArray(shareCodes) || shareCodes.length === 0) {
      return NextResponse.json(
        { error: '請提供有效的分享碼清單。' },
        { status: 400 }
      );
    }

    // 清理與去重分享碼
    const cleanShareCodes = Array.from(new Set(shareCodes.map((s) => s.trim()).filter(Boolean)));

    if (cleanShareCodes.length < 2) {
      return NextResponse.json(
        { error: '請至少選擇兩個使用者才能進行比對。' },
        { status: 400 }
      );
    }

    // 1. 獲取所有目標使用者（依 shareCode 查詢，保護原始帳號）
    const dbUsers = await prisma.user.findMany({
      where: {
        shareCode: { in: cleanShareCodes },
      },
    });

    if (dbUsers.length !== cleanShareCodes.length) {
      const foundCodes = dbUsers.map((u) => u.shareCode);
      const missingCodes = cleanShareCodes.filter((c) => !foundCodes.includes(c));
      return NextResponse.json(
        { error: `找不到以下分享碼的用戶: ${missingCodes.join(', ')}。請確認分享碼是否輸入正確。` },
        { status: 404 }
      );
    }

    const userIds = dbUsers.map((u) => u.id);

    // 2a. 利用 PostgreSQL 原生聚合（jsonb_object_agg），將負載從 Node.js 轉移至資料庫
    // 捨棄 findMany 與 Node.js 的 for 迴圈，避免 O(N) 記憶體與網路 I/O 爆炸
    const aggregatedRatings = await prisma.$queryRaw<{ songId: string; ratings: Record<string, number> }[]>`
      SELECT 
        "songId", 
        jsonb_object_agg(U.nickname, S.familiarity) as ratings
      FROM "UserSelection" S
      JOIN "User" U ON S."userId" = U.id
      WHERE U.id IN (${Prisma.join(userIds)})
        AND S.familiarity IN (1, 2, 3, 4)
      GROUP BY "songId"
    `;

    // 3. 以 songId 為 key 聚合每個使用者的熟悉度（聯集）
    const ratingsBySong = new Map<string, Record<string, number>>();
    for (const row of aggregatedRatings) {
      ratingsBySong.set(row.songId, row.ratings);
    }

    // 2b. 拿 distinct songIds 一次抓 song（只取 collab 頁實際會用的欄位 + member name/cvName，
    //     不抓 youtubeIds / member.id / kana / color 等省 payload）
    const songIds = Array.from(ratingsBySong.keys());
    const songs = await prisma.song.findMany({
      where: { id: { in: songIds } },
      select: {
        id: true,
        slug: true,
        title: true,
        brand: true,
        musicType: true,
        lyrics: true,
        composer: true,
        arranger: true,
        lowestPitch: true,
        highestPitch: true,
        members: {
          select: { member: { select: { name: true, cvName: true } } },
        },
      },
    });

    const unionSongs = songs.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      brand: s.brand,
      musicType: s.musicType,
      lyrics: s.lyrics,
      composer: s.composer,
      arranger: s.arranger,
      lowestPitch: s.lowestPitch,
      highestPitch: s.highestPitch,
      members: s.members.map((m) => ({ name: m.member.name, cvName: m.member.cvName })),
      ratings: ratingsBySong.get(s.id) || {},
    }));

    return NextResponse.json({
      users: dbUsers.map((u) => u.nickname),
      songs: unionSongs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: '比對共同歌單失敗。', details: error.message },
      { status: 500 }
    );
  }
}
