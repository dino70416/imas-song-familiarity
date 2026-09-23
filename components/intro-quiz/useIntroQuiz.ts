'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shuffle } from '@/lib/shuffle';
import type { ApplePreview, ClipLength, IntroQuizPhase, IntroQuizSong, PreviewStatus } from './types';

/**
 * 副歌猜歌出題機的狀態：
 * 設定（品牌 / 秒數 / 順序）→ 依序出題（播試聽 → 公佈答案 → 下一題）→ 出完。
 * 網頁只負責「放歌 + 翻答案」，搶答與計分在桌上用歌牌進行。
 */
export function useIntroQuiz() {
  const [phase, setPhase] = useState<IntroQuizPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [allSongs, setAllSongs] = useState<IntroQuizSong[]>([]);

  // 設定
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [clipLength, setClipLength] = useState<ClipLength>(10);
  const [shuffleOrder, setShuffleOrder] = useState(true);

  // 進行中
  const [queue, setQueue] = useState<IntroQuizSong[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [preview, setPreview] = useState<ApplePreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('loading');

  // trackId → 試聽資訊快取（同一場不重打 API）
  const previewCacheRef = useRef<Map<string, ApplePreview>>(new Map());
  // 避免快速按下一題時舊的 fetch 蓋掉新題
  const loadSeqRef = useRef(0);

  useEffect(() => {
    fetch('/api/songs/intro-quiz')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch songs');
        return res.json();
      })
      .then((data: IntroQuizSong[]) => {
        setAllSongs(data);
        setPhase('setup');
      })
      .catch((err) => {
        console.error(err);
        setError('載入題庫失敗，請稍後再試。');
        setPhase('setup');
      });
  }, []);

  const matchingSongs = useMemo(
    () => (selectedBrands.length === 0 ? allSongs : allSongs.filter((s) => selectedBrands.includes(s.brand))),
    [allSongs, selectedBrands],
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
    (list: IntroQuizSong[], i: number) => {
      const song = list[i];
      if (!song) return;
      const seq = ++loadSeqRef.current;
      setRevealed(false);
      setPreview(null);
      setPreviewStatus('loading');

      fetchPreview(song.appleTrackId)
        .then((data) => {
          if (loadSeqRef.current !== seq) return;
          setPreview(data);
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
    [fetchPreview],
  );

  const start = useCallback(() => {
    if (matchingSongs.length === 0) return;
    const list = shuffleOrder ? shuffle(matchingSongs) : [...matchingSongs];
    setQueue(list);
    setIndex(0);
    setPhase('playing');
    loadQuestion(list, 0);
  }, [matchingSongs, shuffleOrder, loadQuestion]);

  const reveal = useCallback(() => setRevealed(true), []);

  const next = useCallback(() => {
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) {
      setPhase('finished');
      return;
    }
    setIndex(nextIndex);
    loadQuestion(queue, nextIndex);
  }, [index, queue, loadQuestion]);

  const retryPreview = useCallback(() => {
    previewCacheRef.current.delete(queue[index]?.appleTrackId ?? '');
    loadQuestion(queue, index);
  }, [queue, index, loadQuestion]);

  const finish = useCallback(() => setPhase('finished'), []);

  const backToSetup = useCallback(() => {
    loadSeqRef.current++;
    setQueue([]);
    setIndex(0);
    setRevealed(false);
    setPreview(null);
    setPhase('setup');
  }, []);

  return {
    phase,
    error,
    allSongs,
    selectedBrands,
    setSelectedBrands,
    clipLength,
    setClipLength,
    shuffleOrder,
    setShuffleOrder,
    matchingSongsCount: matchingSongs.length,
    queue,
    index,
    currentSong: queue[index] ?? null,
    revealed,
    preview,
    previewStatus,
    start,
    reveal,
    next,
    retryPreview,
    finish,
    backToSetup,
  };
}
