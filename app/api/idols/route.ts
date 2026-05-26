import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/idols?production=cg
// 不帶 production 或 production=all 時回傳所有具有 production 標記的偶像（過濾掉無 production 的雜項 Member）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const production = searchParams.get('production');

    const where: any =
      !production || production === 'all'
        ? { production: { not: null } }
        : { production };

    const idols = await prisma.member.findMany({
      where,
      select: {
        id: true,
        taxId: true,
        name: true,
        kana: true,
        cvName: true,
        production: true,
        imagePath: true,
      },
      orderBy: [{ kana: 'asc' }, { name: 'asc' }],
    });

    // 偶像列表的 shape(production / imagePath / 等)仍在迭代;比照 /api/songs 走 no-store
    // 避免使用者拿到 1 小時內的舊版(這次 session 已經被咬過數次)
    return new NextResponse(JSON.stringify(idols), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: '載入偶像列表失敗。', details: error.message },
      { status: 500 },
    );
  }
}
