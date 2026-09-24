import { randomBytes } from 'crypto';
import { AppError } from '@/lib/errors';
import * as store from './store';
import type { PlayerRow, RoomRow, SecretRow } from './types';

export interface RoomContext {
  room: RoomRow;
  player: PlayerRow;
  secret: SecretRow;
  players: PlayerRow[];
}

/** 玩家憑證：加入時產生、存 room_secrets，瀏覽器放 localStorage，之後每個動作帶 Bearer */
export function generateToken(): string {
  return randomBytes(24).toString('hex');
}

export function readBearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const m = header.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function loadRoomOr404(code: string): Promise<RoomRow> {
  const room = await store.getRoomByCode(normalizeCode(code));
  if (!room) throw new AppError('找不到這個房間。', 404, 'ROOM_NOT_FOUND');
  return room;
}

export async function authenticateRoomRequest(
  request: Request,
  code: string,
  opts: { hostOnly?: boolean } = {},
): Promise<RoomContext> {
  const room = await loadRoomOr404(code);
  const token = readBearer(request);
  if (!token) throw new AppError('請先加入房間。', 401, 'NO_TOKEN');
  const secret = await store.findSecretByToken(room.id, token);
  if (!secret) throw new AppError('玩家憑證無效，請重新加入房間。', 401, 'BAD_TOKEN');
  const players = await store.listPlayers(room.id);
  const player = players.find((p) => p.id === secret.player_id);
  if (!player) throw new AppError('玩家不存在。', 401, 'BAD_TOKEN');
  if (opts.hostOnly && !player.is_host) throw new AppError('只有房主可以這麼做。', 403, 'NOT_HOST');
  return { room, player, secret, players };
}
