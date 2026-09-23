import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    state: { kind: 'intro', round: 1, currentSongId: 'a', startsAt: new Date(Date.now() + 50).toISOString(), resolved: false, taken: {}, scores: {}, pendingDiscards: {}, lastResult: null, ...state },
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

describe('IntroGame', () => {
  test('顯示所有歌牌、載入試聽並排程播放、點對牌 → claim → 綠框與訊息', async () => {
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview\?trackId=ta/, handle: () => ({ json: preview }) },
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
    expect(claim.body).toEqual({ songId: 'a' });
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

  test('房主看得到「下一張」與「結束遊戲」；觀戰者不能點牌', async () => {
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: preview }) },
      { method: 'POST', match: /\/next$/, handle: () => ({ json: { state: {}, finished: false } }) },
    ]);
    const { unmount } = render(<IntroGame code="ABCDE" room={roomWith({ currentSongId: null, startsAt: null })} players={players} me={host} session={{ playerId: 'p1', token: 'htok', name: '房主' }} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    fireEvent.click(screen.getByText('▶ 下一張'));
    await waitFor(() => expect(calls.some((c) => /\/next$/.test(c.url))).toBe(true));
    expect(screen.getByText('結束遊戲')).toBeDefined();
    unmount();

    render(<IntroGame code="ABCDE" room={roomWith({})} players={players} me={null} session={null} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    expect(screen.getByText(/觀戰模式/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Song a/ })).toBeNull();
    expect(screen.queryByText('▶ 下一張')).toBeNull();
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

  test('重新整理後若仍有待丟的牌，自動打開丟牌對話框', async () => {
    mockRoomFetch([{ match: /\/api\/apple\/preview/, handle: () => ({ json: preview }) }]);
    render(<IntroGame code="ABCDE" room={roomWith({ taken: { c: 'p2' }, pendingDiscards: { p2: 1 } })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Song c')).toBeDefined();
  });
});
