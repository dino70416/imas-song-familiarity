import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { readBearer } from '@/lib/kamisabiRoom/auth';
import * as store from '@/lib/kamisabiRoom/store';

const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/kamisabi/ping（Vercel Cron，見 vercel.json）
 * 1. 對 Supabase 做一次 select，免費方案閒置 7 天才不會被暫停
 * 2. 刪掉 24 小時沒動的房間
 */
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && readBearer(request) !== secret) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    await store.pingDatabase();
    const deleted = await store.deleteStaleRooms(new Date(Date.now() - STALE_MS));
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    return handleError(error);
  }
}
