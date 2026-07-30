import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppError, handleError } from '@/lib/errors';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      throw new AppError('未授權的存取。', 401, 'UNAUTHORIZED');
    }

    // 頻率限制 (Token Bucket)
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimitKey = `wish:${session.user.id}:${ip}`;
    if (!rateLimit(rateLimitKey)) {
      throw new AppError('操作過於頻繁，請稍後再試。', 429, 'RATE_LIMIT_EXCEEDED');
    }

    const { targetUserId, songId, comment } = await request.json();

    if (!targetUserId || !songId) {
      throw new AppError('缺少必要欄位。', 400, 'BAD_REQUEST');
    }

    // 驗證留言格式與長度
    let finalComment: string | null = null;
    if (comment !== undefined && comment !== null) {
      if (typeof comment !== 'string') {
        throw new AppError('留言格式不正確。', 400, 'BAD_REQUEST');
      }
      finalComment = comment.trim() || null;
      if (finalComment && finalComment.length > 200) {
        throw new AppError('留言長度不能超過 200 個字。', 400, 'BAD_REQUEST');
      }
    }

    // 不能許願給自己
    if (targetUserId === session.user.id) {
      throw new AppError('不能對自己許願曲子。', 400, 'SELF_WISH_FORBIDDEN');
    }

    // 檢查目標使用者是否存在
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser) {
      throw new AppError('目標使用者不存在。', 404, 'USER_NOT_FOUND');
    }

    // 檢查歌曲是否存在
    const song = await prisma.song.findUnique({
      where: { id: songId },
    });
    if (!song) {
      throw new AppError('歌曲不存在。', 404, 'SONG_NOT_FOUND');
    }

    // 檢查是否有未完成的相同許願 (status: 'PENDING')
    const pendingWish = await prisma.songWish.findFirst({
      where: {
        targetUserId,
        songId,
        isCompleted: false,
      },
    });
    if (pendingWish) {
      throw new AppError('此曲子已在該使用者的待實現許願清單中。', 400, 'DUPLICATE_PENDING_WISH');
    }

    // 不能對同一位使用者重複許同一首歌 (包括已完成的) (避免 DB unique constraint 觸發 500)
    const existing = await prisma.songWish.findFirst({
      where: {
        senderUserId: session.user.id,
        targetUserId,
        songId,
      },
    });
    if (existing) {
      const msg = existing.isCompleted
        ? '您先前已對這位使用者許過這首歌 (已完成)。'
        : '您已經對這位使用者許過這首歌了。';
      throw new AppError(msg, 409, 'DUPLICATE_WISH');
    }

    // 建立許願
    const newWish = await prisma.songWish.create({
      data: {
        targetUserId,
        senderUserId: session.user.id,
        songId,
        comment: finalComment,
      },
    });

    return NextResponse.json({ success: true, wish: newWish });
  } catch (error: unknown) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      throw new AppError('未授權的存取。', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const wishId = searchParams.get('id');

    if (!wishId) {
      throw new AppError('缺少許願 ID。', 400, 'BAD_REQUEST');
    }

    // 尋找許願紀錄
    const wish = await prisma.songWish.findUnique({
      where: { id: wishId },
    });

    if (!wish) {
      throw new AppError('許願紀錄不存在。', 404, 'WISH_NOT_FOUND');
    }

    // 只有許願接收者或發送者可以刪除此紀錄
    if (wish.targetUserId !== session.user.id && wish.senderUserId !== session.user.id) {
      throw new AppError('無權限刪除此許願。', 403, 'FORBIDDEN');
    }

    await prisma.songWish.delete({
      where: { id: wishId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      throw new AppError('未授權的存取。', 401, 'UNAUTHORIZED');
    }

    const { id, isCompleted } = await request.json();

    if (!id || typeof isCompleted !== 'boolean') {
      throw new AppError('缺少必要欄位或格式不正確。', 400, 'BAD_REQUEST');
    }

    // 尋找許願紀錄
    const wish = await prisma.songWish.findUnique({
      where: { id },
    });

    if (!wish) {
      throw new AppError('許願紀錄不存在。', 404, 'WISH_NOT_FOUND');
    }

    // 只有許願接收者（即該個人頁面的擁有者）可以修改此紀錄
    if (wish.targetUserId !== session.user.id) {
      throw new AppError('無權限修改此許願狀態。', 403, 'FORBIDDEN');
    }

    const updatedWish = await prisma.songWish.update({
      where: { id },
      data: { isCompleted },
    });

    return NextResponse.json({ success: true, wish: updatedWish });
  } catch (error: unknown) {
    return handleError(error);
  }
}
