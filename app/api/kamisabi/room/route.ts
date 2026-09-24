import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AppError, handleError } from '@/lib/errors';
import { rateLimit } from '@/lib/rateLimit';
import { BRAND_VALUES } from '@/lib/brandMap';
import { canHostRoom } from '@/lib/kamisabiRoom/hosts';
import { generateRoomCode } from '@/lib/kamisabiRoom/logic';
import { buildRoomSongs } from '@/lib/kamisabiRoom/snapshot';
import { generateToken } from '@/lib/kamisabiRoom/auth';
import { clientIp, readJson, validatePlayerName } from '@/lib/kamisabiRoom/http';
import * as store from '@/lib/kamisabiRoom/store';

/**
 * POST /api/kamisabi/room  { name, brand, singles?: string[] }
 * 開房：需登入且帳號在 KAMISABI_ROOM_HOSTS 白名單 →
 * 快照 Neon 曲目 → rooms / room_players（房主 seat 0）/ room_secrets → 回 { code, roomId, playerId, token }
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!canHostRoom(session?.user?.username)) throw new AppError('目前只有指定帳號可以開房。', 403, 'NOT_ALLOWED');
    if (!rateLimit(`kamisabi-room-create:${clientIp(request)}`, 5, 1, 12000)) {
      throw new AppError('開房太頻繁，請稍後再試。', 429, 'RATE_LIMITED');
    }
    const body = await readJson<{ name?: unknown; brand?: unknown; singles?: unknown }>(request);
    const name = validatePlayerName(body.name);
    const brand = typeof body.brand === 'string' ? body.brand : '';
    if (!(BRAND_VALUES as readonly string[]).includes(brand)) throw new AppError('請選擇品牌。', 400, 'BAD_BRAND');
    const singles = Array.isArray(body.singles) ? body.singles.filter((x): x is string => typeof x === 'string') : [];

    const songs = await buildRoomSongs(brand, singles);

    let room = null;
    for (let attempt = 0; attempt < 5 && !room; attempt++) {
      try {
        room = await store.createRoom({ code: generateRoomCode(), brand, songs });
      } catch (e) {
        if (!(e instanceof AppError && e.code === 'CODE_TAKEN')) throw e;
      }
    }
    if (!room) throw new AppError('房號產生失敗，請再試一次。', 500, 'CODE_TAKEN');

    const player = await store.addPlayer({ roomId: room.id, name, seat: 0, isHost: true });
    const token = generateToken();
    await store.createSecret({ roomId: room.id, playerId: player.id, token });

    return NextResponse.json({ code: room.code, roomId: room.id, playerId: player.id, token }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
