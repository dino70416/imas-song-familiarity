import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { mockRoomFetch } from './helpers/mockRoomFetch';
import IntroGame from '../components/kamisabi/room/IntroGame';
import type { IntroState, PlayerRow, RoomSong } from '@/lib/kamisabiRoom/types';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';

const song = (id: string, points: 1 | 2 = 1): RoomSong => ({ id, title: `Song ${id}`, brand: 'music_ml', trackId: `t${id}`, artworkUrl: null, releaseDate: null, points });
const SONGS = [song('a'), song('b', 2), song('c')];
const host: PlayerRow = { id: 'p1', room_id: 'r1', name: '房主', seat: 0, is_host: true, joined_at: '' };
const guest: PlayerRow = { id: 'p2', room_id: 'r1', name: '未来', seat: 1, is_host: false, joined_at: '' };
const players = [host, guest];

function roomWith(state: Partial<IntroState>, mode: 'intro' | 'karuta' = 'intro'): PublicRoom {
  return {
    id: 'r1', code: 'ABCDE', mode, status: 'playing', brand: 'music_ml', songs: SONGS, version: 3,
    state: { kind: 'intro', round: 1, currentSongId: 'a', startsAt: new Date(Date.now() + 50).toISOString(), resolved: false, resolvedAt: null, ready: ['p1', 'p2'], layout: [], taken: {}, scores: {}, pendingDiscards: {}, lastResult: null, ...state },
  };
}
const session = { playerId: 'p2', token: 'tok', name: '未来' };
const toLocalTime = (iso: string) => Date.parse(iso);
const preview = { trackId: 'ta', previewUrl: 'https://cdn/a.m4a', artworkUrl: null, trackViewUrl: null, trackName: null, artistName: null, collectionName: null };

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
});

