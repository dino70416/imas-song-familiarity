import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const revalidate = 3600; // 快取一小時

export async function GET() {
  try {
    const songs = await prisma.song.findMany({
      select: {
        id: true,
        title: true,
        brand: true,
        youtubeIds: true,
        units: {
          select: {
            unit: {
              select: { name: true }
            }
          }
        },
        members: {
          select: {
            member: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: {
        title: 'asc',
      },
    });

    const formattedSongs = songs.map(song => ({
      id: song.id,
      title: song.title,
      brand: song.brand,
      youtubeIds: song.youtubeIds,
      units: song.units.map(u => ({ name: u.unit.name })),
      members: song.members.map(m => ({ name: m.member.name }))
    }));

    return NextResponse.json(formattedSongs);
  } catch (error: any) {
    return NextResponse.json(
      { error: '載入遊戲題庫失敗', details: error.message },
      { status: 500 }
    );
  }
}
