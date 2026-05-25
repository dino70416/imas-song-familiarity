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
        units: {
          include: {
            unit: true,
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
      youtubeIds: song.youtubeIds ?? null,
      members: song.members.map((m) => ({
        id: m.member.id,
        name: m.member.name,
        cvName: m.member.cvName,
      })),
      units: song.units.map((su) => ({
        id: su.unit.id,
        name: su.unit.name,
      })),
    }));

    // schema 仍在迭代（members[].id、units 等都是後加的），任何 max-age 都可能讓
    // 已升級的前端拿到 cache 住的舊 shape，結果就是篩選全部過濾掉變 0 筆。
    // 改成 no-store：每次都從 DB 直出，避免任何中間層 cache 卡到。
    return new NextResponse(JSON.stringify(formattedSongs), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Songs-Schema': 'v2-with-units',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: '載入歌曲列表失敗。', details: error.message },
      { status: 500 }
    );
  }
}
