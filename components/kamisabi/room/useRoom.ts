'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';
import type { PlayerRow, RoomRow } from '@/lib/kamisabiRoom/types';
import { RoomApiError, roomApi } from './roomApi';

/** 輪詢間隔：遊戲進行中 2 秒、大廳 / 結算 4 秒 */
const POLL_PLAYING_MS = 2000;
const POLL_IDLE_MS = 4000;

/**
 * 房間公開狀態：初次 GET，之後一直輪詢；Supabase Realtime（rooms UPDATE / room_players INSERT）只是加速器。
 * 訂閱成功（SUBSCRIBED）不代表事件一定會到——實測 publishable key 訂閱成功卻收不到 RLS 表的變更——
 * 所以輪詢不因訂閱成功而停。只有房間確定不存在（404）才停。
 * 另外算出「伺服器時間 − 本機時間」的偏移，讓 startsAt 能在各裝置同時觸發。
 */
export function useRoom(code: string) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState(false);
  /** 房間確定不存在（404）：停止輪詢；其他錯誤都當暫時性，繼續重試 */
  const [notFound, setNotFound] = useState(false);
  const skewRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const snap = await roomApi.get(code);
      skewRef.current = snap.serverNow - Date.now();
      setRoom((prev) => (prev && prev.version > snap.room.version ? prev : snap.room));
      setPlayers(snap.players);
      setError(null);
    } catch (e) {
      // 已載入過的 room 保留不動：暫時性錯誤只顯示提示，不把玩家踢出遊戲畫面
      setError(e instanceof RoomApiError ? e.message : '無法連線到房間，請稍後再試。');
      if (e instanceof RoomApiError && e.code === 'ROOM_NOT_FOUND') setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [code]);

  // 初次載入（放進 callback 而不是同步呼叫，避免 effect 內直接 setState）
  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  // Realtime：rooms 一列更新就整包換掉（payload.new 是完整列）
  const roomId = room?.id;
  useEffect(() => {
    if (!roomId) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const channel = sb
      .channel(`kamisabi-room:${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        const next = payload.new as RoomRow;
        setRoom((prev) => (prev && prev.version >= next.version ? prev : {
          id: next.id, code: next.code, mode: next.mode, status: next.status, brand: next.brand, songs: next.songs, state: next.state, version: next.version,
        }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => {
        refresh();
      })
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED';
        setRealtime(ok);
        if (ok) refresh(); // 補上訂閱前漏掉的更新
      });
    return () => {
      sb.removeChannel(channel);
      setRealtime(false);
    };
  }, [roomId, refresh]);

  // 輪詢（暫時性錯誤時照樣輪詢，網路恢復就自動清掉 error；只有 404 才停）
  const pollMs = room?.status === 'playing' ? POLL_PLAYING_MS : POLL_IDLE_MS;
  useEffect(() => {
    if (notFound) return;
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [pollMs, notFound, refresh]);

  // 回到分頁時補抓一次
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const toLocalTime = useCallback((iso: string) => Date.parse(iso) - skewRef.current, []);

  return { room, players, loading, error, refresh, realtime, toLocalTime };
}
