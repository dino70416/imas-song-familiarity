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

import { POST as startRoom } from '@/app/api/kamisabi/room/[code]/start/route';
import { POST as nextCard } from '@/app/api/kamisabi/room/[code]/next/route';
import { POST as claimCard } from '@/app/api/kamisabi/room/[code]/claim/route';
import { POST as discardCard } from '@/app/api/kamisabi/room/[code]/discard/route';
import { POST as endRoom } from '@/app/api/kamisabi/room/[code]/end/route';
import type { IntroState } from '@/lib/kamisabiRoom/types';

async function introGame() {
  const host = await openRoom();
  const guest = await joinAs(host.code, 'guest');
  const res = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'intro' }, host.token), ctx(host.code));
  expect(res.status).toBe(200);
  return { host, guest, code: host.code };
}
async function state(code: string) {
  return (await fake.getRoomByCode(code))!.state as IntroState;
}

describe('start / next / claim / discard / end', () => {
  test('start：非房主 403；人數不足 400；成功後 status=playing、mode 寫入、state 初始化', async () => {
    const host = await openRoom();
    const alone = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'intro' }, host.token), ctx(host.code));
    expect((await alone.json()).code).toBe('NOT_ENOUGH_PLAYERS');
    const guest = await joinAs(host.code, 'guest');
    const forbidden = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'intro' }, guest.token), ctx(host.code));
    expect(forbidden.status).toBe(403);
    const badMode = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'best5' }, host.token), ctx(host.code));
    expect(badMode.status).toBe(400);
    const ok = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'karuta' }, host.token), ctx(host.code));
    expect(ok.status).toBe(200);
    const room = await fake.getRoomByCode(host.code);
    expect(room).toMatchObject({ status: 'playing', mode: 'karuta', version: 1 });
    expect((room!.state as IntroState).kind).toBe('intro');
    const again = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'intro' }, host.token), ctx(host.code));
    expect((await again.json()).code).toBe('ROOM_STARTED');
  });

  test('next → claim 正確 → next → 全部取完自動 finished', async () => {
    const { host, guest, code } = await introGame();
    const n1 = await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, host.token), ctx(code));
    expect(n1.status).toBe(200);
    let s = await state(code);
    expect(s.round).toBe(1);
    expect(s.currentSongId).not.toBeNull();
    expect(Date.parse(s.startsAt!)).toBeGreaterThan(Date.now());

    // 非房主不能出題
    expect((await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, guest.token), ctx(code))).status).toBe(403);

    const c1 = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, guest.token), ctx(code));
    expect(c1.status).toBe(200);
    expect(await c1.json()).toMatchObject({ result: 'correct', finished: false });
    s = await state(code);
    expect(s.taken[s.currentSongId!]).toBe(guest.playerId);
    expect(s.resolved).toBe(true);

    // 慢了一步
    const late = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, host.token), ctx(code));
    expect(late.status).toBe(409);
    expect((await late.json()).code).toBe('ROUND_RESOLVED');

    // 把剩下兩張都拿掉 → finished
    for (let i = 0; i < 2; i++) {
      await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, host.token), ctx(code));
      s = await state(code);
      const res = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, host.token), ctx(code));
      expect(res.status).toBe(200);
    }
    expect((await fake.getRoomByCode(code))!.status).toBe('finished');
    s = await state(code);
    expect(s.scores[host.playerId]).toBeGreaterThan(0);
  });

  test('お手つき：有牌的人收到可丟的牌，丟完才能再搶', async () => {
    const { host, guest, code } = await introGame();
    await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, host.token), ctx(code));
    let s = await state(code);
    await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, guest.token), ctx(code));
    const firstCard = s.currentSongId!;

    await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, host.token), ctx(code));
    s = await state(code);
    const wrong = SONGS.find((x) => x.id !== s.currentSongId && x.id !== firstCard)!.id;
    const o = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: wrong }, guest.token), ctx(code));
    expect(o.status).toBe(200);
    const body = await o.json();
    expect(body.result).toBe('otetsuki');
    expect(body.cards.map((c: RoomSong) => c.id)).toEqual([firstCard]);

    const blocked = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, guest.token), ctx(code));
    expect((await blocked.json()).code).toBe('DISCARD_PENDING');

    const notMine = await discardCard(post(`/api/kamisabi/room/${code}/discard`, { songId: wrong }, guest.token), ctx(code));
    expect(notMine.status).toBe(400);
    const d = await discardCard(post(`/api/kamisabi/room/${code}/discard`, { songId: firstCard }, guest.token), ctx(code));
    expect(d.status).toBe(200);
    s = await state(code);
    expect(s.taken[firstCard]).toBeUndefined();
    expect(s.pendingDiscards).toEqual({});

    const ok = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, guest.token), ctx(code));
    expect(ok.status).toBe(200);
  });

  test('沒牌的人點錯 → otetsuki_no_cards，不用丟牌', async () => {
    const { host, guest, code } = await introGame();
    await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, host.token), ctx(code));
    const s = await state(code);
    const wrong = SONGS.find((x) => x.id !== s.currentSongId)!.id;
    const o = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: wrong }, guest.token), ctx(code));
    expect(await o.json()).toMatchObject({ result: 'otetsuki_no_cards', cards: [] });
  });

  test('claim 在 lobby / 時間軸模式 → 409；end 只有房主', async () => {
    const host = await openRoom();
    const guest = await joinAs(host.code, 'guest');
    const lobby = await claimCard(post(`/api/kamisabi/room/${host.code}/claim`, { songId: 'a' }, guest.token), ctx(host.code));
    expect(lobby.status).toBe(409);
    expect((await endRoom(post(`/api/kamisabi/room/${host.code}/end`, {}, guest.token), ctx(host.code))).status).toBe(403);
    const ended = await endRoom(post(`/api/kamisabi/room/${host.code}/end`, {}, host.token), ctx(host.code));
    expect(ended.status).toBe(200);
    expect((await fake.getRoomByCode(host.code))!.status).toBe('finished');
  });
});
