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
    const { nickname, themeColor } = await request.json();

    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
      return NextResponse.json({ error: '暱稱格式不正確或不可為空。' }, { status: 400 });
    }

    // 驗證色碼格式 (HEX 色碼)
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (themeColor && (!typeof themeColor === 'string' || !hexColorRegex.test(themeColor))) {
      return NextResponse.json({ error: '主題顏色代碼格式必須為有效的 HEX 格式 (例如: #92cfbb)。' }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        nickname: nickname.trim(),
        themeColor: themeColor || '#92cfbb',
      },
    });

    return NextResponse.json({
      nickname: updatedUser.nickname,
      themeColor: updatedUser.themeColor,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: '更新設定失敗。', details: error.message },
      { status: 500 }
    );
  }
}
