import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { allReady, isIntroFinished, nextCardDueAt, pickNextSong } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { readJson, routeParams } from '@/lib/kamisabiRoom/http';
import { isIntroState } from '@/lib/kamisabiRoom/types';

/**
 * POST /api/kamisabi/room/[code]/next  { round? }：出下一張；沒牌可出就結束。
 * 第一張：房主按「遊戲開始」，且全員都按過「準備完成」。
 * 之後沒有手動按鈕：任何玩家的瀏覽器到時間都可以觸發
 * （有人取得後 AUTO_NEXT_DELAY_MS、沒人答對 ROUND_TIMEOUT_MS），伺服器自己驗證時間。
 * 帶 round 時若已經換過就 409，兩個分頁同時觸發也不會跳過一張。
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const body = await readJson<{ round?: unknown }>(request);
    const round = typeof body.round === 'number' ? body.round : null;
    const result = await runRoomMutation(request, code, {}, ({ room, player, players }) => {
      if (room.status !== 'playing' || !isIntroState(room.state)) {
        throw new AppError('目前不是搶牌模式的進行中房間。', 409, 'NOT_PLAYING');
      }
      const state = room.state;
      if (round !== null && state.round !== round) throw new AppError('已經換下一張了。', 409, 'ROUND_ADVANCED');
      if (!state.currentSongId) {
        if (!player.is_host) throw new AppError('只有房主可以開始遊戲。', 403, 'NOT_HOST');
        if (!allReady(state, players.map((p) => p.id))) throw new AppError('還有人沒按「準備完成」。', 409, 'NOT_ALL_READY');
      } else if (Date.now() < nextCardDueAt(state)) {
        throw new AppError('還沒到換下一張的時間。', 409, 'NOT_DUE');
      }
      const next = pickNextSong(state, room.songs, Date.now());
      if (!next) {
        if (!isIntroFinished(state, room.songs)) throw new AppError('還有玩家沒丟牌，請等他們丟完。', 409, 'DISCARD_PENDING');
        return { patch: { status: 'finished' as const }, result: { state, finished: true } };
      }
      return { patch: { state: next }, result: { state: next, finished: false } };
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}
