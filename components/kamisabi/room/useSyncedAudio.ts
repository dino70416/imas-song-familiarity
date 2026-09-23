'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** 44 byte 的空 WAV：在使用者手勢裡播一次，之後同一個 <audio> 就能程式化播放（iOS / Chrome 自動播放限制） */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/**
 * 房間同步播放：伺服器只發 startsAt，每個瀏覽器自己排 timer，到點同時 play。
 * 一個 <audio> 元素重複使用（iOS 解鎖後換 src 仍可播）。かるた沒有 mp3 時退回 speechSynthesis。
 */
export function useSyncedAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [playing, setPlaying] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const unlock = useCallback(() => {
    const el = audioRef.current;
    if (!el) {
      setUnlocked(true);
      return;
    }
    el.src = SILENT_WAV;
    el.play()
      .then(() => el.pause())
      .catch(() => {})
      .finally(() => setUnlocked(true));
  }, []);

  const scheduleAudio = useCallback((url: string, atMs: number) => {
    const el = audioRef.current;
    if (!el) return;
    clearTimer();
    el.src = url;
    el.load();
    const delay = Math.max(0, atMs - Date.now());
    timerRef.current = setTimeout(() => {
      try {
        el.currentTime = 0;
      } catch {
        /* metadata 未載入 */
      }
      el.play()
        .then(() => setPlaying(true))
        .catch((err) => console.error('room audio play failed', err));
    }, delay);
  }, [clearTimer]);

  /** 回 false = 這個環境沒有語音合成，呼叫端顯示提示 */
  const scheduleSpeech = useCallback((text: string, atMs: number): boolean => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return false;
    clearTimer();
    const delay = Math.max(0, atMs - Date.now());
    timerRef.current = setTimeout(() => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 0.95;
      u.onend = () => setPlaying(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      setPlaying(true);
    }, delay);
    return true;
  }, [clearTimer]);

  const stop = useCallback(() => {
    clearTimer();
    audioRef.current?.pause();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(false);
  }, [clearTimer]);

  useEffect(() => () => stop(), [stop]);

  const onEnded = useCallback(() => setPlaying(false), []);

  return { audioRef, unlocked, unlock, playing, scheduleAudio, scheduleSpeech, stop, onEnded };
}
