'use client';

import React from 'react';
import PreviewPlayer from './PreviewPlayer';
import KamisabiCard from './KamisabiCard';
import RoomEntry from './room/RoomEntry';
import { useKamisabi } from './useKamisabi';
import { getBrandColor, getBrandDisplayName } from '@/lib/themeUtils';
import { BRAND_VALUES } from '@/lib/brandMap';
import { BrandIcon } from '@/components/BrandIcon';

/**
 * KAMISABI 出題機（歌牌イントロモード用）。
 * 網頁只播 Apple Music 30 秒試聽、不給選項；主持人按「公佈答案」翻出仿實體歌牌。
 * 搶牌與計分在桌上用實體歌牌進行。
 */
export default function KamisabiClient({ canHostRoom = false }: { canHostRoom?: boolean }) {
  const {
    phase,
    error,
    allSongs,
    brandCounts,
    selectedBrands,
    setSelectedBrands,
    shuffleOrder,
    setShuffleOrder,
    matchingSongsCount,
    queue,
    index,
    currentSong,
    revealed,
    preview,
    previewStatus,
    start,
    reveal,
    next,
    retryPreview,
    finish,
    backToSetup,
  } = useKamisabi();

  const toggleBrand = (b: string) => {
    setSelectedBrands((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  };

  if (phase === 'loading') {
    return (
      <div style={{ display: 'flex', height: '70vh', alignItems: 'center', justifyContent: 'center' }}>
        <div
          className="animate-spin"
          style={{ width: '64px', height: '64px', borderRadius: '50%', borderTop: '4px solid var(--accent-color)', borderBottom: '4px solid var(--accent-color)', opacity: 0.8 }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', height: '70vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '16px 24px', borderRadius: '16px', boxShadow: 'var(--shadow-md)', border: '1px solid #fecaca' }}>
          <p style={{ fontWeight: 'bold', fontSize: '18px' }}>⚠️ {error}</p>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: '0 16px' }}>
        <div className="card-el" style={{ padding: '0 0 40px', borderRadius: '32px', maxWidth: '640px', width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(16px)', overflow: 'hidden' }}>
          <div className="kamisabi-hero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kamisabi-logo.webp" alt="KAMISABI" width={885} height={641} />
          </div>
          <div style={{ padding: '0 40px' }}>
            <h2 className="sr-only">KAMISABI</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginBottom: '28px', lineHeight: 1.7 }}>
              搭配 KAMISABI 歌牌使用：網頁播 Apple Music 的 30 秒試聽、不給選項，大家聽副歌搶牌，主持人再按「公佈答案」翻牌。
            </p>

            <div style={{ marginBottom: '24px', textAlign: 'left', width: '100%' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '15px', marginBottom: '12px', color: 'var(--text-primary)' }}>
                🎯 出題品牌（可複選，不選代表全部）：
              </label>
              <div className="brand-picker-grid" style={{ display: 'grid', gap: '8px', width: '100%' }}>
                {BRAND_VALUES.filter((b) => (brandCounts[b] ?? 0) > 0).map((b) => {
                  const checked = selectedBrands.includes(b);
                  const color = getBrandColor(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => toggleBrand(b)}
                      aria-pressed={checked}
                      className={`brand-card ${checked ? 'is-checked' : ''}`}
                      style={checked ? { borderColor: color, backgroundColor: `${color}10`, boxShadow: `0 0 0 1px ${color}33 inset`, cursor: 'pointer' } : { cursor: 'pointer' }}
                    >
                      <span className="brand-card-icon">
                        <BrandIcon brand={b} className="brand-card-svg" />
                      </span>
                      <span className="brand-card-name" style={{ fontSize: '12px' }}>{getBrandDisplayName(b)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted, #9ca3af)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{brandCounts[b]} 首</span>
                      {checked && (
                        <span className="brand-card-check" style={{ background: color }} aria-hidden="true">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: '13px', color: matchingSongsCount > 0 ? 'var(--accent-text-dark, #4f46e5)' : '#dc2626', fontWeight: '600', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>📊</span>
                {matchingSongsCount > 0 ? `已選品牌共有 ${matchingSongsCount} 首歌曲可出題` : '目前沒有可出題的歌曲（需先補 Apple Music 曲目 ID）'}
              </p>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '28px', cursor: 'pointer', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={shuffleOrder} onChange={(e) => setShuffleOrder(e.target.checked)} />
              隨機出題順序
            </label>

            <button
              onClick={start}
              disabled={matchingSongsCount === 0}
              className="btn btn-primary"
              style={{ width: '100%', padding: '16px', fontSize: '20px', borderRadius: '16px', opacity: matchingSongsCount === 0 ? 0.6 : 1, cursor: matchingSongsCount === 0 ? 'not-allowed' : 'pointer' }}
            >
              開始出題
            </button>
          </div>
        </div>
        {canHostRoom && <RoomEntry allSongs={allSongs} brandCounts={brandCounts} />}
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: '0 16px' }}>
        <div className="card-el" style={{ padding: '40px', borderRadius: '32px', maxWidth: '520px', width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.85)' }}>
          <div style={{ fontSize: '56px', marginBottom: '12px' }}>🏁</div>
          <h2 style={{ fontSize: '28px', fontWeight: '900', marginBottom: '8px' }}>出題完畢！</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '28px' }}>
            這一輪共出了 {queue.length} 題。數一數桌上的歌牌，看誰搶得最多吧！
          </p>
          <button onClick={backToSetup} className="btn btn-primary" style={{ padding: '14px 32px', fontSize: '18px', borderRadius: '14px' }}>
            回到設定
          </button>
        </div>
      </div>
    );
  }

  if (!currentSong) return null;

  const isLast = index + 1 >= queue.length;
  const performers = [...currentSong.units.map((u) => u.name), ...currentSong.members.map((m) => m.name)];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(12px)', padding: '14px 16px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
          第 <span style={{ fontSize: '28px', fontWeight: '900', color: 'var(--accent-color)', margin: '0 4px' }}>{index + 1}</span> / {queue.length} 題
        </div>
        <button onClick={finish} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }}>
          結束出題
        </button>
      </div>

      <div style={{ width: '100%', maxWidth: '672px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
        {previewStatus === 'loading' && (
          <div className="kamisabi-player" style={{ minHeight: '220px', justifyContent: 'center', fontWeight: 'bold' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="animate-spin" style={{ width: '28px', height: '28px', borderRadius: '50%', borderTop: '3px solid white', borderBottom: '3px solid white', display: 'inline-block' }} />
              載入試聽中…
            </div>
          </div>
        )}

        {previewStatus === 'error' && (
          <div style={{ width: '100%', padding: '24px', borderRadius: '16px', backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', textAlign: 'center' }}>
            <p style={{ fontWeight: 'bold', marginBottom: '12px' }}>⚠️ 這首歌的試聽暫時無法取得</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={retryPreview} className="btn btn-secondary">重試</button>
              <button onClick={next} className="btn btn-primary">{isLast ? '結束' : '跳到下一題'}</button>
            </div>
          </div>
        )}

        {previewStatus === 'ready' && preview && (
          <PreviewPlayer key={preview.trackId} previewUrl={preview.previewUrl} onError={() => console.error('audio element error')} />
        )}

        {revealed ? (
          <div className="kamisabi-answer" data-testid="answer-card">
            <KamisabiCard title={currentSong.title} brand={currentSong.brand} artworkUrl={preview?.artworkUrl ?? null} className="is-reveal" />
            <div style={{ flex: 1, minWidth: '200px', textAlign: 'left' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold', color: getBrandColor(currentSong.brand), marginBottom: '6px' }}>
                <BrandIcon brand={currentSong.brand} className="brand-card-svg" />
                {getBrandDisplayName(currentSong.brand)}
              </div>
              <h3 style={{ fontSize: '26px', fontWeight: '900', margin: '0 0 8px', lineHeight: 1.25 }}>{currentSong.title}</h3>
              {performers.length > 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 12px', lineHeight: 1.6 }}>{performers.join('、')}</p>
              )}
              {preview?.trackViewUrl && (
                <a href={preview.trackViewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                   在 Apple Music 聆聽
                </a>
              )}
              <p style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', marginTop: '10px' }}>試聽音源由 Apple Music / iTunes 提供</p>
            </div>
          </div>
        ) : (
          <button
            onClick={reveal}
            disabled={previewStatus !== 'ready'}
            className="btn btn-primary"
            style={{ padding: '16px 40px', borderRadius: '16px', fontSize: '20px', fontWeight: '900', boxShadow: '0 8px 30px rgba(79, 70, 229, 0.3)', opacity: previewStatus !== 'ready' ? 0.6 : 1 }}
          >
            👀 公佈答案
          </button>
        )}

        {revealed && (
          <button
            onClick={next}
            className="btn btn-primary"
            style={{ padding: '16px 40px', borderRadius: '16px', fontSize: '20px', fontWeight: '900', boxShadow: '0 8px 30px rgba(79, 70, 229, 0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {isLast ? '結束出題' : '下一題'}
            <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
