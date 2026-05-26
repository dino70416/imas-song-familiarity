import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').trim();

    // 空字串 → 列出全部公開使用者（讓前端 focus 時就有清單可挑）
    // 非空 → case-insensitive contains（SQL LIKE '%q%'）
    const users = await prisma.user.findMany({
      where: {
        isPublic: true,
        ...(q.length > 0
          ? { nickname: { contains: q, mode: 'insensitive' as const } }
          : {}),
      },
      select: {
        nickname: true,
        shareCode: true,
        themeColor: true,
      },
      orderBy: { nickname: 'asc' },
      take: 200,
    });

    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: '搜尋失敗' }, { status: 500 });
  }
}
