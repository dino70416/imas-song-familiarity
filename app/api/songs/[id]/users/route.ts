import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: '缺少歌曲 ID' }, { status: 400 });
    }

    const selections = await prisma.userSelection.findMany({
      where: {
        songId: id,
        familiarity: { in: [1, 2] },
        user: { isPublic: true },
      },
      include: {
        user: { select: { nickname: true, themeColor: true } },
      },
    });

    const users = selections.map(sel => ({
      nickname: sel.user.nickname,
      themeColor: sel.user.themeColor,
      familiarity: sel.familiarity,
    }));

    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: '無法獲取資料' }, { status: 500 });
  }
}
