import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { mockRoomFetch } from './helpers/mockRoomFetch';
import TimelineGame from '../components/kamisabi/room/TimelineGame';
import type { PlayerRow, RoomSong, TimelineState } from '@/lib/kamisabiRoom/types';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';

const song = (id: string, date: string): RoomSong => ({ id, title: `Song ${id}`, brand: 'music_ml', trackId: `t${id}`, artworkUrl: null, releaseDate: date, points: 1 });
const SONGS = [song('d02', '2012-01-01'), song('d04', '2014-01-01'), song('d11', '2021-01-01'), song('d12', '2022-01-01')];
const host: PlayerRow = { id: 'p1', room_id: 'r1', name: '房主', seat: 0, is_host: true, joined_at: '' };
const guest: PlayerRow = { id: 'p2', room_id: 'r1', name: '未来', seat: 1, is_host: false, joined_at: '' };
const players = [host, guest];
const session = { playerId: 'p2', token: 'tok', name: '未来' };

function roomWith(state: Partial<TimelineState>): PublicRoom {
  return {
    id: 'r1', code: 'ABCDE', mode: 'timeline', status: 'playing', brand: 'music_ml', songs: SONGS, version: 5,
    state: { kind: 'timeline', order: ['p1', 'p2'], turnSeat: 1, deckCount: 1, line: ['d11'], handCounts: { p1: 5, p2: 2 }, winnerId: null, lastResult: null, ...state },
  };
}

describe('TimelineGame', () => {
  test('抓手牌、顯示時間軸（含日期）、選牌後點位置 → place → 顯示結果並更新手牌', async () => {
    const calls = mockRoomFetch([
      { match: /\/hand$/, handle: () => ({ json: { hand: ['d02', 'd04'] } }) },
      { method: 'POST', match: /\/place$/, handle: () => ({ json: { correct: true, releaseDate: '2012-01-01', hand: ['d04'], state: {}, finished: false } }) },
    ]);
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<TimelineGame code="ABCDE" room={roomWith({})} players={players} me={guest} session={session} refresh={refresh} />);

    expect(screen.getByText('Song d11')).toBeDefined();
    expect(screen.getByText('2021-01-01')).toBeDefined();
    expect(screen.getByText(/輪到你了/)).toBeDefined();
    await waitFor(() => expect(screen.getByRole('button', { name: /Song d02/ })).toBeDefined());
    expect(screen.getByText(/山札 1 張/)).toBeDefined();

    // 還沒選牌 → 位置按鈕停用
    const slot0 = screen.getByRole('button', { name: '放在第 1 個位置' }) as HTMLButtonElement;
    expect(slot0.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Song d02/ }));
    expect(slot0.disabled).toBe(false);
    fireEvent.click(slot0);

    await waitFor(() => expect(screen.getByText(/正確！/)).toBeDefined());
    expect(calls.find((c) => /\/place$/.test(c.url))!.body).toEqual({ songId: 'd02', slot: 0 });
    expect(screen.queryByRole('button', { name: /Song d02/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Song d04/ })).toBeDefined();
    expect(refresh).toHaveBeenCalled();
  });

  test('不是我的回合 → 位置按鈕停用並顯示輪到誰；放錯顯示日期與罰抽', async () => {
    mockRoomFetch([
      { match: /\/hand$/, handle: () => ({ json: { hand: ['d02'] } }) },
      { method: 'POST', match: /\/place$/, handle: () => ({ json: { correct: false, releaseDate: '2012-01-01', hand: ['d02', 'd12'], state: {}, finished: false } }) },
    ]);
    const { rerender } = render(<TimelineGame code="ABCDE" room={roomWith({ turnSeat: 0 })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByText(/輪到 房主/)).toBeDefined();
    await waitFor(() => expect(screen.getByRole('button', { name: /Song d02/ })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Song d02/ }));
    expect((screen.getByRole('button', { name: '放在第 2 個位置' }) as HTMLButtonElement).disabled).toBe(true);

    // 輪到我：剛才選的牌還在選取狀態（再點一次會取消選取），直接點位置
    rerender(<TimelineGame code="ABCDE" room={roomWith({ turnSeat: 1 })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByRole('button', { name: /Song d02/ }).className).toContain('is-selected');
    fireEvent.click(screen.getByRole('button', { name: '放在第 2 個位置' }));
    await waitFor(() => expect(screen.getByText(/錯了/)).toBeDefined());
    expect(screen.getByText(/2012-01-01/)).toBeDefined();
    expect(screen.getByText(/罰抽一張/)).toBeDefined();
    expect(screen.getByRole('button', { name: /Song d12/ })).toBeDefined();
  });

  test('顯示上一手結果與各人手牌數；觀戰者沒有手牌區', async () => {
    mockRoomFetch([]);
    render(
      <TimelineGame
        code="ABCDE"
        room={roomWith({ lastResult: { type: 'placed', playerId: 'p1', songId: 'd12', slot: 1, correct: false, drew: true, releaseDate: '2022-01-01' } })}
        players={players}
        me={null}
        session={null}
        refresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText(/房主 把『Song d12』放在第 2 個位置 → 錯了/)).toBeDefined();
    expect(screen.getByText(/房主：5 張/)).toBeDefined();
    expect(screen.getByText(/未来：2 張/)).toBeDefined();
    expect(screen.queryByText(/你的手牌/)).toBeNull();
  });
});
