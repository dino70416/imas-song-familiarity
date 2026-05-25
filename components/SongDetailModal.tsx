'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getBrandColor, getBrandDisplayName, getAccentTextColor } from '@/lib/themeUtils';

interface Song {
  id: string;
  title: string;
  brand: string;
  musicType: string;
  lyrics: string | null;
  composer: string | null;
  arranger: string | null;
  lowestPitch: string | null;
  highestPitch: string | null;
  youtubeIds: string | null;
  members: Array<{ id?: string; name: string; cvName: string | null }>;
  units?: Array<{ id: string; name: string }>;
}

interface PublicUser {
  nickname: string;
  themeColor: string;
  familiarity: number;
}

interface SongDetailModalProps {
  song: Song | null;
  onClose: () => void;
}

const FAM_LABELS: Record<number, string> = { 1: '會唱', 2: '常聽' };

/** 從逗號分隔的 youtubeIds 字串取第一個可用 ID */
function firstYouTubeId(raw: string | null): string | null {
  if (!raw) return null;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ids[0] ?? null;
}

export default function SongDetailModal({ song, onClose }: SongDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [publicUsers, setPublicUsers] = useState<PublicUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [autoplayFailed, setAutoplayFailed] = useState(false);

  // 成員折疊狀態
  const membersRef = useRef<HTMLDivElement>(null);
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [showExpandBtn, setShowExpandBtn] = useState(false);

  // 關閉 — Escape 鍵
  useEffect(() => {
    if (!song) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [song, onClose]);

  // 背景捲動鎖定
  useEffect(() => {
    if (!song) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [song]);

  // 每次開新歌曲，重置 state 並拉公開使用者
  useEffect(() => {
    if (!song) return;
    setPublicUsers([]);
    setAutoplayFailed(false);
    setLoadingUsers(true);
    fetch(`/api/songs/${song.id}/users`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPublicUsers(data);
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [song?.id]);

  // 計算成員列表高度以決定是否顯示「展開更多」按鈕
  // 延遲一點點確保 DOM 渲染完成
  useEffect(() => {
    if (!song) return;
    
    // 初始化為收合狀態與隱藏按鈕
    setMembersExpanded(false);
    setShowExpandBtn(false);

    // 等待 React 實際把 members 塞入 DOM 且瀏覽器排版完成
    const timer = setTimeout(() => {
      if (membersRef.current) {
        // 如果實際高度大於容器設定的 max-height (190px)，代表有內容被隱藏
        if (membersRef.current.scrollHeight > 192) {
          setShowExpandBtn(true);
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [song]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  if (!song) return null;

  const brandColor = getBrandColor(song.brand);
  const brandTextColor = getAccentTextColor(brandColor);
  const videoId = firstYouTubeId(song.youtubeIds);

  // autoplay=1 + mute=0：讓瀏覽器嘗試帶聲音自動播放，失敗則大多瀏覽器會靜音後播放
  const embedSrc = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`
    : null;

  return (
    <div
      ref={overlayRef}
      className="song-detail-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={`${song.title} 詳細資料`}
    >
      <div className="song-detail-modal">
        {/* 關閉按鈕 */}
        <button
          className="song-detail-close"
          onClick={onClose}
          aria-label="關閉"
          type="button"
        >
          ×
        </button>

        {/* 標頭 */}
        <div
          className="song-detail-header"
          style={{ borderBottomColor: brandColor }}
        >
          <h2 className="song-detail-title">{song.title}</h2>
          <div className="song-detail-badges">
            <span
              className="song-badge badge-brand"
              style={{ backgroundColor: brandColor, color: brandTextColor }}
            >
              {getBrandDisplayName(song.brand)}
            </span>
            {song.musicType.includes('solo') && (
              <span className="song-badge badge-type">SOLO</span>
            )}
            {song.musicType.includes('unit') && (
              <span className="song-badge badge-type">UNIT</span>
            )}
          </div>
        </div>

        <div className="song-detail-body">
          {/* 左欄：歌曲資訊 + 公開使用者 */}
          <div className="song-detail-info-col">
            {/* 歌曲詳細資訊 */}
            <section className="song-detail-section">
              <h3 className="song-detail-section-title">歌曲資訊</h3>
              <dl className="song-detail-dl">
                {song.lyrics && (
                  <>
                    <dt>作詞</dt><dd>{song.lyrics}</dd>
                  </>
                )}
                {song.composer && (
                  <>
                    <dt>作曲</dt><dd>{song.composer}</dd>
                  </>
                )}
                {song.arranger && (
                  <>
                    <dt>編曲</dt><dd>{song.arranger}</dd>
                  </>
                )}
                {(song.lowestPitch || song.highestPitch) && (
                  <>
                    <dt>音域</dt>
                    <dd>{song.lowestPitch || '--'} ~ {song.highestPitch || '--'}</dd>
                  </>
                )}
              </dl>

              {/* 成員 */}
              {song.members.length > 0 && (
                <div className="song-detail-members-container">
                  <div
                    ref={membersRef}
                    className={`song-detail-members ${!membersExpanded ? 'is-collapsed' : ''}`}
                  >
                    {song.members.map((m, i) => (
                      <div key={m.id ?? i} className="song-detail-member-chip">
                        <span className="chip-name">{m.name}</span>
                        {m.cvName && <span className="chip-cv">{m.cvName}</span>}
                      </div>
                    ))}
                  </div>
                  {showExpandBtn && (
                    <button
                      className="song-detail-expand-btn"
                      onClick={() => setMembersExpanded(!membersExpanded)}
                    >
                      {membersExpanded ? '顯示較少' : '顯示更多'}
                    </button>
                  )}
                </div>
              )}

              {/* 組合 */}
              {song.units && song.units.length > 0 && (
                <div className="song-detail-units">
                  {song.units.map((u) => (
                    <span key={u.id} className="song-detail-unit-tag">{u.name}</span>
                  ))}
                </div>
              )}
            </section>

            {/* 公開會唱 / 常聽的人 */}
            <section className="song-detail-section">
              <h3 className="song-detail-section-title">公開歌單中會唱 / 常聽</h3>
              {loadingUsers ? (
                <div className="song-detail-loading">載入中…</div>
              ) : publicUsers.length === 0 ? (
                <div className="song-detail-empty">目前沒有公開使用者標記這首歌。</div>
              ) : (
                <div className="song-detail-users">
                  {publicUsers.map((u, i) => (
                    <div
                      key={i}
                      className="song-detail-user-chip"
                      style={{
                        borderColor: u.themeColor,
                        boxShadow: `0 0 8px ${u.themeColor}33`,
                      }}
                    >
                      <span
                        className="user-dot"
                        style={{ background: u.themeColor }}
                      />
                      <span className="user-nick">{u.nickname}</span>
                      <span
                        className={`user-fam-badge state-${u.familiarity}`}
                      >
                        {FAM_LABELS[u.familiarity] ?? ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* 右欄：YouTube */}
          <div className="song-detail-video-col">
            {embedSrc ? (
              <div className="song-detail-video-wrap">
                <iframe
                  className="song-detail-iframe"
                  src={embedSrc}
                  title={`${song.title} 公式動画`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  loading="eager"
                />
                {autoplayFailed && (
                  <p className="song-detail-autoplay-hint">
                    若影片未自動播放，請點選播放鈕。
                  </p>
                )}
              </div>
            ) : (
              <div className="song-detail-no-video">
                <div className="no-video-icon">▶</div>
                <div>此歌曲尚無公式動画資料</div>
                {song.youtubeIds === null && (
                  <div className="no-video-hint">YouTube 資料仍在同步中</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
