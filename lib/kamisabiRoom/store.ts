import { AppError } from '@/lib/errors';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { PlayerRow, RoomMode, RoomRow, RoomSong, RoomState, RoomStatus, SecretRow } from './types';

/**
 * KAMISABI 房間的 Supabase 讀寫（service role）。只給 Route Handler 用。
 * 測試時整個模組會被 tests/helpers/fakeRoomStore.ts 取代，所以介面要保持簡單、可 mock。
 */

const PG_UNIQUE_VIOLATION = '23505';

function fail(message: string, error: { message: string; code?: string } | null): never {
  console.error('[kamisabi room store]', message, error);
  throw new AppError(`${message}（${error?.message ?? 'unknown'}）`, 500, 'SUPABASE_ERROR');
}

export async function createRoom(input: { code: string; brand: string; songs: RoomSong[] }): Promise<RoomRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('rooms')
    .insert({ code: input.code, brand: input.brand, songs: input.songs, state: {} })
    .select()
    .single();
  if (error?.code === PG_UNIQUE_VIOLATION) throw new AppError('房號重複，請再試一次。', 409, 'CODE_TAKEN');
  if (error || !data) fail('建立房間失敗', error);
  return data as RoomRow;
}

export async function getRoomByCode(code: string): Promise<RoomRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('rooms').select().eq('code', code).maybeSingle();
  if (error) fail('讀取房間失敗', error);
  return (data as RoomRow | null) ?? null;
}

export async function listPlayers(roomId: string): Promise<PlayerRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('room_players').select().eq('room_id', roomId).order('seat', { ascending: true });
  if (error) fail('讀取玩家失敗', error);
  return (data ?? []) as PlayerRow[];
}

export async function addPlayer(input: { roomId: string; name: string; seat: number; isHost: boolean }): Promise<PlayerRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('room_players')
    .insert({ room_id: input.roomId, name: input.name, seat: input.seat, is_host: input.isHost })
    .select()
    .single();
  if (error?.code === PG_UNIQUE_VIOLATION) throw new AppError('有人同時加入，請再試一次。', 409, 'SEAT_TAKEN');
  if (error || !data) fail('加入房間失敗', error);
  return data as PlayerRow;
}

export async function createSecret(input: { roomId: string; playerId: string; token: string }): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from('room_secrets').insert({ room_id: input.roomId, player_id: input.playerId, token: input.token, hand: [] });
  if (error) fail('建立玩家憑證失敗', error);
}

export async function findSecretByToken(roomId: string, token: string): Promise<SecretRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('room_secrets').select().eq('room_id', roomId).eq('token', token).maybeSingle();
  if (error) fail('驗證玩家失敗', error);
  return (data as SecretRow | null) ?? null;
}

export async function listSecrets(roomId: string): Promise<SecretRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('room_secrets').select().eq('room_id', roomId);
  if (error) fail('讀取手牌失敗', error);
  return (data ?? []) as SecretRow[];
}

export async function setHands(roomId: string, hands: Record<string, string[]>): Promise<void> {
  const db = getSupabaseAdmin();
  for (const [playerId, hand] of Object.entries(hands)) {
    const { error } = await db.from('room_secrets').update({ hand }).eq('room_id', roomId).eq('player_id', playerId);
    if (error) fail('寫入手牌失敗', error);
  }
}

/** 樂觀鎖：只有 version 沒被別人動過才寫入；0 列 → 409 VERSION_CONFLICT，呼叫端重讀再試 */
export async function updateRoom(
  roomId: string,
  expectedVersion: number,
  patch: { mode?: RoomMode; status?: RoomStatus; state?: RoomState },
): Promise<RoomRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('rooms')
    .update({ ...patch, version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .eq('version', expectedVersion)
    .select();
  if (error) fail('更新房間失敗', error);
  if (!data || data.length === 0) throw new AppError('房間狀態已被其他人更新，請重試。', 409, 'VERSION_CONFLICT');
  return data[0] as RoomRow;
}

export async function deleteStaleRooms(before: Date): Promise<number> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('rooms').delete().lt('updated_at', before.toISOString()).select('id');
  if (error) fail('清除舊房間失敗', error);
  return data?.length ?? 0;
}

/** 免費方案閒置 7 天會暫停專案；Cron 定期打一下 */
export async function pingDatabase(): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from('rooms').select('id').limit(1);
  if (error) fail('ping 失敗', error);
}
