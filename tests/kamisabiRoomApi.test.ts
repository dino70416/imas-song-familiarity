import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FakeStore } from './helpers/fakeRoomStore';
import { AUTO_NEXT_DELAY_MS, NEXT_CARD_DELAY_MS, ROUND_TIMEOUT_MS, type RoomSong } from '@/lib/kamisabiRoom/types';

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

// 路由用 Date.now() 判斷「可以換下一張了沒」；測試用位移的假時鐘往前撥
const realNow = Date.now;
let clockOffset = 0;
const advance = (ms: number) => { clockOffset += ms; };

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
  clockOffset = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + clockOffset);
});
afterEach(() => {
  vi.mocked(Date.now).mockRestore();
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
import { POST as readyUp } from '@/app/api/kamisabi/room/[code]/ready/route';
import type { IntroState } from '@/lib/kamisabiRoom/types';

async function introGame() {
  const host = await openRoom();
  const guest = await joinAs(host.code, 'guest');
  const res = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'intro' }, host.token), ctx(host.code));
  expect(res.status).toBe(200);
  return { host, guest, code: host.code };
}
/** 兩人都按「準備完成」、房主按「遊戲開始」→ 第 1 張 */
async function dealFirstCard(code: string, host: { token: string }, guest: { token: string }) {
  for (const p of [host, guest]) {
    expect((await readyUp(post(`/api/kamisabi/room/${code}/ready`, {}, p.token), ctx(code))).status).toBe(200);
  }
  const res = await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 0 }, host.token), ctx(code));
  expect(res.status).toBe(200);
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

  test('ready：大廳時 409 NOT_PLAYING', async () => {
    const host = await openRoom();
    const guest = await joinAs(host.code, 'guest');
    const inLobby = await readyUp(post(`/api/kamisabi/room/${host.code}/ready`, {}, guest.token), ctx(host.code));
    expect(inLobby.status).toBe(409);
    expect((await inLobby.json()).code).toBe('NOT_PLAYING');
  });

  test('準備完成 → 房主遊戲開始 → claim 正確 → 5 秒後任何人都能觸發下一張 → 全部取完自動 finished', async () => {
    const { host, guest, code } = await introGame();
    // 還沒人準備：房主不能開始
    const early = await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 0 }, host.token), ctx(code));
    expect(early.status).toBe(409);
    expect((await early.json()).code).toBe('NOT_ALL_READY');
    expect((await readyUp(post(`/api/kamisabi/room/${code}/ready`, {}, guest.token), ctx(code))).status).toBe(200);
    expect((await readyUp(post(`/api/kamisabi/room/${code}/ready`, {}, guest.token), ctx(code))).status).toBe(200); // 重複按沒事
    let s = await state(code);
    expect(s.ready).toEqual([guest.playerId]);
    expect((await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 0 }, host.token), ctx(code))).status).toBe(409);
    await readyUp(post(`/api/kamisabi/room/${code}/ready`, {}, host.token), ctx(code));
    // 非房主永遠不能出第一張
    expect((await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 0 }, guest.token), ctx(code))).status).toBe(403);

    const n1 = await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 0 }, host.token), ctx(code));
    expect(n1.status).toBe(200);
    s = await state(code);
    expect(s.round).toBe(1);
    expect(s.currentSongId).not.toBeNull();
    expect(Date.parse(s.startsAt!)).toBeGreaterThan(Date.now());

    // 題目進行中、沒人答對：還沒到時限誰都不能換
    const tooSoon = await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 1 }, host.token), ctx(code));
    expect(tooSoon.status).toBe(409);
    expect((await tooSoon.json()).code).toBe('NOT_DUE');

    const c1 = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, guest.token), ctx(code));
    expect(c1.status).toBe(200);
    expect(await c1.json()).toMatchObject({ result: 'correct', finished: false });
    s = await state(code);
    expect(s.taken[s.currentSongId!]).toBe(guest.playerId);
    expect(s.resolved).toBe(true);
    expect(Date.now() - Date.parse(s.resolvedAt!)).toBeLessThan(2000);

    // 慢了一步
    const late = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, host.token), ctx(code));
    expect(late.status).toBe(409);
    expect((await late.json()).code).toBe('ROUND_RESOLVED');

    // 取得後 5 秒內還不能換
    const notYet = await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 1 }, guest.token), ctx(code));
    expect((await notYet.json()).code).toBe('NOT_DUE');
    advance(AUTO_NEXT_DELAY_MS + 1);
    // 帶過期的 round（別的分頁已經換過）→ 409，不會跳過一張
    const stale = await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 0 }, guest.token), ctx(code));
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe('ROUND_ADVANCED');
    // 時間到：非房主也能觸發（房主分頁沒開也不會卡住）
    const n2 = await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 1 }, guest.token), ctx(code));
    expect(n2.status).toBe(200);
    s = await state(code);
    expect(s.round).toBe(2);
    expect(s.resolved).toBe(false);
    expect(s.resolvedAt).toBeNull();

    // 把剩下兩張都拿掉：最後一張被取走時由 claim 直接結束
    s = await state(code);
    expect((await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, host.token), ctx(code))).status).toBe(200);
    advance(AUTO_NEXT_DELAY_MS + 1);
    expect((await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, guest.token), ctx(code))).status).toBe(200);
    s = await state(code);
    const last = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, host.token), ctx(code));
    expect(await last.json()).toMatchObject({ result: 'correct', finished: true });
    expect((await fake.getRoomByCode(code))!.status).toBe('finished');
    s = await state(code);
    expect(s.scores[host.playerId]).toBeGreaterThan(0);
  });

  test('沒人答對：開始播放 35 秒後才能換下一張，那首歌留在場上', async () => {
    const { host, guest, code } = await introGame();
    await dealFirstCard(code, host, guest);
    const s1 = await state(code);
    advance(NEXT_CARD_DELAY_MS + ROUND_TIMEOUT_MS - 1000);
    expect((await (await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 1 }, guest.token), ctx(code))).json()).code).toBe('NOT_DUE');
    advance(1001);
    expect((await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 1 }, guest.token), ctx(code))).status).toBe(200);
    const s2 = await state(code);
    expect(s2.round).toBe(2);
    expect(s2.taken).toEqual({});
    expect(s2.currentSongId).not.toBe(s1.currentSongId);
  });

  test('お手つき：有牌的人收到可丟的牌，丟完才能再搶', async () => {
    const { host, guest, code } = await introGame();
    await dealFirstCard(code, host, guest);
    let s = await state(code);
    await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, guest.token), ctx(code));
    const firstCard = s.currentSongId!;

    advance(AUTO_NEXT_DELAY_MS + 1);
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

  test('claim 撞上自動換題（寫入前時限到、先被換題）→ 409 ROUND_RESOLVED，不算お手つき', async () => {
    const { host, guest, code } = await introGame();
    await dealFirstCard(code, host, guest);
    const s1 = await state(code);
    // guest 點的是第 1 回合的正確牌，但在 guest 寫入前時限到了、別人的瀏覽器先換了第 2 張
    advance(NEXT_CARD_DELAY_MS + ROUND_TIMEOUT_MS + 1);
    fake._setBeforeUpdate(async () => {
      const n = await nextCard(post(`/api/kamisabi/room/${code}/next`, { round: 1 }, host.token), ctx(code));
      expect(n.status).toBe(200);
    });
    const res = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s1.currentSongId, round: s1.round }, guest.token), ctx(code));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ROUND_RESOLVED');
    const s2 = await state(code);
    expect(s2.round).toBe(2);
    expect(s2.pendingDiscards).toEqual({});
    expect(s2.lastResult).toBeNull();
  });

  test('兩人同時點對牌：後寫入的人重試後拿到 409 ROUND_RESOLVED，不是 500 也不是お手つき', async () => {
    const { host, guest, code } = await introGame();
    await dealFirstCard(code, host, guest);
    const s1 = await state(code);
    fake._setBeforeUpdate(async () => {
      const first = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s1.currentSongId, round: s1.round }, host.token), ctx(code));
      expect(first.status).toBe(200);
    });
    const second = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s1.currentSongId, round: s1.round }, guest.token), ctx(code));
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe('ROUND_RESOLVED');
    const s2 = await state(code);
    expect(s2.taken[s1.currentSongId!]).toBe(host.playerId);
    expect(s2.pendingDiscards).toEqual({});
  });

  test('沒牌的人點錯 → otetsuki_no_cards，不用丟牌', async () => {
    const { host, guest, code } = await introGame();
    await dealFirstCard(code, host, guest);
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

import { POST as placeCard } from '@/app/api/kamisabi/room/[code]/place/route';
import { GET as getHand } from '@/app/api/kamisabi/room/[code]/hand/route';
import type { TimelineState } from '@/lib/kamisabiRoom/types';

const DATED = Array.from({ length: 12 }, (_, i) => song(`d${String(i + 1).padStart(2, '0')}`, 1, `20${String(i + 10)}-01-01`));

describe('timeline: start / hand / place', () => {
  test('曲數不足 → 400 NOT_ENOUGH_DATED_SONGS，房間留在 lobby', async () => {
    const host = await openRoom();            // SONGS 都沒日期
    await joinAs(host.code, 'guest');
    const res = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'timeline' }, host.token), ctx(host.code));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('NOT_ENOUGH_DATED_SONGS');
    expect((await fake.getRoomByCode(host.code))!.status).toBe('lobby');
  });

  test('發牌後各自只看得到自己的手牌；輪到的人放牌；放錯罰抽', async () => {
    buildRoomSongs.mockResolvedValue(DATED);
    const host = await openRoom();
    const guest = await joinAs(host.code, 'guest');
    const started = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'timeline' }, host.token), ctx(host.code));
    expect(started.status).toBe(200);
    const code = host.code;
    let s = (await fake.getRoomByCode(code))!.state as TimelineState;
    expect(s.line).toHaveLength(1);
    expect(s.deckCount).toBe(1);

    const hHand = (await (await getHand(get(`/api/kamisabi/room/${code}/hand`, host.token), ctx(code))).json()).hand as string[];
    const gHand = (await (await getHand(get(`/api/kamisabi/room/${code}/hand`, guest.token), ctx(code))).json()).hand as string[];
    expect(hHand).toHaveLength(5);
    expect(gHand).toHaveLength(5);
    expect(hHand.some((id) => gHand.includes(id))).toBe(false);
    expect((await getHand(get(`/api/kamisabi/room/${code}/hand`), ctx(code))).status).toBe(401);

    const turn = s.order[s.turnSeat] === host.playerId ? { me: host, hand: hHand } : { me: guest, hand: gHand };
    const other = turn.me === host ? guest : host;

    // 不是你的回合
    const nyt = await placeCard(post(`/api/kamisabi/room/${code}/place`, { songId: 'd01', slot: 0 }, other.token), ctx(code));
    expect((await nyt.json()).code).toBe('NOT_YOUR_TURN');

    // 故意放錯：把手牌中最舊的放最右邊（初期札之後）── 除非初期札比它更舊，那就放最左邊
    const byId = new Map(DATED.map((x) => [x.id, x]));
    const oldest = [...turn.hand].sort((a, b) => byId.get(a)!.releaseDate!.localeCompare(byId.get(b)!.releaseDate!))[0];
    const initialDate = byId.get(s.line[0])!.releaseDate!;
    const wrongSlot = byId.get(oldest)!.releaseDate! <= initialDate ? 1 : 0;
    const wrong = await placeCard(post(`/api/kamisabi/room/${code}/place`, { songId: oldest, slot: wrongSlot }, turn.me.token), ctx(code));
    expect(wrong.status).toBe(200);
    const wb = await wrong.json();
    expect(wb.correct).toBe(false);
    expect(wb.hand).toHaveLength(6); // 罰抽
    expect(wb.releaseDate).toBe(byId.get(oldest)!.releaseDate);
    s = (await fake.getRoomByCode(code))!.state as TimelineState;
    expect(s.deckCount).toBe(0);
    expect(s.order[s.turnSeat]).toBe(other.playerId);

    // 換另一個人正確放：同一張邏輯反過來
    const oHand = (await (await getHand(get(`/api/kamisabi/room/${code}/hand`, other.token), ctx(code))).json()).hand as string[];
    const oOldest = [...oHand].sort((a, b) => byId.get(a)!.releaseDate!.localeCompare(byId.get(b)!.releaseDate!))[0];
    const rightSlot = byId.get(oOldest)!.releaseDate! <= initialDate ? 0 : 1;
    const right = await placeCard(post(`/api/kamisabi/room/${code}/place`, { songId: oOldest, slot: rightSlot }, other.token), ctx(code));
    const rb = await right.json();
    expect(rb.correct).toBe(true);
    expect(rb.hand).toHaveLength(4);
    expect(rb.finished).toBe(false);
    s = (await fake.getRoomByCode(code))!.state as TimelineState;
    expect(s.line).toHaveLength(2);

    // place 只寫回放牌者自己的手牌（一列），不重寫所有人的
    const lastWrite = fake._setHandsCalls().at(-1)!;
    expect(Object.keys(lastWrite)).toEqual([other.playerId]);
  });
});

