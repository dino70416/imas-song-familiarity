import { NextResponse } from 'next/server';
import { handleError } from '@/lib/errors';
import { loadRoomOr404 } from '@/lib/kamisabiRoom/auth';
import { routeParams, toPublicRoom } from '@/lib/kamisabiRoom/http';
import * as store from '@/lib/kamisabiRoom/store';

/**
 * GET /api/kamisabi/room/[code]
 * 公開狀態（任何人可讀，和 anon key 直讀 Supabase 看到的一樣）+ serverNow 讓前端校正時鐘。
 * 初次載入與 Realtime 不可用時的輪詢都打這支。
 */
export async function GET(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const room = await loadRoomOr404(code);
    const players = await store.listPlayers(room.id);
    return NextResponse.json({ room: toPublicRoom(room), players, serverNow: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleError(error);
  }
}
