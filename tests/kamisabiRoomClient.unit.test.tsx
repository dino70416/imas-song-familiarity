import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/supabase/browser', () => ({ getSupabaseBrowser: vi.fn(() => null) }));

import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { clearSession, loadSession, saveSession } from '@/components/kamisabi/room/roomStorage';
import { RoomApiError, roomApi } from '@/components/kamisabi/room/roomApi';
import { useRoom } from '@/components/kamisabi/room/useRoom';
import { useSyncedAudio } from '@/components/kamisabi/room/useSyncedAudio';

describe('roomStorage', () => {
  beforeEach(() => localStorage.clear());
  test('save / load / clear，房號不分大小寫', () => {
    saveSession('abcde', { playerId: 'p', token: 't', name: 'n' });
    expect(loadSession('ABCDE')).toEqual({ playerId: 'p', token: 't', name: 'n' });
    clearSession('ABCDE');
    expect(loadSession('abcde')).toBeNull();
  });
  test('壞資料回 null', () => {
    localStorage.setItem('kamisabi:room:XXXXX', '{nope');
    expect(loadSession('XXXXX')).toBeNull();
  });
});

describe('roomApi', () => {
  afterEach(() => vi.restoreAllMocks());
  test('帶 Bearer、JSON body；錯誤變 RoomApiError 帶 code', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: '慢了一步', code: 'ROUND_RESOLVED' }), { status: 409, headers: { 'content-type': 'application/json' } }),
    );
    await expect(roomApi.claim('ABCDE', 'tok', 's1', 3)).rejects.toMatchObject({ status: 409, code: 'ROUND_RESOLVED', message: '慢了一步' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/kamisabi/room/ABCDE/claim');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok', 'content-type': 'application/json' });
    expect((init as RequestInit).body).toBe(JSON.stringify({ songId: 's1', round: 3 }));
  });
  test('RoomApiError 是 Error', () => {
    expect(new RoomApiError('x', 400, 'X')).toBeInstanceOf(Error);
  });
});

describe('useRoom（沒有 Supabase 時用輪詢）', () => {
  afterEach(() => vi.restoreAllMocks());
  test('初次載入 GET、算 serverNow 偏移、404 → error', async () => {
    const snapshot = { room: { id: 'r1', code: 'ABCDE', mode: null, status: 'lobby', brand: 'music_ml', songs: [], state: {}, version: 0 }, players: [], serverNow: Date.now() + 10_000 };
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(snapshot), { status: 200 }));
    const { result } = renderHook(() => useRoom('ABCDE'));
    await waitFor(() => expect(result.current.room?.code).toBe('ABCDE'));
    expect(result.current.realtime).toBe(false);
    // 伺服器比本機快 10 秒 → 伺服器時間換成本機時間要減 10 秒
    const iso = new Date(Date.now() + 13_000).toISOString();
    expect(result.current.toLocalTime(iso)).toBeLessThan(Date.now() + 4_000);

    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: '找不到這個房間。', code: 'ROOM_NOT_FOUND' }), { status: 404 }));
    const { result: r2 } = renderHook(() => useRoom('ZZZZZ'));
    await waitFor(() => expect(r2.current.error).toBe('找不到這個房間。'));
  });

  test('載入成功後 refresh 失敗：保留 room、只設 error；下次成功就清掉 error', async () => {
    const snapshot = { room: { id: 'r1', code: 'ABCDE', mode: null, status: 'lobby', brand: 'music_ml', songs: [], state: {}, version: 2 }, players: [], serverNow: Date.now() };
    // 每次都給新的 Response（body 只能讀一次）
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify(snapshot), { status: 200 }));
    const { result } = renderHook(() => useRoom('ABCDE'));
    await waitFor(() => expect(result.current.room?.version).toBe(2));

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.room?.version).toBe(2);
    expect(result.current.error).toBe('無法連線到房間，請稍後再試。');

    await act(async () => { await result.current.refresh(); });
    expect(result.current.error).toBeNull();
    expect(result.current.room?.version).toBe(2);
  });

  test('Realtime 訂閱成功後仍然每 4 秒輪詢（訂閱成功不代表事件一定會到）', async () => {
    vi.useFakeTimers();
    const fakeCh = { on: () => fakeCh, subscribe: (cb: (s: string) => void) => { cb('SUBSCRIBED'); return fakeCh; } };
    vi.mocked(getSupabaseBrowser).mockReturnValue({ channel: () => fakeCh, removeChannel: async () => 'ok' } as unknown as ReturnType<typeof getSupabaseBrowser>);
    const snapshot = { room: { id: 'r1', code: 'ABCDE', mode: null, status: 'lobby', brand: 'music_ml', songs: [], state: {}, version: 2 }, players: [], serverNow: Date.now() };
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify(snapshot), { status: 200 }));
    try {
      const { result } = renderHook(() => useRoom('ABCDE'));
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      expect(result.current.room?.version).toBe(2);
      expect(result.current.realtime).toBe(true);
      const before = fetchMock.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
      vi.mocked(getSupabaseBrowser).mockReturnValue(null);
    }
  });
});

describe('useSyncedAudio', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  test('unlock 後 unlocked=true；scheduleAudio 到時間才 play；stop 取消', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSyncedAudio());
    const el = document.createElement('audio');
    result.current.audioRef.current = el;
    await act(async () => { result.current.unlock(); await Promise.resolve(); });
    expect(result.current.unlocked).toBe(true);

    act(() => result.current.scheduleAudio('https://x/a.m4a', Date.now() + 2000));
    expect(el.src).toBe('https://x/a.m4a');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1); // 只有 unlock 那次
    act(() => { vi.advanceTimersByTime(2100); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);

    act(() => result.current.scheduleAudio('https://x/b.m4a', Date.now() + 2000));
    act(() => result.current.stop());
    act(() => { vi.advanceTimersByTime(3000); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  test('沒有 speechSynthesis 時 scheduleSpeech 回 false 不丟例外', () => {
    const { result } = renderHook(() => useSyncedAudio());
    expect(result.current.scheduleSpeech('テスト', Date.now())).toBe(false);
  });
});
