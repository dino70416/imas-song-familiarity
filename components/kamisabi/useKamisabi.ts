'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shuffle } from '@/lib/shuffle';
import { ttsFileUrl } from '@/lib/karutaTts';
import type { ApplePreview, KamisabiPhase, KamisabiSoloMode, KamisabiSong, PreviewStatus } from './types';

/** 已被玩家取得的牌（封面用公佈答案當下的試聽資訊） */
export type HeldCard = { song: KamisabiSong; artworkUrl: string | null };

/**
 * KAMISABI 出題機的狀態：
 * 設定（品牌 / 順序）→ 依序出題（播 30 秒試聽 → 公佈答案 → 下一題）→ 出完。
 * 網頁只負責「放歌 + 翻答案」，搶答與計分在桌上用歌牌進行。
 * お手つき（搶錯）：答錯的人從自己已取得的牌丟一張回場上，那首歌重新排進待播清單，本題續播。
 */
export function useKamisabi() {
  const [phase, setPhase] = useState<KamisabiPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [allSongs, setAllSongs] = useState<KamisabiSong[]>([]);

  // 設定
  const [mode, setMode] = useState<KamisabiSoloMode>('intro');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [shuffleOrder, setShuffleOrder] = useState(true);

  // 進行中
  const [queue, setQueue] = useState<KamisabiSong[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  /** 已被玩家取得的牌（播過且有人答對）；お手つき時只能從這裡丟 */
  const [held, setHeld] = useState<HeldCard[]>([]);
  /** お手つき對話框開著（主持人正在選要丟回哪張） */
  const [discarding, setDiscarding] = useState(false);
  /** 本題お手つき（答錯）次數；只用來提示主持人，計分在桌上進行 */
  const [otetsukiCount, setOtetsukiCount] = useState(0);
  /** 本題最近一次丟回場上的歌（提示用） */
  const [lastDiscarded, setLastDiscarded] = useState<KamisabiSong | null>(null);
  const [preview, setPreview] = useState<ApplePreview | null>(null);
  /** 這題要播的音檔：イントロ = Apple 試聽、かるた = 朗讀 mp3 */
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('loading');

  // trackId → 試聽資訊快取（同一場不重打 API）
  const previewCacheRef = useRef<Map<string, ApplePreview>>(new Map());
  // 避免快速按下一題時舊的 fetch 蓋掉新題
  const loadSeqRef = useRef(0);

  useEffect(() => {
    fetch('/api/songs/kamisabi')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch songs');
        return res.json();
      })
      .then((data: KamisabiSong[]) => {
        setAllSongs(data);
        setPhase('setup');
      })
      .catch((err) => {
        console.error(err);
        setError('載入題庫失敗，請稍後再試。');
        setPhase('setup');
      });
  }, []);

  // 每個品牌有幾首可出題的歌；沒有歌的品牌不顯示在設定畫面
  const brandCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of allSongs) counts[s.brand] = (counts[s.brand] ?? 0) + 1;
    return counts;
  }, [allSongs]);

  // かるた只出有朗讀檔的歌
  const matchingSongs = useMemo(
    () =>
      allSongs.filter(
        (s) => (selectedBrands.length === 0 || selectedBrands.includes(s.brand)) && (mode !== 'karuta' || s.hasLyrics),
      ),
    [allSongs, selectedBrands, mode],
  );

  const fetchPreview = useCallback(async (trackId: string): Promise<ApplePreview> => {
    const cached = previewCacheRef.current.get(trackId);
    if (cached) return cached;
    const res = await fetch(`/api/apple/preview?trackId=${encodeURIComponent(trackId)}`);
    if (!res.ok) throw new Error(`preview ${res.status}`);
    const data = (await res.json()) as ApplePreview;
    previewCacheRef.current.set(trackId, data);
    return data;
  }, []);

  const loadQuestion = useCallback(
    (list: KamisabiSong[], i: number) => {
      const song = list[i];
      if (!song) return;
      const seq = ++loadSeqRef.current;
      setRevealed(false);
      setDiscarding(false);
      setOtetsukiCount(0);
      setLastDiscarded(null);
      setPreview(null);
      setAudioUrl(null);
      setPreviewStatus('loading');

      if (mode === 'karuta') {
        // 朗讀檔是靜態 mp3：先 HEAD 確認存在。封面另外抓 Apple 資料，抓不到也不擋播放。
        const url = ttsFileUrl(song.id);
        fetch(url, { method: 'HEAD' })
          .then((res) => {
            if (loadSeqRef.current !== seq) return;
            if (!res.ok) {
              setPreviewStatus('error');
              return;
            }
            setAudioUrl(url);
            setPreviewStatus('ready');
          })
          .catch((err) => {
            console.error(err);
            if (loadSeqRef.current !== seq) return;
            setPreviewStatus('error');
          });
        fetchPreview(song.appleTrackId)
          .then((data) => {
            if (loadSeqRef.current === seq) setPreview(data);
          })
          .catch(() => {});
        return;
      }

      fetchPreview(song.appleTrackId)
        .then((data) => {
          if (loadSeqRef.current !== seq) return;
          setPreview(data);
          setAudioUrl(data.previewUrl);
          setPreviewStatus('ready');
        })
        .catch((err) => {
          console.error(err);
          if (loadSeqRef.current !== seq) return;
          setPreviewStatus('error');
        });

      // 預先暖下一題的試聽（讓「下一題」幾乎不用等）
      const next = list[i + 1];
      if (next) {
        fetchPreview(next.appleTrackId).catch(() => {});
      }
    },
    [fetchPreview, mode],
  );

  const start = useCallback(() => {
    if (matchingSongs.length === 0) return;
    const list = shuffleOrder ? shuffle(matchingSongs) : [...matchingSongs];
    setQueue(list);
    setHeld([]);
    setIndex(0);
    setPhase('playing');
    loadQuestion(list, 0);
  }, [matchingSongs, shuffleOrder, loadQuestion]);

  const reveal = useCallback(() => setRevealed(true), []);

  const beginOtetsuki = useCallback(() => setDiscarding(true), []);
  const cancelOtetsuki = useCallback(() => setDiscarding(false), []);

  /**
   * お手つき：答錯的人把一張已取得的牌（songId）丟回場上，那首歌重新排進待播清單；
   * 沒牌可丟時傳 null。之後收回答案、留在同一題（續播由播放器處理）。
   */
  const discard = useCallback(
    (songId: string | null) => {
      if (songId) {
        const card = held.find((c) => c.song.id === songId);
        if (!card) return;
        setHeld((h) => h.filter((c) => c.song.id !== songId));
        setQueue((q) => {
          // 隨機模式插回剩下題目的任一位置；固定順序就排最後
          const pos = shuffleOrder ? index + 1 + Math.floor(Math.random() * (q.length - index)) : q.length;
          return [...q.slice(0, pos), card.song, ...q.slice(pos)];
        });
        setLastDiscarded(card.song);
      }
      setDiscarding(false);
      setRevealed(false);
      setOtetsukiCount((n) => n + 1);
    },
    [held, index, shuffleOrder],
  );

  /** 下一題。已公佈答案才算有人取得這張牌（試聽失敗直接跳過時沒人拿到） */
  const next = useCallback(() => {
    const current = queue[index];
    if (revealed && current) {
      setHeld((h) => [...h, { song: current, artworkUrl: preview?.artworkUrl ?? null }]);
    }
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) {
      setPhase('finished');
      return;
    }
    setIndex(nextIndex);
    loadQuestion(queue, nextIndex);
  }, [index, queue, revealed, preview, loadQuestion]);

  const retryPreview = useCallback(() => {
    previewCacheRef.current.delete(queue[index]?.appleTrackId ?? '');
    loadQuestion(queue, index);
  }, [queue, index, loadQuestion]);

  const finish = useCallback(() => setPhase('finished'), []);

  const backToSetup = useCallback(() => {
    loadSeqRef.current++;
    setQueue([]);
    setIndex(0);
    setHeld([]);
    setRevealed(false);
    setDiscarding(false);
    setOtetsukiCount(0);
    setLastDiscarded(null);
    setPreview(null);
    setPhase('setup');
  }, []);

  return {
    phase,
    error,
    allSongs,
    brandCounts,
    mode,
    setMode,
    selectedBrands,
    setSelectedBrands,
    shuffleOrder,
    setShuffleOrder,
    matchingSongsCount: matchingSongs.length,
    queue,
    index,
    currentSong: queue[index] ?? null,
    revealed,
    otetsukiCount,
    lastDiscarded,
    held,
    discarding,
    preview,
    audioUrl,
    previewStatus,
    start,
    reveal,
    beginOtetsuki,
    cancelOtetsuki,
    discard,
    next,
    retryPreview,
    finish,
    backToSetup,
  };
}