describe('IntroGame', () => {
  test('顯示所有歌牌、載入試聽並排程播放、點對牌 → claim → 綠框與訊息', async () => {
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview\?trackId=ta/, handle: () => ({ json: preview }) },
      { method: 'POST', match: /\/ready$/, handle: () => ({ json: { state: {} } }) },
      { method: 'POST', match: /\/claim$/, handle: () => ({ json: { result: 'correct', cards: [], finished: false } }) },
    ]);
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<IntroGame code="ABCDE" room={roomWith({})} players={players} me={guest} session={session} refresh={refresh} toLocalTime={toLocalTime} />);

    expect(screen.getByText('Song a')).toBeDefined();
    expect(screen.getByText('Song b')).toBeDefined();
    expect(screen.getByText('★2pt')).toBeDefined();
    await waitFor(() => expect((screen.getByTestId('room-audio') as HTMLAudioElement).src).toBe('https://cdn/a.m4a'));

    fireEvent.click(screen.getByText('🔊 準備完成'));
    await waitFor(() => expect(screen.queryByText('🔊 準備完成')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Song a/ }));
    await waitFor(() => expect(screen.getByText(/取得『Song a』/)).toBeDefined());
    const claim = calls.find((c) => c.method === 'POST' && /\/claim$/.test(c.url))!;
    expect(claim.body).toEqual({ songId: 'a', round: 1 });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Song a/ }).className).toContain('is-correct');
  });

  test('點錯 → お手つき 對話框列出自己的牌 → 丟牌', async () => {
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: { ...preview, trackId: 'tb', previewUrl: 'https://cdn/b.m4a' } }) },
      { method: 'POST', match: /\/claim$/, handle: () => ({ json: { result: 'otetsuki', cards: [song('c')], finished: false } }) },
      { method: 'POST', match: /\/discard$/, handle: () => ({ json: { state: {} } }) },
    ]);
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<IntroGame code="ABCDE" room={roomWith({ currentSongId: 'b', taken: { c: 'p2' }, scores: { p2: 1 } })} players={players} me={guest} session={session} refresh={refresh} toLocalTime={toLocalTime} />);

    fireEvent.click(screen.getByRole('button', { name: /Song a/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Song c')).toBeDefined();
    expect(screen.getByRole('button', { name: /Song a/ }).className).toContain('is-wrong');
    fireEvent.click(within(dialog).getByRole('button', { name: /Song c/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.find((c) => /\/discard$/.test(c.url))!.body).toEqual({ songId: 'c' });
  });

  test('已被取走的牌灰化並顯示名牌、不能點；慢了一步顯示伺服器訊息', async () => {
    mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: preview }) },
      { method: 'POST', match: /\/claim$/, handle: () => ({ status: 409, json: { error: '慢了一步，這張已經被取走了。', code: 'ROUND_RESOLVED' } }) },
    ]);
    render(<IntroGame code="ABCDE" room={roomWith({ taken: { c: 'p1' }, scores: { p1: 1 } })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    const takenCard = screen.getByRole('button', { name: /Song c/ }) as HTMLButtonElement;
    expect(takenCard.disabled).toBe(true);
    expect(takenCard.className).toContain('is-taken');
    expect(within(takenCard).getByText('房主')).toBeDefined();
    expect(screen.getByText(/房主：1 分/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Song a/ }));
    await waitFor(() => expect(screen.getByText('慢了一步，這張已經被取走了。')).toBeDefined());
  });

  test('開始前：「準備完成」送 /ready；全員到齊只有房主看到「▶ 遊戲開始」→ /next round 0；沒有「下一張」；觀戰者不能點牌', async () => {
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: preview }) },
      { method: 'POST', match: /\/ready$/, handle: () => ({ json: { state: {} } }) },
      { method: 'POST', match: /\/next$/, handle: () => ({ json: { state: {}, finished: false } }) },
    ]);
    const hostSession = { playerId: 'p1', token: 'htok', name: '房主' };
    const notStarted = { round: 0, currentSongId: null, startsAt: null };
    const { rerender, unmount } = render(<IntroGame code="ABCDE" room={roomWith({ ...notStarted, ready: ['p2'] })} players={players} me={host} session={hostSession} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    expect(screen.getByText(/等待大家準備（1\/2）/)).toBeDefined();
    expect(screen.queryByText('▶ 遊戲開始')).toBeNull();
    expect(screen.queryByText('▶ 下一張')).toBeNull();
    expect(screen.getByText(/✅ 未来/)).toBeDefined();

    fireEvent.click(screen.getByText('🔊 準備完成'));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && /\/ready$/.test(c.url))).toBe(true));

    rerender(<IntroGame code="ABCDE" room={{ ...roomWith({ ...notStarted, ready: ['p2', 'p1'] }), version: 4 }} players={players} me={host} session={hostSession} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    fireEvent.click(screen.getByText('▶ 遊戲開始'));
    await waitFor(() => expect(calls.some((c) => /\/next$/.test(c.url))).toBe(true));
    expect(calls.find((c) => /\/next$/.test(c.url))!.body).toEqual({ round: 0 });
    expect(screen.getByText('結束遊戲')).toBeDefined();
    unmount();

    // 非房主：全員到齊也只能等房主
    const { unmount: unmount2 } = render(<IntroGame code="ABCDE" room={roomWith({ ...notStarted, ready: ['p1', 'p2'] })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    expect(screen.queryByText('▶ 遊戲開始')).toBeNull();
    expect(screen.getByText(/等待房主開始/)).toBeDefined();
    unmount2();

    render(<IntroGame code="ABCDE" room={roomWith({})} players={players} me={null} session={null} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    expect(screen.getByText(/觀戰模式/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Song a/ })).toBeNull();
    expect(screen.queryByText('▶ 下一張')).toBeNull();
    expect(screen.queryByText('▶ 遊戲開始')).toBeNull();
  });

  test('有人取得後：顯示倒數，時間到房主的瀏覽器自動送 /next 帶 round；卸載就取消', async () => {
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: preview }) },
      { method: 'POST', match: /\/next$/, handle: () => ({ json: { state: {}, finished: false } }) },
    ]);
    const hostSession = { playerId: 'p1', token: 'htok', name: '房主' };
    const refresh = vi.fn().mockResolvedValue(undefined);
    // 剛取得：5 秒倒數，還不會送
    const { unmount } = render(<IntroGame code="ABCDE" room={roomWith({ resolved: true, resolvedAt: new Date().toISOString(), taken: { a: 'p2' } })} players={players} me={host} session={hostSession} refresh={refresh} toLocalTime={toLocalTime} />);
    expect(screen.getByText(/[45] 秒後自動出下一張/)).toBeDefined();
    unmount();
    expect(calls.some((c) => /\/next$/.test(c.url))).toBe(false);

    // 取得已超過 5 秒（例如剛重新整理）：馬上送
    render(<IntroGame code="ABCDE" room={roomWith({ resolved: true, resolvedAt: new Date(Date.now() - 6000).toISOString(), taken: { a: 'p2' } })} players={players} me={host} session={hostSession} refresh={refresh} toLocalTime={toLocalTime} />);
    await waitFor(() => expect(calls.some((c) => /\/next$/.test(c.url))).toBe(true));
    expect(calls.find((c) => /\/next$/.test(c.url))!.body).toEqual({ round: 1 });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  test('卸載後排程取消，不會再送 /next', async () => {
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: preview }) },
      { method: 'POST', match: /\/next$/, handle: () => ({ json: { state: {}, finished: false } }) },
    ]);
    const { unmount } = render(<IntroGame code="ABCDE" room={roomWith({ resolved: true, resolvedAt: new Date(Date.now() - 6000).toISOString(), taken: { a: 'p2' } })} players={players} me={host} session={{ playerId: 'p1', token: 'htok', name: '房主' }} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    unmount();
    await new Promise((r) => setTimeout(r, 400));
    expect(calls.some((c) => /\/next$/.test(c.url))).toBe(false);
  });

  test('非房主晚 2 秒才當備援觸發；伺服器回 NOT_DUE 就 1 秒後重試', async () => {
    vi.useFakeTimers();
    let nextCalls = 0;
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: preview }) },
      { method: 'POST', match: /\/next$/, handle: () => (++nextCalls === 1 ? { status: 409, json: { error: '還沒到', code: 'NOT_DUE' } } : { json: { state: {}, finished: false } }) },
    ]);
    render(<IntroGame code="ABCDE" room={roomWith({ resolved: true, resolvedAt: new Date(Date.now() - 6000).toISOString(), taken: { a: 'p2' } })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(calls.filter((c) => /\/next$/.test(c.url)).length).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(calls.filter((c) => /\/next$/.test(c.url)).length).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(calls.filter((c) => /\/next$/.test(c.url)).length).toBe(2);
    vi.useRealTimers();
  });

  test('沒人答對：開始播放 35 秒後自動換下一張', async () => {
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: preview }) },
      { method: 'POST', match: /\/next$/, handle: () => ({ json: { state: {}, finished: false } }) },
    ]);
    render(<IntroGame code="ABCDE" room={roomWith({ startsAt: new Date(Date.now() - 36_000).toISOString() })} players={players} me={host} session={{ playerId: 'p1', token: 'htok', name: '房主' }} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    await waitFor(() => expect(calls.some((c) => /\/next$/.test(c.url))).toBe(true));
    expect(calls.find((c) => /\/next$/.test(c.url))!.body).toEqual({ round: 1 });
  });

  test('かるた：沒有 mp3（HEAD 404）→ 抓歌詞 → jsdom 沒有 speechSynthesis → 顯示提示', async () => {
    const calls = mockRoomFetch([
      { method: 'HEAD', match: /\/kamisabi\/tts\/a\.mp3$/, handle: () => ({ status: 404 }) },
      { match: /\/lyrics\?songId=a$/, handle: () => ({ json: { text: 'ラララ' } }) },
    ]);
    render(<IntroGame code="ABCDE" room={roomWith({}, 'karuta')} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    await waitFor(() => expect(screen.getByText(/此裝置無法朗讀/)).toBeDefined());
    expect(calls.some((c) => c.method === 'HEAD')).toBe(true);
    expect(calls.some((c) => /\/api\/apple\/preview/.test(c.url))).toBe(false);
  });

  test('動作後要等 refresh 完成才解除 busy（避免用舊狀態再點一次）', async () => {
    mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: preview }) },
      { method: 'POST', match: /\/claim$/, handle: () => ({ json: { result: 'correct', cards: [], finished: false } }) },
    ]);
    let release!: () => void;
    const refresh = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    render(<IntroGame code="ABCDE" room={roomWith({})} players={players} me={guest} session={session} refresh={refresh} toLocalTime={toLocalTime} />);
    fireEvent.click(screen.getByRole('button', { name: /Song a/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // refresh 還沒完成：其他牌仍然不能點
    expect((screen.getByRole('button', { name: /Song b/ }) as HTMLButtonElement).disabled).toBe(true);
    release();
    await waitFor(() => expect((screen.getByRole('button', { name: /Song b/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  test('歌牌依 state.layout 的順序排列（每局洗牌、所有人一致）；沒有 layout 時退回曲名排序', () => {
    mockRoomFetch([{ match: /\/api\/apple\/preview/, handle: () => ({ json: preview }) }]);
    const { unmount } = render(<IntroGame code="ABCDE" room={roomWith({ layout: ['c', 'a', 'b'] })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    const titles = () => within(screen.getByTestId('card-grid')).getAllByRole('button').map((b) => b.textContent?.match(/Song [abc]/)?.[0]);
    expect(titles()).toEqual(['Song c', 'Song a', 'Song b']);
    unmount();

    render(<IntroGame code="ABCDE" room={roomWith({ layout: [] })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    expect(titles()).toEqual(['Song a', 'Song b', 'Song c']);
  });

  test('重新整理後若仍有待丟的牌，自動打開丟牌對話框', async () => {
    mockRoomFetch([{ match: /\/api\/apple\/preview/, handle: () => ({ json: preview }) }]);
    render(<IntroGame code="ABCDE" room={roomWith({ taken: { c: 'p2' }, pendingDiscards: { p2: 1 } })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Song c')).toBeDefined();
  });
});
