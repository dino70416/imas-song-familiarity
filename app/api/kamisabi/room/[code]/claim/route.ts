import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { rateLimit } from '@/lib/rateLimit';
import { applyClaim, isIntroFinished, ownedSongs } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { readBearer } from '@/lib/kamisabiRoom/auth';
import { readJson, routeParams } from '@/lib/kamisabiRoom/http';
import { isIntroState } from '@/lib/kamisabiRoom/types';

/**
 * POST /api/kamisabi/room/[code]/claim  { songId, round }
 * 第一個成功寫入的人得卡（樂觀鎖）；點錯回 otetsuki 與可丟的牌。
 * round = 玩家點牌時看到的回合；若寫入前房主已換題（樂觀鎖重試後 round 不同），
 * 回 409 ROUND_RESOLVED 而不是把「上一題的正確牌」算成新一題的お手つき。
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    if (!rateLimit(`kamisabi-room-claim:${readBearer(request) ?? 'anon'}`, 20, 5, 5000)) {
      throw new AppError('點太快了，請稍等。', 429, 'RATE_LIMITED');
    }
    const body = await readJson<{ songId?: unknown; round?: unknown }>(request);
    const songId = typeof body.songId === 'string' ? body.songId : '';
    if (!songId) throw new AppError('缺少 songId。', 400, 'BAD_REQUEST');
    const round = typeof body.round === 'number' ? body.round : null;

    const result = await runRoomMutation(request, code, {}, ({ room, player }) => {
      if (room.status !== 'playing' || !isIntroState(room.state)) {
        throw new AppError('目前不是搶牌模式的進行中房間。', 409, 'NOT_PLAYING');
      }
      if (round !== null && room.state.round !== round) {
        throw new AppError('慢了一步，這一題已經換張了。', 409, 'ROUND_RESOLVED');
      }
      const { state, result } = applyClaim(room.state, room.songs, player.id, songId);
      const finished = isIntroFinished(state, room.songs);
      return {
        patch: finished ? { state, status: 'finished' as const } : { state },
        result: { result, finished, cards: result === 'otetsuki' ? ownedSongs(state, room.songs, player.id) : [] },
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}
