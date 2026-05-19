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
        { error: '請至少輸入兩個不同的分享碼來比對共同歌單。' },
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

    // 2. 獲取所有使用者非 0 的歌曲選擇
    const allSelections = await prisma.userSelection.findMany({
      where: {
        userId: { in: userIds },
        familiarity: { in: [1, 2, 3, 4] },
      },
      include: {
        song: {
          include: {
            members: {
              include: {
                member: true,
              },
            },
          },
        },
      },
    });

    // 3. 計算交集：以 songId 為 Key，統計出現的使用者個數與詳細評估值
    const songSelectionMap: Record<string, {
      song: any;
      ratings: Record<string, number>;
    }> = {};

    allSelections.forEach((sel) => {
      const nickname = dbUsers.find((u) => u.id === sel.userId)?.nickname || '';
      if (!songSelectionMap[sel.songId]) {
        songSelectionMap[sel.songId] = {
          song: sel.song,
          ratings: {},
        };
      }
      songSelectionMap[sel.songId].ratings[nickname] = sel.familiarity;
    });

    // 4. 過濾出所有使用者均有標記的歌曲 (ratings 的 Key 數量等於 userIds 數量)
    const intersectedSongs = Object.values(songSelectionMap)
      .filter((item) => Object.keys(item.ratings).length === userIds.length)
      .map((item) => ({
        id: item.song.id,
        slug: item.song.slug,
        title: item.song.title,
        brand: item.song.brand,
        musicType: item.song.musicType,
        lyrics: item.song.lyrics,
        composer: item.song.composer,
        arranger: item.song.arranger,
        lowestPitch: item.song.lowestPitch,
        highestPitch: item.song.highestPitch,
        members: item.song.members.map((m: any) => ({
          name: m.member.name,
          cvName: m.member.cvName,
        })),
        ratings: item.ratings,
      }));

    return NextResponse.json({
      users: dbUsers.map((u) => u.nickname),
      songs: intersectedSongs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: '比對共同歌單失敗。', details: error.message },
      { status: 500 }
    );
  }
}
