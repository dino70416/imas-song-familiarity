import { AppError } from '@/lib/errors';
import type { PlayerRow, RoomRow, RoomSong, RoomState, SecretRow, RoomMode, RoomStatus } from '@/lib/kamisabiRoom/types';

/** 與 lib/kamisabiRoom/store.ts 同介面的記憶體實作，給 API route 測試用 */
export function createFakeStore() {
  let rooms: RoomRow[] = [];
  let players: PlayerRow[] = [];
  let secrets: SecretRow[] = [];
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  return {
    reset() { rooms = []; players = []; secrets = []; seq = 0; },
    // 測試用的後門
    _rooms: () => rooms,
    _secrets: () => secrets,

    async createRoom(input: { code: string; brand: string; songs: RoomSong[] }): Promise<RoomRow> {
      if (rooms.some((r) => r.code === input.code)) throw new AppError('房號重複', 409, 'CODE_TAKEN');
      const row: RoomRow = { id: uuid(), code: input.code, mode: null, status: 'lobby', brand: input.brand, songs: input.songs, state: {}, version: 0, updated_at: new Date().toISOString() };
      rooms.push(row);
      return structuredClone(row);
    },
    async getRoomByCode(code: string): Promise<RoomRow | null> {
      const r = rooms.find((x) => x.code === code);
      return r ? structuredClone(r) : null;
    },
    async listPlayers(roomId: string): Promise<PlayerRow[]> {
      return structuredClone(players.filter((p) => p.room_id === roomId).sort((a, b) => a.seat - b.seat));
    },
    async addPlayer(input: { roomId: string; name: string; seat: number; isHost: boolean }): Promise<PlayerRow> {
      if (players.some((p) => p.room_id === input.roomId && p.seat === input.seat)) throw new AppError('座位重複', 409, 'SEAT_TAKEN');
      const row: PlayerRow = { id: uuid(), room_id: input.roomId, name: input.name, seat: input.seat, is_host: input.isHost, joined_at: new Date().toISOString() };
      players.push(row);
      return structuredClone(row);
    },
    async createSecret(input: { roomId: string; playerId: string; token: string }): Promise<void> {
      secrets.push({ room_id: input.roomId, player_id: input.playerId, token: input.token, hand: [] });
    },
    async findSecretByToken(roomId: string, token: string): Promise<SecretRow | null> {
      const s = secrets.find((x) => x.room_id === roomId && x.token === token);
      return s ? structuredClone(s) : null;
    },
    async listSecrets(roomId: string): Promise<SecretRow[]> {
      return structuredClone(secrets.filter((s) => s.room_id === roomId));
    },
    async setHands(roomId: string, hands: Record<string, string[]>): Promise<void> {
      for (const s of secrets) if (s.room_id === roomId && hands[s.player_id]) s.hand = [...hands[s.player_id]];
    },
    async updateRoom(roomId: string, expectedVersion: number, patch: { mode?: RoomMode; status?: RoomStatus; state?: RoomState }): Promise<RoomRow> {
      const r = rooms.find((x) => x.id === roomId);
      if (!r || r.version !== expectedVersion) throw new AppError('房間狀態已被其他人更新，請重試。', 409, 'VERSION_CONFLICT');
      Object.assign(r, structuredClone(patch), { version: r.version + 1, updated_at: new Date().toISOString() });
      return structuredClone(r);
    },
    async deleteStaleRooms(before: Date): Promise<number> {
      const n = rooms.length;
      rooms = rooms.filter((r) => new Date(r.updated_at) >= before);
      return n - rooms.length;
    },
    async pingDatabase(): Promise<void> {},
  };
}

export type FakeStore = ReturnType<typeof createFakeStore>;
