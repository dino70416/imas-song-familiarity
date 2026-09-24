import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { authenticateRoomRequest } from '@/lib/kamisabiRoom/auth';
import { routeParams } from '@/lib/kamisabiRoom/http';
import { isIntroState } from '@/lib/kamisabiRoom/types';
import { KARUTA_LYRICS } from '@/scripts/karuta-lyrics';

/**
 * GET /api/kamisabi/room/[code]/lyrics?songId=（帶 token）
 * かるた朗讀檔不存在時的備援：只回「當前題」的副歌片段給房內玩家做 speechSynthesis。
 * 不列出、不給非當前題，把歌詞曝光壓到最低。
 */
export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const songId = new URL(request.url).searchParams.get('songId') ?? '';
    const { room } = await authenticateRoomRequest(request, code);
    if (room.mode !== 'karuta' || !isIntroState(room.state) || !songId || room.state.currentSongId !== songId) {
      throw new AppError('只能取得かるたモード當前題的朗讀文字。', 403, 'NOT_CURRENT_SONG');
    }
    const song = room.songs.find((s) => s.id === songId);
    const text = song ? KARUTA_LYRICS[song.title] : undefined;
    if (!text) throw new AppError('這首歌還沒有朗讀文字。', 404, 'NO_LYRICS');
    return NextResponse.json({ text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleError(error);
  }
}
