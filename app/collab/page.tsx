'use client';

import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import MemberToggle from '@/components/MemberToggle';
import { buildThemeVars, getBrandColor, getBrandDisplayName, getAccentTextColor } from '@/lib/themeUtils';


interface CollabSong {
  id: string;
  slug: string;
  title: string;
  brand: string;
  musicType: string;
  lyrics: string | null;
  composer: string | null;
  arranger: string | null;
  lowestPitch: string | null;
  highestPitch: string | null;
  members: Array<{ name: string; cvName: string | null }>;
  ratings: Record<string, number>;
}

export default function CollaborationPlaylistPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    users: string[];
    songs: CollabSong[];
  } | null>(null);

  // User search states
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSuggestions, setUserSuggestions] = useState<Array<{nickname: string, shareCode: string, themeColor: string}>>([]);
  const [showUserSuggestions, setShowUserSuggestions] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Array<{nickname: string, shareCode: string, themeColor: string}>>([]);

  // Song users modal states
  const [selectedSong, setSelectedSong] = useState<CollabSong | null>(null);
  const [songUsers, setSongUsers] = useState<Array<{nickname: string, themeColor: string, familiarity: number}>>([]);
  const [loadingSongUsers, setLoadingSongUsers] = useState(false);

  // 主題色（跟隨登入使用者設定）
  const themeColor = session?.user?.themeColor || '#92cfbb';

  // Fetch user suggestions
  const handleUserSearch = async (q: string) => {
    setUserSearchQuery(q);
    if (q.trim().length === 0) {
      setUserSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/user/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setUserSuggestions(data);
      setShowUserSuggestions(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddUser = (u: {nickname: string, shareCode: string, themeColor: string}) => {
    if (!selectedUsers.find(su => su.shareCode === u.shareCode)) {
      setSelectedUsers([...selectedUsers, u]);
    }
    setUserSearchQuery('');
    setShowUserSuggestions(false);
  };

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

    const shareCodes = selectedUsers.map(u => u.shareCode);

    if (shareCodes.length < 2) {
      setError('請選擇至少兩個使用者進行比對。');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/collab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareCodes }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '比對失敗。');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('與伺服器連線異常，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }

  const handleSongClick = async (song: CollabSong) => {
    setSelectedSong(song);
    setSongUsers([]);
    setLoadingSongUsers(true);
    try {
      const res = await fetch(`/api/songs/${song.id}/users`);
      const data = await res.json();
      setSongUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSongUsers(false);
    }
  };

  const familiarityLabels: Record<number, string> = {
    1: '會唱',
    2: '常聽',
    3: '聽過',
    4: '模糊',
  };

  const familiarityStates: Record<number, string> = {
    1: 'state-1',
    2: 'state-2',
    3: 'state-3',
    4: 'state-4',
  };

  return (
    <div style={{
      ...(buildThemeVars(themeColor) as any),
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
    }}>
      <header>
        <div className="container header-content">
          <h1>IMAS Song Familiarity Hub</h1>
          <a href="/" className="btn btn-secondary">
            返回首頁
          </a>
        </div>
      </header>

      <main className="container" style={{ paddingTop: '32px', marginBottom: '80px' }}>
        <div style={{ marginBottom: '32px', maxWidth: '600px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
            共同歌單交集加總
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
            搜尋並加入多個使用者（需對方設定為公開歌單），系統將找出所有人都「會唱、常聽、聽過或不太記得」的交集歌曲，方便在線下 Live KTV 或聚會中作為選歌參考！
          </p>

          <form onSubmit={handleCompare} className="card-el" style={{ padding: '20px' }}>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                搜尋使用者暱稱
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="搜尋使用者暱稱..."
                  value={userSearchQuery}
                  onChange={(e) => handleUserSearch(e.target.value)}
                  onFocus={() => setShowUserSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowUserSuggestions(false), 200)}
                />
                {showUserSuggestions && userSuggestions.length > 0 && (
                  <div className="autocomplete-dropdown">
                    {userSuggestions.map(u => (
                      <div 
                        key={u.shareCode} 
                        className="autocomplete-item"
                        onClick={() => handleAddUser(u)}
                      >
                        <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: u.themeColor, marginRight: '8px', borderRadius: '50%' }}></span>
                        {u.nickname}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {selectedUsers.map(u => (
                <div key={u.shareCode} style={{ background: 'var(--bg-base)', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', border: `1px solid ${u.themeColor}50` }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: u.themeColor }}></span>
                  {u.nickname}
                  <button type="button" style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-muted)' }} onClick={() => setSelectedUsers(selectedUsers.filter(x => x.shareCode !== u.shareCode))}>&times;</button>
                </div>
              ))}
            </div>

            {error && (
              <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '16px' }}>
                {error}
              </div>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? '正在計算共同交集...' : '比對共同歌單'}
            </button>
          </form>
        </div>

        {result && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              比對結果: {result.users.map((u) => `${u}`).join(' ∩ ')}
              <span style={{ marginLeft: '12px', fontSize: '14px', color: 'var(--accent-color)' }}>
                共計 {result.songs.length} 首共同歌曲
              </span>
            </h3>

            <section className="songs-grid">
              {result.songs.length === 0 ? (
                <div className="card-el" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  找不到所有使用者均熟悉的共同歌曲。試著減少比對的使用者數量！
                </div>
              ) : (
                result.songs.map((song) => {
                  const brandClean = song.brand.replace('music_', '').toUpperCase();

                  return (
                    <div key={song.id} className="song-card" style={{ gap: '20px', cursor: 'pointer' }} onClick={() => handleSongClick(song)}>
                      <div className="song-info">
                        <div className="song-title-row">
                          <span className="song-title">{song.title}</span>
                          <span 
                            className="song-badge badge-brand"
                            style={{ 
                              backgroundColor: getBrandColor(song.brand),
                              color: getAccentTextColor(getBrandColor(song.brand))
                            }}
                          >
                            {getBrandDisplayName(song.brand)}
                          </span>
                          {song.musicType.includes('solo') && (
                            <span className="song-badge badge-type">SOLO</span>
                          )}
                          {song.musicType.includes('unit') && (
                            <span className="song-badge badge-type">UNIT</span>
                          )}
                          {(song.lowestPitch || song.highestPitch) && (
                            <span className="song-badge badge-pitch">
                              音域: {song.lowestPitch || '--'} ~ {song.highestPitch || '--'}
                            </span>
                          )}
                        </div>
                        <div className="song-meta">
                          {song.lyrics && <span>作詞: {song.lyrics} </span>}
                          {song.composer && <span>/ 作曲: {song.composer} </span>}
                          {song.arranger && <span>/ 編曲: {song.arranger}</span>}
                        </div>
                        <MemberToggle members={song.members} />
                      </div>

                      {/* 顯示各使用者的熟悉度對照 */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {result.users.map((user) => {
                          const rating = song.ratings[user];
                          return (
                            <div key={user} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user}</span>
                              <span className={`familiarity-btn ${familiarityStates[rating]} active`} style={{ padding: '4px 10px', fontSize: '11px', cursor: 'default' }}>
                                {familiarityLabels[rating]}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </div>
        )}
      </main>

      {/* 顯示特定歌曲的公開使用者模態框 */}
      {selectedSong && (
        <div className="modal-overlay" onClick={() => setSelectedSong(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: '4px' }}>{selectedSong.title}</h2>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              這首歌曲有誰會唱或常聽？ (公開清單)
            </div>
            {loadingSongUsers ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>載入中...</div>
            ) : songUsers.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>目前沒有公開的使用者會唱這首歌。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
                {songUsers.map((u, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-base)', borderRadius: '8px', borderLeft: `4px solid ${u.themeColor}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{u.nickname}</span>
                    </div>
                    <span className={`familiarity-btn ${familiarityStates[u.familiarity]} active`} style={{ padding: '4px 12px', fontSize: '12px', cursor: 'default' }}>
                      {familiarityLabels[u.familiarity]}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedSong(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
