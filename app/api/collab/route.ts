import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

    // 2. 獲取所有使用者非 0 的歌曲選擇（輕量級查詢，不 include song）
    const allSelections = await prisma.userSelection.findMany({
      where: {
        userId: { in: userIds },
        familiarity: { in: [1, 2, 3, 4] },
      },
      select: {
        userId: true,
        songId: true,
        familiarity: true,
      }
    });

    // 3. 萃取唯一的 songId 清單並批次抓取歌曲詳細資料
    const uniqueSongIds = Array.from(new Set(allSelections.map((sel) => sel.songId)));
    
    const targetSongs = await prisma.song.findMany({
      where: {
        id: { in: uniqueSongIds }
      },
      include: {
        members: {
          include: {
            member: true,
          },
        },
      },
    });

    // 4. 建立 UserId 到 Nickname 的映射表，提升查找效能 O(1)
    const userIdToNickname = new Map(dbUsers.map(u => [u.id, u.nickname]));

    // 5. 將使用者的評分聚合到對應的 songId 上
    const ratingsMap: Record<string, Record<string, number>> = {};
    for (const sel of allSelections) {
      const nickname = userIdToNickname.get(sel.userId);
      if (!nickname) continue;
      
      if (!ratingsMap[sel.songId]) {
        ratingsMap[sel.songId] = {};
      }
      ratingsMap[sel.songId][nickname] = sel.familiarity;
    }

    // 6. 組合最終結果
    const unionSongs = targetSongs.map((song) => ({
      id: song.id,
      slug: song.slug,
      title: song.title,
      brand: song.brand,
      musicType: song.musicType,
      lyrics: song.lyrics,
      composer: song.composer,
      arranger: song.arranger,
      lowestPitch: song.lowestPitch,
      highestPitch: song.highestPitch,
      members: song.members.map((m: any) => ({
        name: m.member.name,
        cvName: m.member.cvName,
      })),
      ratings: ratingsMap[song.id] || {},
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
