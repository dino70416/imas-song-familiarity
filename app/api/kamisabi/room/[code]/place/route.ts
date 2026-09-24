import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { applyPlace } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { readJson, routeParams } from '@/lib/kamisabiRoom/http';
import { isTimelineState } from '@/lib/kamisabiRoom/types';
import * as store from '@/lib/kamisabiRoom/store';

/**
 * POST /api/kamisabi/room/[code]/place  { songId, slot }
 * 時間軸：伺服器驗證日期順序；對就插入、錯就留手牌並罰抽。手牌只回給本人。
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const body = await readJson<{ songId?: unknown; slot?: unknown }>(request);
    const songId = typeof body.songId === 'string' ? body.songId : '';
    const slot = typeof body.slot === 'number' ? body.slot : NaN;
    if (!songId || !Number.isInteger(slot)) throw new AppError('缺少 songId 或 slot。', 400, 'BAD_REQUEST');

    const result = await runRoomMutation(request, code, {}, async ({ room, player }) => {
      if (room.status !== 'playing' || !isTimelineState(room.state)) {
        throw new AppError('目前不是時間軸模式的進行中房間。', 409, 'NOT_PLAYING');
      }
      const secrets = await store.listSecrets(room.id);
      const hands = Object.fromEntries(secrets.map((s) => [s.player_id, s.hand ?? []]));
      const placed = applyPlace(room.state, room.songs, hands, player.id, songId, slot);
      const finished = placed.state.winnerId !== null;
      return {
        patch: finished ? { state: placed.state, status: 'finished' as const } : { state: placed.state },
        // 只有放牌者的手牌會變，只寫這一列（避免逐人重寫時被讀到半新半舊）
        hands: { [player.id]: placed.hands[player.id] },
        result: { correct: placed.correct, releaseDate: placed.releaseDate, hand: placed.hands[player.id], state: placed.state, finished },
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}
