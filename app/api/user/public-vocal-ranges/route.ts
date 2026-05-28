import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const currentUserId = session?.user?.id;

    // 一次 Query 帶回使用者與音域設定，減少資料庫查詢次數
    const publicUsers = await prisma.user.findMany({
      where: {
        isPublicPitchRange: true,
        ...(currentUserId ? { id: { not: currentUserId } } : {})
      },
      include: {
        vocalRange: true
      }
    });

    // 過濾掉沒有 vocalRange 或六個音域指標皆為 null 的不活躍使用者，並完成 Map 輸出
    const result = publicUsers
      .filter(user => {
        const range = user.vocalRange;
        if (!range) return false;
        return (
          range.comfortableLowest !== null ||
          range.comfortableHighest !== null ||
          range.singableLowest !== null ||
          range.singableHighest !== null ||
          range.limitLowest !== null ||
          range.limitHighest !== null
        );
      })
      .map(user => {
        const range = user.vocalRange!;
        return {
          userId: user.id,
          nickname: user.nickname || user.username,
          comfortableLowest: range.comfortableLowest,
          comfortableHighest: range.comfortableHighest,
          singableLowest: range.singableLowest,
          singableHighest: range.singableHighest,
          limitLowest: range.limitLowest,
          limitHighest: range.limitHighest,
        };
      });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: '無法獲取公開音域資料。', details: error.message },
      { status: 500 }
    );
  }
}

