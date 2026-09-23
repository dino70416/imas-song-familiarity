import type { ApplePreview } from '@/lib/apple';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';
import type { IntroState, PlayerRow, RoomMode, RoomSong, TimelineState } from '@/lib/kamisabiRoom/types';

export class RoomApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'RoomApiError';
    this.status = status;
    this.code = code;
  }
}

export interface RoomSnapshot {
  room: PublicRoom;
  players: PlayerRow[];
  serverNow: number;
}

async function call<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown; token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  let data: { error?: string; code?: string } & Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* 沒 body */
  }
  if (!res.ok) throw new RoomApiError(data.error ?? `HTTP ${res.status}`, res.status, data.code ?? 'HTTP_ERROR');
  return data as T;
}

const base = (code: string) => `/api/kamisabi/room/${encodeURIComponent(code.toUpperCase())}`;

/** 前端唯一會碰房間 API 的地方；瀏覽器絕不直接寫 Supabase */
export const roomApi = {
  create: (body: { name: string; brand: string; singles: string[] }) =>
    call<{ code: string; roomId: string; playerId: string; token: string }>('/api/kamisabi/room', { body }),
  get: (code: string) => call<RoomSnapshot>(base(code)),
  join: (code: string, name: string) => call<{ playerId: string; token: string; seat: number }>(`${base(code)}/join`, { body: { name } }),
  start: (code: string, token: string, mode: RoomMode) => call<{ state: IntroState | TimelineState }>(`${base(code)}/start`, { body: { mode }, token }),
  next: (code: string, token: string) => call<{ state: IntroState; finished: boolean }>(`${base(code)}/next`, { body: {}, token }),
  claim: (code: string, token: string, songId: string) =>
    call<{ result: 'correct' | 'otetsuki' | 'otetsuki_no_cards'; cards: RoomSong[]; finished: boolean }>(`${base(code)}/claim`, { body: { songId }, token }),
  discard: (code: string, token: string, songId: string) => call<{ state: IntroState }>(`${base(code)}/discard`, { body: { songId }, token }),
  place: (code: string, token: string, songId: string, slot: number) =>
    call<{ correct: boolean; releaseDate: string; hand: string[]; state: TimelineState; finished: boolean }>(`${base(code)}/place`, { body: { songId, slot }, token }),
  hand: (code: string, token: string) => call<{ hand: string[] }>(`${base(code)}/hand`, { token }),
  lyrics: (code: string, token: string, songId: string) => call<{ text: string }>(`${base(code)}/lyrics?songId=${encodeURIComponent(songId)}`, { token }),
  end: (code: string, token: string) => call<{ status: 'finished' }>(`${base(code)}/end`, { body: {}, token }),
  preview: (trackId: string) => call<ApplePreview>(`/api/apple/preview?trackId=${encodeURIComponent(trackId)}`),
};
