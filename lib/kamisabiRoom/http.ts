import { AppError } from '@/lib/errors';
import { PLAYER_NAME_MAX, type RoomRow } from './types';

export type PublicRoom = Pick<RoomRow, 'id' | 'code' | 'mode' | 'status' | 'brand' | 'songs' | 'state' | 'version'>;

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError('請求格式不正確。', 400, 'BAD_JSON');
  }
}

export function validatePlayerName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new AppError('請輸入名字。', 400, 'BAD_NAME');
  if (name.length > PLAYER_NAME_MAX) throw new AppError(`名字最多 ${PLAYER_NAME_MAX} 個字。`, 400, 'BAD_NAME');
  return name;
}

export function toPublicRoom(room: RoomRow): PublicRoom {
  const { id, code, mode, status, brand, songs, state, version } = room;
  return { id, code, mode, status, brand, songs, state, version };
}

/** Next.js 16：Route Handler 的 params 是 Promise */
export async function routeParams(ctx: { params: Promise<{ code: string }> }): Promise<{ code: string }> {
  return ctx.params;
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
}
