import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const songs = await prisma.song.findMany({
      include: {
        members: {
          include: {
            member: true,
          },
        },
      },
      orderBy: {
        title: 'asc',
      },
    });

    // 將資料格式簡化以減少傳輸體積
    const formattedSongs = songs.map((song) => ({
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
      members: song.members.map((m) => ({
        name: m.member.name,
        cvName: m.member.cvName,
      })),
    }));

    // 設定快取控制，快取 1 小時以增進讀取速度
    return new NextResponse(JSON.stringify(formattedSongs), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=600',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: '載入歌曲列表失敗。', details: error.message },
      { status: 500 }
    );
  }
}
