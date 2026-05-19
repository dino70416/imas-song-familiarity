import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const { username, password, nickname } = await request.json();

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: '帳號與密碼為必填，且必須為字串格式。' },
        { status: 400 }
      );
    }

    if (username.length < 3 || password.length < 6) {
      return NextResponse.json(
        { error: '帳號長度至少需 3 個字元，密碼長度至少需 6 個字元。' },
        { status: 400 }
      );
    }

    const finalNickname = (nickname && typeof nickname === 'string' && nickname.trim().length > 0)
      ? nickname.trim()
      : username;

    // 檢查使用者是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: '此帳號已被註冊。' },
        { status: 409 }
      );
    }

    // 雜湊密碼
    const hashedPassword = await bcrypt.hash(password, 10);

    // 產生分享識別碼（以 username 與當下時間進行 SHA-256 雜湊）
    const shareCode = crypto
      .createHash('sha256')
      .update(username + Date.now().toString())
      .digest('hex')
      .substring(0, 16);

    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        nickname: finalNickname,
        shareCode,
      }
    });

    return NextResponse.json(
      { id: newUser.id, username: newUser.username, nickname: newUser.nickname, shareCode: newUser.shareCode },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: '註冊時發生未知錯誤。', details: error.message },
      { status: 500 }
    );
  }
}
