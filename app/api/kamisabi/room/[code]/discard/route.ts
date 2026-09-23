import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { applyDiscard } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { readJson, routeParams } from '@/lib/kamisabiRoom/http';
import { isIntroState } from '@/lib/kamisabiRoom/types';

/** POST /api/kamisabi/room/[code]/discard  { songId }：お手つき後自選一張丟回場上 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const body = await readJson<{ songId?: unknown }>(request);
    const songId = typeof body.songId === 'string' ? body.songId : '';
    if (!songId) throw new AppError('缺少 songId。', 400, 'BAD_REQUEST');

    const state = await runRoomMutation(request, code, {}, ({ room, player }) => {
      if (!isIntroState(room.state)) throw new AppError('目前不是搶牌模式。', 409, 'NOT_PLAYING');
      const next = applyDiscard(room.state, room.songs, player.id, songId);
      return { patch: { state: next }, result: next };
    });
    return NextResponse.json({ state });
  } catch (error) {
    return handleError(error);
  }
}
