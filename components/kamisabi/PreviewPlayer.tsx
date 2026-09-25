'use client';

import React, { useCallback, useImperativeHandle, useRef, useState, type Ref } from 'react';

/** 父層可透過 ref 操作播放器（お手つき後續播） */
export interface PreviewPlayerHandle {
  /** 播放中就不動；暫停中從原位置續播；還沒播或已播完就從頭播 */
  resume: () => void;
}

interface PreviewPlayerProps {
  previewUrl: string;
  onError?: () => void;
  ref?: Ref<PreviewPlayerHandle>;
}

type PlayStatus = 'idle' | 'playing' | 'paused' | 'ended';

const PREVIEW_FALLBACK_DURATION = 30;

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `0:${s.toString().padStart(2, '0')}`;
}

/**
 * 遮住歌名的試聽播放器：只有進度條與按鈕，沒有任何文字資訊。
 * 固定播整段 30 秒試聽；音檔由 <audio> 直接向 Apple CDN 串流，不經過我們的 server。
 * 所有播放都由主持人點擊觸發，避開 iOS / Chrome 的自動播放限制。
 * 換題時由父層以 key={trackId} 重新掛載，不需要自己重置狀態。
 */
export default function PreviewPlayer({ previewUrl, onError, ref }: PreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<PlayStatus>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(PREVIEW_FALLBACK_DURATION);

  const playFrom = useCallback((from: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    // iOS 需要在使用者手勢的同一個 call stack 內呼叫 play()
    const seek = () => {
      try {
        audio.currentTime = from;
      } catch {
        /* metadata 未載入時 seek 會失敗，loadedmetadata 後再補 */
      }
    };
    if (audio.readyState >= 1) {
      seek();
    } else {
      audio.addEventListener('loadedmetadata', seek, { once: true });
    }
    audio
      .play()
      .then(() => setStatus('playing'))
      .catch((err) => {
        console.error('audio play failed', err);
        setStatus('idle');
      });
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setStatus('paused');
  }, []);

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) setCurrentTime(audio.currentTime);
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const isPlaying = status === 'playing';
  const canResume = status === 'paused' && currentTime < duration - 0.25;

  useImperativeHandle(
    ref,
    () => ({
      resume: () => {
        if (isPlaying) return;
        playFrom(canResume ? currentTime : 0);
      },
    }),
    [isPlaying, canResume, currentTime, playFrom],
  );

  return (
    <div className="kamisabi-player" data-playing={isPlaying ? 'true' : 'false'}>
      <audio
        ref={audioRef}
        src={previewUrl}
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setStatus('ended')}
        onLoadedMetadata={handleLoadedMetadata}
        onError={onError}
        data-testid="preview-audio"
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <svg
          style={{ width: '56px', height: '56px', color: '#d8b4fe', opacity: isPlaying ? 1 : 0.7, transition: 'opacity 0.3s' }}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
        </svg>
        <span className="kamisabi-player-state">
          {isPlaying ? '請仔細聽…' : status === 'idle' ? '按下播放開始出題' : status === 'ended' ? '試聽結束' : '已暫停'}
        </span>
      </div>

      {/* 進度條：只顯示時間，不顯示任何曲目資訊 */}
      <div style={{ width: '100%', maxWidth: '520px' }}>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          style={{ position: 'relative', height: '10px', borderRadius: '999px', background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}
        >
          <div style={{ position: 'absolute', inset: 0, width: `${progress * 100}%`, background: '#d8b4fe', transition: 'width 0.2s linear' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', opacity: 0.8, marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>
          <span>{formatSeconds(currentTime)}</span>
          <span>{formatSeconds(duration)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px' }}>
        {isPlaying ? (
          <button type="button" onClick={stop} className="kamisabi-player-btn">
            ⏹ 停止
          </button>
        ) : (
          <button type="button" onClick={() => playFrom(0)} className="kamisabi-player-btn is-main">
            {status === 'idle' ? '▶ 播放' : '🔁 重播'}
          </button>
        )}
        {!isPlaying && canResume && (
          <button type="button" onClick={() => playFrom(currentTime)} className="kamisabi-player-btn">
            ▶ 繼續
          </button>
        )}
      </div>
    </div>
  );
}
