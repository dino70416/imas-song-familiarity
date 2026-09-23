import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { rateLimit } from '@/lib/rateLimit';
import { generateToken, loadRoomOr404 } from '@/lib/kamisabiRoom/auth';
import { clientIp, readJson, routeParams, validatePlayerName } from '@/lib/kamisabiRoom/http';
import { MAX_PLAYERS } from '@/lib/kamisabiRoom/types';
import * as store from '@/lib/kamisabiRoom/store';

/**
 * POST /api/kamisabi/room/[code]/join  { name }  → { playerId, token, seat }
 * 只有 lobby 能加入；seat = 目前人數（撞到 unique 就重試一次）。
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    if (!rateLimit(`kamisabi-room-join:${clientIp(request)}`, 10, 2, 10000)) {
      throw new AppError('加入太頻繁，請稍後再試。', 429, 'RATE_LIMITED');
    }
    const { code } = await routeParams(ctx);
    const body = await readJson<{ name?: unknown }>(request);
    const name = validatePlayerName(body.name);
    const room = await loadRoomOr404(code);
    if (room.status !== 'lobby') throw new AppError('遊戲已經開始，無法加入。', 409, 'ROOM_STARTED');

    let player = null;
    for (let attempt = 0; attempt < 2 && !player; attempt++) {
      const players = await store.listPlayers(room.id);
      if (players.length >= MAX_PLAYERS) throw new AppError(`房間已滿（最多 ${MAX_PLAYERS} 人）。`, 409, 'ROOM_FULL');
      try {
        player = await store.addPlayer({ roomId: room.id, name, seat: players.length, isHost: false });
      } catch (e) {
        if (!(e instanceof AppError && e.code === 'SEAT_TAKEN')) throw e;
      }
    }
    if (!player) throw new AppError('有人同時加入，請再試一次。', 409, 'SEAT_TAKEN');

    const token = generateToken();
    await store.createSecret({ roomId: room.id, playerId: player.id, token });
    return NextResponse.json({ playerId: player.id, token, seat: player.seat }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
