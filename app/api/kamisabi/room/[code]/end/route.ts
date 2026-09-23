import { NextResponse } from 'next/server';
import { handleError } from '@/lib/errors';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { routeParams } from '@/lib/kamisabiRoom/http';

/** POST /api/kamisabi/room/[code]/end（房主）：提前結束，進結算畫面 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    await runRoomMutation(request, code, { hostOnly: true }, () => ({ patch: { status: 'finished' as const }, result: null }));
    return NextResponse.json({ status: 'finished' });
  } catch (error) {
    return handleError(error);
  }
}
