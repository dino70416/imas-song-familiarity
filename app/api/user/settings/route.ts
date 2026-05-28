import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: '未授權的存取。' }, { status: 401 });
    }

    const userId = session.user.id;
    const { nickname, themeColor, isPublic, isPublicPitchRange } = await request.json();

    if (
      !nickname || typeof nickname !== 'string' ||
      !themeColor || typeof themeColor !== 'string' ||
      typeof isPublic !== 'boolean' ||
      typeof isPublicPitchRange !== 'boolean'
    ) {
      return NextResponse.json({ error: '請求格式不正確' }, { status: 400 });
    }

    if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(themeColor)) {
      return NextResponse.json({ error: '主題顏色格式不正確' }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        nickname: nickname.trim(),
        themeColor,
        isPublic,
        isPublicPitchRange,
      },
    });

    return NextResponse.json({
      nickname: updatedUser.nickname,
      themeColor: updatedUser.themeColor,
      isPublic: updatedUser.isPublic,
      isPublicPitchRange: updatedUser.isPublicPitchRange,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: '更新設定失敗。', details: error.message },
      { status: 500 }
    );
  }
}
