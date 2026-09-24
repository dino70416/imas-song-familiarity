import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { markReady } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { routeParams } from '@/lib/kamisabiRoom/http';
import { isIntroState } from '@/lib/kamisabiRoom/types';

/**
 * POST /api/kamisabi/room/[code]/ready：玩家按「準備完成」（瀏覽器音訊解鎖後）。
 * 全員都按過，房主才能按「遊戲開始」出第一張。重複按沒事。
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const result = await runRoomMutation(request, code, {}, ({ room, player }) => {
      if (room.status !== 'playing' || !isIntroState(room.state)) {
        throw new AppError('目前不是搶牌模式的進行中房間。', 409, 'NOT_PLAYING');
      }
      const state = markReady(room.state, player.id);
      return { patch: { state }, result: { state } };
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}
