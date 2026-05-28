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
  /** 使用者目前對這首歌的熟悉度 (0 = 未評 / 不記得) */
  currentFamiliarity?: number;
  /** 點按鈕改熟悉度時觸發 — 帶上 modal 才有 5 顆評分鈕 */
  onSelectFamiliarity?: (familiarity: number) => void;
  /**
   * 覆寫「公開使用者」區段 — 提供時不打 /api/songs/{id}/users,直接渲染傳進來的列表
   * 用途:/collab 想顯示「目前比對的這群人對這首歌的熟悉度」而非全站公開
   */
  participants?: PublicUser[];
  /** 區段標題覆寫,預設「公開歌單中會唱 / 常聽」 */
  participantsTitle?: string;
}

// 包含全部熟悉度等級 — collab 場景會用到 3 / 4;首頁 / 公開歌單只會有 1 / 2(API 端 filter)
const FAM_LABELS: Record<number, string> = {
  1: '會唱',
  2: '常聽',
  3: '聽過',
  4: '模糊',
};

// modal 內部 5 顆評分鈕設定（跟首頁卡片一致）
const RATING_OPTIONS = [
  { v: 1, label: '會唱' },
  { v: 2, label: '常聽' },
  { v: 3, label: '有聽過' },
  { v: 4, label: '不太記得' },
  { v: 0, label: '不記得' },
];

/** 從逗號分隔的 youtubeIds 字串取第一個可用 ID */
function firstYouTubeId(raw: string | null): string | null {
  if (!raw) return null;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ids[0] ?? null;
}

// publicUsers 跨歌曲記憶 (Module-level Map) — 同一首歌再開不會重抓 API
// 模組級別保證在 component remount / re-render 後還能 hit cache
const publicUsersCache = new Map<string, PublicUser[]>();

