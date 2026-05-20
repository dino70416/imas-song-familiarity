'use client';

import React, { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import MemberToggle from '@/components/MemberToggle';
import { buildThemeVars, getBrandColor, getBrandDisplayName, getBrandShortName, getAccentTextColor } from '@/lib/themeUtils';


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

  // 結果上的二次篩選：依使用者 / 依熟悉度 / 依品牌
  // 三者都空 = 不限；同一欄 OR，欄位之間 AND
  const [includedUsers, setIncludedUsers] = useState<string[]>([]);
  const [includedFams, setIncludedFams] = useState<number[]>([]);
  const [includedBrands, setIncludedBrands] = useState<string[]>([]);

  // 主題色（跟隨登入使用者設定）
  const themeColor = session?.user?.themeColor || '#92cfbb';

  // Fetch user suggestions — 空 q 也撈（取得全部公開使用者列表，讓 focus 時就有清單可挑）
  const handleUserSearch = async (q: string) => {
    setUserSearchQuery(q);
    try {
      const res = await fetch(`/api/user/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setUserSuggestions(Array.isArray(data) ? data : []);
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
      setError('請選擇至少兩個使用者，才能進行比對。');
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
        // 換新的比對結果就清掉舊的二次篩選
        setIncludedUsers([]);
        setIncludedFams([]);
        setIncludedBrands([]);
      }
    } catch (err) {
      setError('與伺服器連線異常，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }

  // 對 API 回來的聯集再做二次過濾（同欄 OR、欄位之間 AND）
  const filteredSongs = useMemo(() => {
    if (!result) return [];
    const userSet = includedUsers.length > 0 ? new Set(includedUsers) : null;
    const famSet = includedFams.length > 0 ? new Set(includedFams) : null;
    const brandSet = includedBrands.length > 0 ? new Set(includedBrands) : null;
    return result.songs.filter((s) => {
      if (brandSet && !brandSet.has(s.brand)) return false;
      return Object.entries(s.ratings).some(([nick, rating]) => {
        if (userSet && !userSet.has(nick)) return false;
        if (famSet && !famSet.has(rating as number)) return false;
        return true;
      });
    });
  }, [result, includedUsers, includedFams, includedBrands]);

  // 下拉只列出當前 union 結果裡實際出現過的品牌
  const presentBrands = useMemo(() => {
    if (!result) return [] as string[];
    return Array.from(new Set(result.songs.map((s) => s.brand)));
  }, [result]);

  // Modal 只列「當前比對的使用者」對這首歌的評分，不再撈全部公開使用者
  const handleSongClick = (song: CollabSong) => {
    setSelectedSong(song);
    const list = Object.entries(song.ratings).map(([nickname, fam]) => {
      const themeColor =
        selectedUsers.find((u) => u.nickname === nickname)?.themeColor ?? 'var(--accent-color)';
      return { nickname, themeColor, familiarity: fam as number };
    });
    setSongUsers(list);
    setLoadingSongUsers(false);
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
            共同歌單合集
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
            搜尋並加入至少兩個使用者（需對方設定為公開歌單），系統會把所有人標記過的歌曲 union 起來。再用下方的「依使用者 / 依熟悉度」chip 篩選誰會、會到什麼程度，方便挑線下 Live KTV 或聚會選歌。
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
                  placeholder="點一下就會列出所有公開歌單的使用者…"
                  value={userSearchQuery}
                  onChange={(e) => handleUserSearch(e.target.value)}
                  onFocus={() => {
                    setShowUserSuggestions(true);
                    // 空欄位 focus → 把全部公開使用者撈出來給挑
                    if (userSuggestions.length === 0) handleUserSearch(userSearchQuery);
                  }}
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
              {loading ? '正在合併歌單...' : '合併歌單'}
            </button>
          </form>
        </div>

        {result && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              {result.users.join(' / ')}
              <span style={{ marginLeft: '12px', fontSize: '14px', color: 'var(--accent-color)' }}>
                合計 {filteredSongs.length} / {result.songs.length} 首
              </span>
            </h3>

            {/* 二次篩選：依使用者 */}
            {result.users.length > 0 && (
              <section className="familiarity-filter-panel" data-testid="user-filter">
                <span className="familiarity-filter-label">依使用者：</span>
                {result.users.map((nick) => {
                  const user = selectedUsers.find((u) => u.nickname === nick);
                  const active = includedUsers.includes(nick);
                  const color = user?.themeColor || 'var(--accent-color)';
                  return (
                    <button
                      key={nick}
                      type="button"
                      className={`familiarity-btn ${active ? 'active' : ''}`}
                      aria-pressed={active}
                      data-testid={`user-filter-${nick}`}
                      onClick={() =>
                        setIncludedUsers((prev) =>
                          prev.includes(nick) ? prev.filter((x) => x !== nick) : [...prev, nick],
                        )
                      }
                      style={
                        active
                          ? { borderColor: color, color, backgroundColor: `${color}1a`, boxShadow: `0 0 12px ${color}1f` }
                          : undefined
                      }
                    >
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color, marginRight: '6px', verticalAlign: 'middle' }}></span>
                      {nick}
                    </button>
                  );
                })}
                {includedUsers.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary familiarity-filter-clear"
                    onClick={() => setIncludedUsers([])}
                  >
                    清除
                  </button>
                )}
              </section>
            )}

            {/* 二次篩選：依熟悉度 */}
            <section className="familiarity-filter-panel" data-testid="fam-filter">
              <span className="familiarity-filter-label">依熟悉度：</span>
              {[1, 2, 3, 4].map((v) => {
                const labels: Record<number, string> = { 1: '會唱', 2: '常聽', 3: '聽過', 4: '模糊' };
                const active = includedFams.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    className={`familiarity-btn state-${v} ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    data-testid={`fam-filter-${v}`}
                    onClick={() =>
                      setIncludedFams((prev) =>
                        prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
                      )
                    }
                  >
                    {labels[v]}
                  </button>
                );
              })}
              {includedFams.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary familiarity-filter-clear"
                  onClick={() => setIncludedFams([])}
                >
                  清除
                </button>
              )}
            </section>

            {/* 二次篩選：依品牌（只列當前 union 結果裡實際出現過的品牌） */}
            {presentBrands.length > 0 && (
              <section className="familiarity-filter-panel" data-testid="brand-filter" style={{ marginBottom: '20px' }}>
                <span className="familiarity-filter-label">依品牌：</span>
                {presentBrands.map((b) => {
                  const active = includedBrands.includes(b);
                  const color = getBrandColor(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      className={`familiarity-btn ${active ? 'active' : ''}`}
                      aria-pressed={active}
                      data-testid={`brand-filter-${b}`}
                      onClick={() =>
                        setIncludedBrands((prev) =>
                          prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b],
                        )
                      }
                      style={
                        active
                          ? { borderColor: color, color, backgroundColor: `${color}1a`, boxShadow: `0 0 12px ${color}1f` }
                          : undefined
                      }
                    >
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color, marginRight: '6px', verticalAlign: 'middle' }}></span>
                      <span className="brand-chip-name brand-chip-name--full">{getBrandDisplayName(b)}</span>
                      <span className="brand-chip-name brand-chip-name--short">{getBrandShortName(b)}</span>
                    </button>
                  );
                })}
                {includedBrands.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary familiarity-filter-clear"
                    onClick={() => setIncludedBrands([])}
                  >
                    清除
                  </button>
                )}
              </section>
            )}

            <section className="songs-grid">
              {filteredSongs.length === 0 ? (
                <div className="card-el" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  {result.songs.length === 0
                    ? '所選使用者目前都沒有標記過任何歌曲。'
                    : '沒有符合「依使用者 / 依熟悉度 / 依品牌」條件的歌曲，調整 chip 試試。'}
                </div>
              ) : (
                filteredSongs.map((song) => {
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

                      {/* 顯示各使用者的熟悉度對照 — 沒評過的標 「—」 */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {result.users.map((user) => {
                          const rating = song.ratings[user];
                          const rated = rating != null;
                          return (
                            <div key={user} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user}</span>
                              {rated ? (
                                <span className={`familiarity-btn ${familiarityStates[rating]} active`} style={{ padding: '4px 10px', fontSize: '11px', cursor: 'default' }}>
                                  {familiarityLabels[rating]}
                                </span>
                              ) : (
                                <span className="familiarity-btn" style={{ padding: '4px 10px', fontSize: '11px', cursor: 'default', opacity: 0.4 }}>
                                  —
                                </span>
                              )}
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
              當前比對的使用者裡，誰會這首歌
            </div>
            {loadingSongUsers ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>載入中...</div>
            ) : songUsers.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>當前比對的使用者都沒有標記過這首歌。</div>
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
