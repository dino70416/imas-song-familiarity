'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { BrandIcon } from '@/components/BrandIcon';
import { getBrandColor, getBrandShortName } from '@/lib/themeUtils';
import { BRAND_VALUES } from '@/lib/brandMap';
import { fetchSongsClient } from '@/lib/songClientCache';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  initialSongIds: string[];
  onConfirm: (selectedIds: string[], comment?: string) => void;
  maxSelections?: number;
  singleSelect?: boolean;
  showCommentInput?: boolean;
}

interface Song {
  id: string;
  title: string;
  brand: string;
  musicType: string;
  members: Array<{ name: string; cvName: string | null }>;
}

export default function SongPickerModal({
  open,
  onClose,
  title,
  initialSongIds,
  onConfirm,
  maxSelections = 30,
  singleSelect = false,
  showCommentInput = false,
}: Props) {
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Set<string>>(new Set(initialSongIds));
  const [query, setQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    let active = true;
    fetchSongsClient()
      .then((data) => {
        if (active) {
          setAllSongs(data);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allSongs.filter((song) => {
      // Brand filter
      if (selectedBrand && song.brand !== selectedBrand) return false;
      // Query search
      if (!q) return true;
      const titleMatch = song.title.toLowerCase().includes(q);
      const memberMatch = song.members.some(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.cvName && m.cvName.toLowerCase().includes(q))
      );
      return titleMatch || memberMatch;
    });
  }, [allSongs, selectedBrand, query]);

  // 找出所有當前已儲存的歌曲
  const savedSongs = useMemo(() => {
    return allSongs.filter((song) => initialSongIds.includes(song.id));
  }, [allSongs, initialSongIds]);

  // 搜尋結果排除掉已儲存的歌曲，並限制前 100 首以維持效能
  const displayedSongs = useMemo(() => {
    const savedIds = new Set(initialSongIds);
    const remainingFiltered = filtered.filter((song) => !savedIds.has(song.id));
    return remainingFiltered.slice(0, 100);
  }, [filtered, initialSongIds]);

  function toggle(id: string) {
    if (singleSelect) {
      setDraft(new Set([id]));
      return;
    }

    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= maxSelections) {
          alert(`最多只能選擇 ${maxSelections} 首歌曲！`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '90%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600' }}>{title}</h2>
          {!singleSelect && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              已選擇 {draft.size} / {maxSelections}
            </span>
          )}
        </div>

        {/* Brand chips filter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>團體篩選：</span>
          <button
            type="button"
            onClick={() => setSelectedBrand('')}
            className={`idol-picker-brand-chip ${!selectedBrand ? 'is-active' : ''}`}
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            全部
          </button>
          {BRAND_VALUES.map((b) => {
            const active = selectedBrand === b;
            const color = getBrandColor(b);
            return (
              <button
                key={b}
                type="button"
                onClick={() => setSelectedBrand(b)}
                className={`idol-picker-brand-chip ${active ? 'is-active' : ''}`}
                style={
                  active
                    ? {
                      borderColor: color,
                      color,
                      backgroundColor: `${color}1a`,
                      padding: '4px 10px',
                      fontSize: '12px',
                    }
                    : {
                      padding: '4px 10px',
                      fontSize: '12px',
                    }
                }
              >
                <BrandIcon brand={b} className="idol-picker-brand-icon" />
                <span>{getBrandShortName(b)}</span>
              </button>
            );
          })}
        </div>

        <input
          type="text"
          className="form-input"
          placeholder="搜尋歌名、成員、聲優姓名..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: '12px' }}
        />

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          找到 {filtered.length} 首歌曲 {filtered.length > 100 && '(僅顯示前 100 首，請輸入關鍵字搜尋縮小範圍)'}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>載入歌曲中...</div>
        ) : (
          <div
            style={{
              maxHeight: '40vh',
              overflowY: 'auto',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '4px 0',
            }}
          >
            {savedSongs.length === 0 && displayedSongs.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                沒有符合的歌曲。
              </div>
            ) : (
              <>
                {savedSongs.length > 0 && (
                  <>
                    <div style={{ padding: '6px 16px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-color)' }}>
                      📌 已儲存的資料
                    </div>
                    {savedSongs.map((song) => {
                      const checked = draft.has(song.id);
                      const color = getBrandColor(song.brand);
                      return (
                        <button
                          key={`saved-${song.id}`}
                          type="button"
                          onClick={() => toggle(song.id)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 16px',
                            background: checked ? 'var(--accent-glow-soft)' : 'none',
                            border: 'none',
                            borderBottom: '1px solid var(--border-color)',
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ marginRight: '10px', display: 'flex', alignItems: 'center', fontSize: '16px' }}>
                            <BrandIcon brand={song.brand} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                              <span style={{ fontWeight: '500', color: `${color}` }}>{song.title}</span>
                            </div>
                            {song.members.length > 0 && (
                              <div
                                title={song.members.map((m) => m.name).join('、')}
                                style={{
                                  fontSize: '11px',
                                  color: 'var(--text-muted)',
                                  marginTop: '2px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {song.members.map((m) => m.name).join('、')}
                              </div>
                            )}
                          </div>
                          {checked && <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>✓</span>}
                        </button>
                      );
                    })}
                    <div style={{ padding: '6px 16px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-color)' }}>
                      🔍 搜尋結果
                    </div>
                  </>
                )}

                {displayedSongs.map((song) => {
                  const checked = draft.has(song.id);
                  const color = getBrandColor(song.brand);
                  return (
                    <button
                      key={song.id}
                      type="button"
                      onClick={() => toggle(song.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 16px',
                        background: checked ? 'var(--accent-glow-soft)' : 'none',
                        border: 'none',
                        borderBottom: '1px solid var(--border-color)',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ marginRight: '10px', display: 'flex', alignItems: 'center', fontSize: '16px' }}>
                        <BrandIcon brand={song.brand} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontWeight: '500', color: `${color}` }}>{song.title}</span>
                        </div>
                        {song.members.length > 0 && (
                          <div
                            title={song.members.map((m) => m.name).join('、')}
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              marginTop: '2px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {song.members.map((m) => m.name).join('、')}
                          </div>
                        )}
                      </div>
                      {checked && <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>✓</span>}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        {showCommentInput && draft.size > 0 && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              許願留言（選填，最多 200 字）
            </label>
            <textarea
              className="form-input"
              maxLength={200}
              placeholder="請輸入留言或給該製作人的備註..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              style={{
                width: '100%',
                height: '70px',
                resize: 'none',
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-base)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          {!singleSelect && draft.size > 0 && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={() => setDraft(new Set())}
            >
              重設
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onConfirm(Array.from(draft), comment);
              onClose();
            }}
          >
            確定 ({draft.size})
          </button>
        </div>
      </div>
    </div>
  );
}