import { GET as ping } from '@/app/api/kamisabi/ping/route';

describe('GET /api/kamisabi/ping', () => {
  test('沒設 CRON_SECRET 時任何人可打；刪掉 24 小時前的房', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const host = await openRoom();
    const room = fake._rooms().find((r) => r.code === host.code)!;
    room.updated_at = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const res = await ping(get('/api/kamisabi/ping'));
    expect(await res.json()).toEqual({ ok: true, deleted: 1 });
    expect(await fake.getRoomByCode(host.code)).toBeNull();
    vi.unstubAllEnvs();
  });
  test('設了 CRON_SECRET 就要對 → 否則 401', async () => {
    vi.stubEnv('CRON_SECRET', 'sekrit');
    expect((await ping(get('/api/kamisabi/ping'))).status).toBe(401);
    expect((await ping(get('/api/kamisabi/ping', 'sekrit'))).status).toBe(200);
    vi.unstubAllEnvs();
  });
});

vi.mock('@/scripts/karuta-lyrics', () => ({ KARUTA_LYRICS: { 'Song a': 'ラララ\nルルル' } }));
import { GET as getLyrics } from '@/app/api/kamisabi/room/[code]/lyrics/route';

describe('GET /api/kamisabi/room/[code]/lyrics', () => {
  test('只在かるた模式、只給當前題；沒歌詞 404', async () => {
    const host = await openRoom();
    const guest = await joinAs(host.code, 'guest');
    const code = host.code;
    const url = (songId: string) => `/api/kamisabi/room/${code}/lyrics?songId=${songId}`;
    await startRoom(post(`/api/kamisabi/room/${code}/start`, { mode: 'intro' }, host.token), ctx(code));
    await dealFirstCard(code, host, guest);
    expect((await getLyrics(get(url('a'), guest.token), ctx(code))).status).toBe(403);

    // 換成かるた
    const room = await fake.getRoomByCode(code);
    await fake.updateRoom(room!.id, room!.version, { mode: 'karuta' });
    const s = (await fake.getRoomByCode(code))!.state as IntroState;
    const other = SONGS.find((x) => x.id !== s.currentSongId)!.id;
    expect((await getLyrics(get(url(other), guest.token), ctx(code))).status).toBe(403);
    const res = await getLyrics(get(url(s.currentSongId!), guest.token), ctx(code));
    if (s.currentSongId === 'a') {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ text: 'ラララ\nルルル' });
    } else {
      expect(res.status).toBe(404);
    }
    expect((await getLyrics(get(url(s.currentSongId!)), ctx(code))).status).toBe(401);
  });
});
