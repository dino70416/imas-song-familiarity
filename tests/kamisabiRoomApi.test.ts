import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { FakeStore } from './helpers/fakeRoomStore';
import type { RoomSong } from '@/lib/kamisabiRoom/types';

// vi.mock 會被提升到最上面，工廠內不能碰頂層變數 → 在工廠裡動態 import 假 store
vi.mock('@/lib/kamisabiRoom/store', async () => {
  const { createFakeStore } = await import('./helpers/fakeRoomStore');
  return createFakeStore();
});

const buildRoomSongs = vi.hoisted(() => vi.fn());
vi.mock('@/lib/kamisabiRoom/snapshot', () => ({ buildRoomSongs: (...args: unknown[]) => buildRoomSongs(...args) }));

import * as store from '@/lib/kamisabiRoom/store';
import { resetRateLimits } from '@/lib/rateLimit';
import { POST as createRoom } from '@/app/api/kamisabi/room/route';
import { GET as getRoom } from '@/app/api/kamisabi/room/[code]/route';
import { POST as joinRoom } from '@/app/api/kamisabi/room/[code]/join/route';

const fake = store as unknown as FakeStore;

const song = (id: string, points: 1 | 2 = 1, releaseDate: string | null = null): RoomSong => ({
  id, title: `Song ${id}`, brand: 'music_ml', trackId: `t${id}`, artworkUrl: null, releaseDate, points,
});
const SONGS = [song('a'), song('b', 2), song('c')];

const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
function post(path: string, body: unknown, token?: string, ip = '1.1.1.1') {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
function get(path: string, token?: string) {
  return new Request(`http://localhost${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function openRoom(name = 'host', ip = '1.1.1.1') {
  const res = await createRoom(post('/api/kamisabi/room', { name, brand: 'music_ml', singles: ['b'] }, undefined, ip));
  expect(res.status).toBe(201);
  return (await res.json()) as { code: string; roomId: string; playerId: string; token: string };
}
async function joinAs(code: string, name: string) {
  const res = await joinRoom(post(`/api/kamisabi/room/${code}/join`, { name }, undefined, `2.2.2.${name.length}`), ctx(code));
  expect(res.status).toBe(201);
  return (await res.json()) as { playerId: string; token: string; seat: number };
}

beforeEach(() => {
  fake.reset();
  resetRateLimits();
  buildRoomSongs.mockReset().mockResolvedValue(SONGS);
});

describe('POST /api/kamisabi/room', () => {
  test('開房：快照曲目、房主 seat 0、回 code/token', async () => {
    const r = await openRoom();
    expect(r.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(r.token).toMatch(/^[0-9a-f]{48}$/);
    expect(buildRoomSongs).toHaveBeenCalledWith('music_ml', ['b']);
    const room = await fake.getRoomByCode(r.code);
    expect(room?.status).toBe('lobby');
    expect(room?.songs).toEqual(SONGS);
    const players = await fake.listPlayers(room!.id);
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ name: 'host', seat: 0, is_host: true });
  });

  test('名字空白 / 太長 / brand 缺 → 400', async () => {
    for (const body of [{ name: '   ', brand: 'music_ml' }, { name: 'x'.repeat(13), brand: 'music_ml' }, { name: 'ok' }]) {
      const res = await createRoom(post('/api/kamisabi/room', body));
      expect(res.status).toBe(400);
    }
  });

  test('快照丟 NOT_ENOUGH_SONGS 時原樣回 400', async () => {
    const { AppError } = await import('@/lib/errors');
    buildRoomSongs.mockRejectedValue(new AppError('不足', 400, 'NOT_ENOUGH_SONGS'));
    const res = await createRoom(post('/api/kamisabi/room', { name: 'h', brand: 'music_ml' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('NOT_ENOUGH_SONGS');
  });

  test('同一 IP 開房太頻繁 → 429', async () => {
    for (let i = 0; i < 5; i++) await openRoom('h', '9.9.9.9');
    const res = await createRoom(post('/api/kamisabi/room', { name: 'h', brand: 'music_ml' }, undefined, '9.9.9.9'));
    expect(res.status).toBe(429);
  });
});

describe('GET /api/kamisabi/room/[code]', () => {
  test('回公開狀態、玩家、serverNow；房號不分大小寫；找不到 → 404', async () => {
    const r = await openRoom();
    const res = await getRoom(get(`/api/kamisabi/room/${r.code.toLowerCase()}`), ctx(r.code.toLowerCase()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room).toMatchObject({ code: r.code, status: 'lobby', version: 0, songs: SONGS });
    expect(body.room).not.toHaveProperty('updated_at');
    expect(body.players[0].name).toBe('host');
    expect(Math.abs(body.serverNow - Date.now())).toBeLessThan(5000);
    expect((await getRoom(get('/api/kamisabi/room/ZZZZZ'), ctx('ZZZZZ'))).status).toBe(404);
  });
});

describe('POST /api/kamisabi/room/[code]/join', () => {
  test('加入：seat 遞增、token 各自不同', async () => {
    const r = await openRoom();
    const g1 = await joinAs(r.code, 'g1');
    const g2 = await joinAs(r.code, 'g22');
    expect(g1.seat).toBe(1);
    expect(g2.seat).toBe(2);
    expect(g1.token).not.toBe(g2.token);
  });

  test('已開始 → 409 ROOM_STARTED；滿 8 人 → 409 ROOM_FULL；壞 JSON → 400', async () => {
    const r = await openRoom();
    const room = await fake.getRoomByCode(r.code);
    for (let i = 1; i < 8; i++) await joinAs(r.code, `p${'x'.repeat(i)}`);
    const full = await joinRoom(post(`/api/kamisabi/room/${r.code}/join`, { name: 'late' }), ctx(r.code));
    expect(full.status).toBe(409);
    expect((await full.json()).code).toBe('ROOM_FULL');

    await fake.updateRoom(room!.id, 0, { status: 'playing' });
    const started = await joinRoom(post(`/api/kamisabi/room/${r.code}/join`, { name: 'late' }), ctx(r.code));
    expect((await started.json()).code).toBe('ROOM_STARTED');

    const bad = await joinRoom(new Request(`http://localhost/api/kamisabi/room/${r.code}/join`, { method: 'POST', body: '{nope' }), ctx(r.code));
    expect(bad.status).toBe(400);
  });
});
