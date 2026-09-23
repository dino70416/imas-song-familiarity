import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { mockRoomFetch } from './helpers/mockRoomFetch';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import RoomEntry from '../components/kamisabi/room/RoomEntry';

const songs = [
  { id: 's1', title: 'Song A', brand: 'music_ml', appleTrackId: '1', members: [], units: [] },
  { id: 's2', title: 'Song B', brand: 'music_ml', appleTrackId: '2', members: [], units: [] },
  { id: 's3', title: 'Song C', brand: 'music_shiny', appleTrackId: '3', members: [], units: [] },
];
const brandCounts = { music_ml: 2, music_shiny: 1 };

beforeEach(() => { push.mockReset(); localStorage.clear(); });

describe('RoomEntry', () => {
  test('開房：選品牌、勾シングル → POST create → 存 session → 導向房間', async () => {
    const calls = mockRoomFetch([{ method: 'POST', match: /\/api\/kamisabi\/room$/, handle: () => ({ status: 201, json: { code: 'QWERT', roomId: 'r', playerId: 'p1', token: 't1' } }) }]);
    render(<RoomEntry allSongs={songs} brandCounts={brandCounts} />);
    fireEvent.change(screen.getByLabelText('你的名字'), { target: { value: '房主' } });
    fireEvent.click(screen.getByLabelText(/ミリオンライブ/));
    fireEvent.click(screen.getByText(/標記シングル/));
    fireEvent.click(screen.getByLabelText('Song B'));
    fireEvent.click(screen.getByText('開房'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/kamisabi/room/QWERT'));
    expect(calls[0].body).toEqual({ name: '房主', brand: 'music_ml', singles: ['s2'] });
    expect(JSON.parse(localStorage.getItem('kamisabi:room:QWERT')!)).toMatchObject({ playerId: 'p1', token: 't1', name: '房主' });
  });

  test('加入：輸入房號（自動大寫）→ POST join → 導向；錯誤顯示訊息', async () => {
    mockRoomFetch([
      { method: 'POST', match: /\/api\/kamisabi\/room\/ABCDE\/join$/, handle: () => ({ status: 201, json: { playerId: 'p2', token: 't2', seat: 1 } }) },
      { method: 'POST', match: /\/api\/kamisabi\/room\/ZZZZZ\/join$/, handle: () => ({ status: 404, json: { error: '找不到這個房間。', code: 'ROOM_NOT_FOUND' } }) },
    ]);
    render(<RoomEntry allSongs={songs} brandCounts={brandCounts} />);
    fireEvent.click(screen.getByText('加入房間'));
    fireEvent.change(screen.getByLabelText('你的名字'), { target: { value: '未来' } });
    fireEvent.change(screen.getByLabelText('房間代碼'), { target: { value: 'zzzzz' } });
    fireEvent.click(screen.getByText('加入'));
    await waitFor(() => expect(screen.getByText('找不到這個房間。')).toBeDefined());
    fireEvent.change(screen.getByLabelText('房間代碼'), { target: { value: 'abcde' } });
    fireEvent.click(screen.getByText('加入'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/kamisabi/room/ABCDE'));
  });
});
