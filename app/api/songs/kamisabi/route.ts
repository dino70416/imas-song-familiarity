import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const revalidate = 3600; // 快取一小時（同 /api/songs/guess）

/**
 * KAMISABI 出題機的題庫：只回傳有 Apple Music 曲目 ID 的歌
 * （歌牌有收錄的歌才會由站長用 scripts/seed-apple-ids.ts 補上 ID）。
 */
export async function GET() {
  try {
    const songs = await prisma.song.findMany({
      where: {
        appleTrackId: { not: null },
        NOT: { appleTrackId: '' },
      },
      select: {
        id: true,
        title: true,
        brand: true,
        appleTrackId: true,
        units: { select: { unit: { select: { name: true } } } },
        members: { select: { member: { select: { name: true } } } },
      },
      orderBy: { title: 'asc' },
    });

    const formatted = songs.map((song) => ({
      id: song.id,
      title: song.title,
      brand: song.brand,
      appleTrackId: song.appleTrackId as string,
      units: song.units.map((u) => ({ name: u.unit.name })),
      members: song.members.map((m) => ({ name: m.member.name })),
    }));

    return NextResponse.json(formatted);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: '載入KAMISABI 出題機題庫失敗', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