export default function SongDetailModal({
  song,
  onClose,
  currentFamiliarity = 0,
  onSelectFamiliarity,
  participants,
  participantsTitle,
}: SongDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [publicUsers, setPublicUsers] = useState<PublicUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [autoplayFailed, setAutoplayFailed] = useState(false);

  // 成員折疊狀態
  const membersRef = useRef<HTMLDivElement>(null);
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [showMembersExpand, setShowMembersExpand] = useState(false);
  const [hiddenMemberCount, setHiddenMemberCount] = useState(0);

  // 公開使用者折疊狀態（前 5 人，超過才折）
  const PUB_USERS_PREVIEW = 5;
  const [publicUsersExpanded, setPublicUsersExpanded] = useState(false);

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

  // 每次開新歌曲,重置 state 並拉公開使用者 (有 cache 就直出,避免每點 1 首打 1 次 API)
  // 若呼叫端提供 participants override (例如 /collab 想顯示比對中的人) → skip fetch
  useEffect(() => {
    if (!song) return;
    setAutoplayFailed(false);
    if (participants) {
      // 由呼叫端控制要顯示什麼人,modal 自己不發請求
      setPublicUsers(participants);
      setLoadingUsers(false);
      return;
    }
    const cached = publicUsersCache.get(song.id);
    if (cached) {
      setPublicUsers(cached);
      setLoadingUsers(false);
      return;
    }
    setPublicUsers([]);
    setLoadingUsers(true);
    fetch(`/api/songs/${song.id}/users`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPublicUsers(data);
          publicUsersCache.set(song.id, data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [song?.id, participants]);

  // 切歌時重置折疊狀態 + 判斷成員是否需要折疊
  // 規則：成員數 > 6 預設折，按 "+ N 人" 展開
  useEffect(() => {
    if (!song) return;
    setMembersExpanded(false);
    setPublicUsersExpanded(false);
    const total = song.members?.length ?? 0;
    if (total > 6) {
      setShowMembersExpand(true);
      setHiddenMemberCount(total - 6);
    } else {
      setShowMembersExpand(false);
      setHiddenMemberCount(0);
    }
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

        {/* 標頭 — 含 brand badge + meta(作詞/作曲/編曲/音域) 在右上補空 */}
        <div
          className="song-detail-header"
          style={{ borderBottomColor: brandColor }}
        >
          <div className="song-detail-header-main">
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
          {(song.lyrics || song.composer || song.arranger || song.lowestPitch || song.highestPitch) && (
            <div className="song-detail-meta">
              {song.lyrics && (
                <span><b>作詞</b> {song.lyrics}</span>
              )}
              {song.composer && (
                <span><b>作曲</b> {song.composer}</span>
              )}
              {song.arranger && (
                <span><b>編曲</b> {song.arranger}</span>
              )}
              {(song.lowestPitch || song.highestPitch) && (
                <span><b>音域</b> {song.lowestPitch || '--'} ~ {song.highestPitch || '--'}</span>
              )}
            </div>
          )}

          {/* 評分快捷列：modal 一打開最頂層，看完 meta 就能立刻評 */}
          {onSelectFamiliarity && (
            <div
              className="song-detail-rating"
              data-testid="song-detail-rating"
              role="radiogroup"
              aria-label="設定我對這首歌的熟悉度"
            >
              <div className="song-detail-rating-buttons familiarity-options">
                {RATING_OPTIONS.map(({ v, label }) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={currentFamiliarity === v}
                    className={`familiarity-btn state-${v} ${currentFamiliarity === v ? 'active' : ''}`}
                    onClick={() => onSelectFamiliarity(v)}
                    data-testid={`detail-rating-${v}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="song-detail-body">
          {/* 左欄：演唱成員 + 公開使用者 (歌曲資訊已移到 header meta) */}
          <div className="song-detail-info-col">
            {/* 演唱成員 — > 6 人折疊 */}
            {song.members.length > 0 && (
              <section className="song-detail-section">
                <h3 className="song-detail-section-title">
                  演唱成員 ({song.members.length})
                </h3>
                <div
                  ref={membersRef}
                  className="song-detail-members"
                >
                  {(membersExpanded ? song.members : song.members.slice(0, 6)).map((m, i) => (
                    <div key={m.id ?? i} className="song-detail-member-chip">
                      <span className="chip-name">{m.name}</span>
                      {m.cvName && <span className="chip-cv">{m.cvName}</span>}
                    </div>
                  ))}
                </div>
                {showMembersExpand && (
                  <button
                    className="song-detail-expand-btn"
                    onClick={() => setMembersExpanded(!membersExpanded)}
                  >
                    {membersExpanded ? '收合' : `+ ${hiddenMemberCount} 人`}
                  </button>
                )}

                {/* 組合 — 緊接在成員下方 */}
                {song.units && song.units.length > 0 && (
                  <div className="song-detail-units">
                    {song.units.map((u) => (
                      <span key={u.id} className="song-detail-unit-tag">{u.name}</span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 公開會唱 / 常聽的人 — > 10 人折疊 */}
            <section className="song-detail-section">
              <h3 className="song-detail-section-title">
                {participantsTitle ?? '公開歌單中會唱 / 常聽'}
                {!loadingUsers && publicUsers.length > 0 && ` (${publicUsers.length})`}
              </h3>
              {loadingUsers ? (
                <div className="song-detail-loading">載入中…</div>
              ) : publicUsers.length === 0 ? (
                <div className="song-detail-empty">目前沒有公開使用者標記這首歌。</div>
              ) : (
                <>
                  <div className="song-detail-users">
                    {(publicUsersExpanded
                      ? publicUsers
                      : publicUsers.slice(0, PUB_USERS_PREVIEW)
                    ).map((u, i) => (
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
                  {publicUsers.length > PUB_USERS_PREVIEW && (
                    <button
                      className="song-detail-expand-btn"
                      onClick={() => setPublicUsersExpanded(!publicUsersExpanded)}
                    >
                      {publicUsersExpanded
                        ? '收合'
                        : `+ ${publicUsers.length - PUB_USERS_PREVIEW} 人`}
                    </button>
                  )}
                </>
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
