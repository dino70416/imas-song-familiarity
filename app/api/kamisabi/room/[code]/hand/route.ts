import { NextResponse } from 'next/server';
import { handleError } from '@/lib/errors';
import { authenticateRoomRequest } from '@/lib/kamisabiRoom/auth';
import { routeParams } from '@/lib/kamisabiRoom/http';

/** GET /api/kamisabi/room/[code]/hand（帶 token）：只回自己的手牌 songId */
export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const { secret } = await authenticateRoomRequest(request, code);
    return NextResponse.json({ hand: secret.hand ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleError(error);
  }
}
