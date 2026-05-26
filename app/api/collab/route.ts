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
    // O(1) 對應，避免後面 dbUsers.find() 每個 selection 都 O(N) 掃
    const nickByUserId = new Map(dbUsers.map((u) => [u.id, u.nickname]));

    // 2a. 只拉「最小欄位」的 selections — 不含 song 嵌套關聯
    //     之前的 include: { song: { include: { members } } } 會讓 Prisma 把每首歌依
    //     使用者數複製多份回傳，10 人 7566 筆 selections 就會吃 1MB+。
    //     拆成「先抓 ratings → 再用 distinct songId 抓一次 song」可降約 50% 時間。
    const sels = await prisma.userSelection.findMany({
      where: { userId: { in: userIds }, familiarity: { in: [1, 2, 3, 4] } },
      select: { songId: true, userId: true, familiarity: true },
    });

    // 3. 以 songId 為 key 聚合每個使用者的熟悉度（聯集）
    const ratingsBySong = new Map<string, Record<string, number>>();
    for (const s of sels) {
      const nick = nickByUserId.get(s.userId) ?? '';
      let r = ratingsBySong.get(s.songId);
      if (!r) {
        r = {};
        ratingsBySong.set(s.songId, r);
      }
      r[nick] = s.familiarity;
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
