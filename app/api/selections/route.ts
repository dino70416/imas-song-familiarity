import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// 獲取目前登入使用者的所有熟悉度選擇
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: '未授權的存取。' }, { status: 401 });
    }

    const userId = session.user.id;
    const selections = await prisma.userSelection.findMany({
      where: { userId },
      select: { songId: true, familiarity: true }
    });

    // 轉換為 Key-Value 格式以優化前端查找效能
    const selectionMap: Record<string, number> = {};
    selections.forEach((sel) => {
      selectionMap[sel.songId] = sel.familiarity;
    });

    return NextResponse.json(selectionMap);
  } catch (error: any) {
    return NextResponse.json(
      { error: '獲取熟悉度清單失敗。', details: error.message },
      { status: 500 }
    );
  }
}

// 批次更新或刪除熟悉度選擇（資料庫零佔用優化）
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: '未授權的存取。' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();

    if (!Array.isArray(body)) {
      return NextResponse.json({ error: '請求主體必須為陣列格式。' }, { status: 400 });
    }

    // 使用 Prisma 交易確保批次操作原子性
    // familiarity 0 也是合法狀態(「不記得」explicit),要寫入 DB;只有「未評」(沒按過任何鈕)才不會送進來
    await prisma.$transaction(
      body.map((item: { songId: string; familiarity: number }) => {
        const { songId, familiarity } = item;

        // 0~4 都 upsert (0 = 不記得 explicit, 1~4 = 程度遞減)
        return prisma.userSelection.upsert({
          where: {
            userId_songId: {
              userId,
              songId,
            },
          },
          update: {
            familiarity,
          },
          create: {
            userId,
            songId,
            familiarity,
          },
        });
      })
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: '批次更新熟悉度失敗。', details: error.message },
      { status: 500 }
    );
  }
}
