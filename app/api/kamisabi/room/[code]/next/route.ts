import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { isIntroFinished, pickNextSong } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { routeParams } from '@/lib/kamisabiRoom/http';
import { isIntroState } from '@/lib/kamisabiRoom/types';

/** POST /api/kamisabi/room/[code]/next（房主）：出下一張；沒牌可出就結束 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const result = await runRoomMutation(request, code, { hostOnly: true }, ({ room }) => {
      if (room.status !== 'playing' || !isIntroState(room.state)) {
        throw new AppError('目前不是搶牌模式的進行中房間。', 409, 'NOT_PLAYING');
      }
      const next = pickNextSong(room.state, room.songs, Date.now());
      if (!next) {
        if (!isIntroFinished(room.state, room.songs)) throw new AppError('還有玩家沒丟牌，請等他們丟完。', 409, 'DISCARD_PENDING');
        return { patch: { status: 'finished' as const }, result: { state: room.state, finished: true } };
      }
      return { patch: { state: next }, result: { state: next, finished: false } };
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}
