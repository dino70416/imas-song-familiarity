import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    
    if (!q || q.trim().length === 0) {
      return NextResponse.json([]);
    }

    const users = await prisma.user.findMany({
      where: {
        nickname: { contains: q },
        isPublic: true,
      },
      select: {
        nickname: true,
        shareCode: true,
        themeColor: true,
      },
      take: 10,
    });

    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: '搜尋失敗' }, { status: 500 });
  }
}
