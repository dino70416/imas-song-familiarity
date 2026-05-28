import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: '未授權的存取。' }, { status: 401 });
    }

    const userId = session.user.id;
    const vocalRange = await prisma.userVocalRange.findUnique({
      where: { userId },
    });

    return NextResponse.json(vocalRange || {
      userId,
      comfortableHighest: null,
      singableHighest: null,
      limitHighest: null,
      comfortableLowest: null,
      singableLowest: null,
      limitLowest: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: '載入音域設定失敗。', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: '未授權的存取。' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    console.log("=== API INCOMING POST BODY ===", body);
    const { comfortableHighest, singableHighest, limitHighest, comfortableLowest, singableLowest, limitLowest } = body;

    // 驗證輸入（必須為 null 或 1~60 的整數）
    const validatePitch = (val: any) => {
      if (val === null || val === undefined) return null;
      const num = Number(val);
      if (Number.isInteger(num) && num >= 1 && num <= 60) return num;
      throw new Error('無效的音順序數值（應介於 1 到 60 之間）');
    };

    let cHighest, sHighest, lHighest, cLowest, sLowest, lLowest;
    try {
      cHighest = validatePitch(comfortableHighest);
      sHighest = validatePitch(singableHighest);
      lHighest = validatePitch(limitHighest);
      cLowest = validatePitch(comfortableLowest);
      sLowest = validatePitch(singableLowest);
      lLowest = validatePitch(limitLowest);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // 儲存至資料庫 (Upsert)
    const vocalRange = await prisma.userVocalRange.upsert({
      where: { userId },
      update: {
        comfortableHighest: cHighest,
        singableHighest: sHighest,
        limitHighest: lHighest,
        comfortableLowest: cLowest,
        singableLowest: sLowest,
        limitLowest: lLowest,
      },
      create: {
        userId,
        comfortableHighest: cHighest,
        singableHighest: sHighest,
        limitHighest: lHighest,
        comfortableLowest: cLowest,
        singableLowest: sLowest,
        limitLowest: lLowest,
      },
    });

    return NextResponse.json(vocalRange);
  } catch (error: any) {
    return NextResponse.json(
      { error: '儲存音域設定失敗。', details: error.message },
      { status: 500 }
    );
  }
}
