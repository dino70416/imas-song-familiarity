import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { mockRoomFetch } from './helpers/mockRoomFetch';
import type { PlayerRow, RoomSong } from '@/lib/kamisabiRoom/types';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('@/lib/supabase/browser', () => ({ getSupabaseBrowser: () => null }));

import RoomClient from '../components/kamisabi/room/RoomClient';

const song = (id: string): RoomSong => ({ id, title: `Song ${id}`, brand: 'music_ml', trackId: `t${id}`, artworkUrl: null, releaseDate: null, points: 1 });
const host: PlayerRow = { id: 'p1', room_id: 'r1', name: '房主', seat: 0, is_host: true, joined_at: '' };

function makeDoc() {
  const doc = {
    room: { id: 'r1', code: 'ABCDE', mode: null, status: 'lobby', brand: 'music_ml', songs: [song('a'), song('b')], state: {}, version: 0 } as PublicRoom,
    players: [host] as PlayerRow[],
  };
  const calls = mockRoomFetch([
    { match: /\/api\/kamisabi\/room\/ABCDE$/, handle: () => ({ json: { room: doc.room, players: doc.players, serverNow: Date.now() } }) },
    {
      method: 'POST', match: /\/join$/, handle: (body) => {
        const b = body as { name: string };
        doc.players = [...doc.players, { id: 'p2', room_id: 'r1', name: b.name, seat: 1, is_host: false, joined_at: '' }];
        return { status: 201, json: { playerId: 'p2', token: 'tok2', seat: 1 } };
      },
    },
    {
      method: 'POST', match: /\/start$/, handle: (body) => {
        const b = body as { mode: 'intro' | 'karuta' | 'timeline' };
        doc.room = { ...doc.room, mode: b.mode, status: 'playing', version: 1, state: { kind: 'intro', round: 0, currentSongId: null, startsAt: null, resolved: false, taken: {}, scores: {}, pendingDiscards: {}, lastResult: null } };
        return { json: { state: doc.room.state } };
      },
    },
  ]);
  return { doc, calls };
}

beforeEach(() => localStorage.clear());

describe('RoomClient', () => {
  test('沒有 session → 加入表單 → 加入後進大廳（非房主看到等待訊息），session 存進 localStorage', async () => {
    const { calls } = makeDoc();
    render(<RoomClient code="ABCDE" />);
    const input = await screen.findByLabelText('你的名字');
    fireEvent.change(input, { target: { value: '未来' } });
    fireEvent.click(screen.getByText('加入房間'));
    await waitFor(() => expect(screen.getByText(/等待房主開始/)).toBeDefined());
    expect(screen.getByText(/未来/)).toBeDefined();
    expect(calls.find((c) => /\/join$/.test(c.url))!.body).toEqual({ name: '未来' });
    expect(JSON.parse(localStorage.getItem('kamisabi:room:ABCDE')!)).toMatchObject({ playerId: 'p2', token: 'tok2' });
    expect(screen.queryByText('開始遊戲')).toBeNull();
  });

  test('房主：大廳顯示房號、玩法選單；人數不足時不能開始；加入第二人後開始 → 進遊戲畫面', async () => {
    const { doc, calls } = makeDoc();
    localStorage.setItem('kamisabi:room:ABCDE', JSON.stringify({ playerId: 'p1', token: 'tok1', name: '房主' }));
    render(<RoomClient code="ABCDE" />);
    await screen.findByText('ABCDE');
    const startBtn = screen.getByText('開始遊戲') as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);
    expect(screen.getByText(/至少需要 2 位玩家/)).toBeDefined();

    // 模擬另一個人加入（輪詢會抓到；這裡直接改資料再觸發 visibilitychange 讓它重抓）
    doc.players = [host, { id: 'p2', room_id: 'r1', name: '未来', seat: 1, is_host: false, joined_at: '' }];
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect((screen.getByText('開始遊戲') as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(screen.getByLabelText(/かるたモード/));
    fireEvent.click(screen.getByText('開始遊戲'));
    await waitFor(() => expect(screen.getByText(/かるたモード · 房間 ABCDE/)).toBeDefined());
    expect(calls.find((c) => /\/start$/.test(c.url))!.body).toEqual({ mode: 'karuta' });
  });

  test('進房後暫時性的連線錯誤：畫面留在原地、顯示連線提示，不換成整頁錯誤', async () => {
    const { doc } = makeDoc();
    localStorage.setItem('kamisabi:room:ABCDE', JSON.stringify({ playerId: 'p1', token: 'tok1', name: '房主' }));
    render(<RoomClient code="ABCDE" />);
    await screen.findByText('ABCDE');

    // 之後的 GET 全部失敗（模擬手機網路閃斷）
    const original = global.fetch;
    global.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(screen.getByText(/無法連線到房間/)).toBeDefined());
    expect(screen.getByText('ABCDE')).toBeDefined();          // 大廳還在
    expect(screen.queryByText(/回到 KAMISABI/)).toBeNull();    // 沒有變成整頁錯誤

    // 網路恢復 → 提示消失
    global.fetch = original;
    doc.players = [host];
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(screen.queryByText(/無法連線到房間/)).toBeNull());
  });

  test('遊戲已開始且沒有 session → 觀戰模式，不會白屏', async () => {
    const { doc } = makeDoc();
    doc.room = { ...doc.room, mode: 'intro', status: 'playing', state: { kind: 'intro', round: 0, currentSongId: null, startsAt: null, resolved: false, taken: {}, scores: {}, pendingDiscards: {}, lastResult: null } };
    render(<RoomClient code="ABCDE" />);
    await waitFor(() => expect(screen.getByText(/觀戰模式/)).toBeDefined());
    expect(screen.queryByLabelText('你的名字')).toBeNull();
  });

  test('結束 → 結算排名；找不到房間 → 錯誤訊息與回首頁連結', async () => {
    const { doc } = makeDoc();
    doc.room = { ...doc.room, mode: 'intro', status: 'finished', state: { kind: 'intro', round: 2, currentSongId: null, startsAt: null, resolved: true, taken: { a: 'p1', b: 'p2' }, scores: { p1: 1, p2: 1 }, pendingDiscards: {}, lastResult: null } };
    doc.players = [host, { id: 'p2', room_id: 'r1', name: '未来', seat: 1, is_host: false, joined_at: '' }];
    const { unmount } = render(<RoomClient code="ABCDE" />);
    await waitFor(() => expect(screen.getByText(/遊戲結束/)).toBeDefined());
    expect(screen.getByText(/房主/)).toBeDefined();
    expect(screen.getAllByText(/1 分/).length).toBe(2);
    unmount();

    mockRoomFetch([{ match: /\/api\/kamisabi\/room\/ZZZZZ$/, handle: () => ({ status: 404, json: { error: '找不到這個房間。', code: 'ROOM_NOT_FOUND' } }) }]);
    render(<RoomClient code="ZZZZZ" />);
    await waitFor(() => expect(screen.getByText(/找不到這個房間。/)).toBeDefined());
    expect(screen.getByText(/回到 KAMISABI/).getAttribute('href')).toBe('/kamisabi');
  });
});
