import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { createIntroState, dealTimeline } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { readJson, routeParams } from '@/lib/kamisabiRoom/http';
import { MAX_PLAYERS, MIN_PLAYERS, ROOM_MODES, type RoomMode } from '@/lib/kamisabiRoom/types';

/**
 * POST /api/kamisabi/room/[code]/start  { mode }（房主）
 * intro / karuta：空的搶牌狀態；timeline：發牌、手牌寫進 room_secrets。
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const body = await readJson<{ mode?: unknown }>(request);
    const mode = body.mode as RoomMode;
    if (!ROOM_MODES.includes(mode)) throw new AppError('請選擇玩法。', 400, 'BAD_MODE');

    const state = await runRoomMutation(request, code, { hostOnly: true }, ({ room, players }) => {
      if (room.status !== 'lobby') throw new AppError('遊戲已經開始了。', 409, 'ROOM_STARTED');
      if (players.length < MIN_PLAYERS) throw new AppError(`至少需要 ${MIN_PLAYERS} 位玩家。`, 400, 'NOT_ENOUGH_PLAYERS');
      if (players.length > MAX_PLAYERS) throw new AppError(`最多 ${MAX_PLAYERS} 位玩家。`, 400, 'TOO_MANY_PLAYERS');

      if (mode === 'timeline') {
        const order = [...players].sort((a, b) => a.seat - b.seat).map((p) => p.id);
        const dealt = dealTimeline(room.songs, order);
        return { patch: { mode, status: 'playing' as const, state: dealt.state }, hands: dealt.hands, result: dealt.state };
      }
      const intro = createIntroState();
      return { patch: { mode, status: 'playing' as const, state: intro }, result: intro };
    });

    return NextResponse.json({ state });
  } catch (error) {
    return handleError(error);
  }
}
