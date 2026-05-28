'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Virtuoso } from 'react-virtuoso';
import MemberToggle from '@/components/MemberToggle';
import UserPickerModal, { PickerUser } from '@/components/UserPickerModal';
import SongDetailModal from '@/components/SongDetailModal';
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
  youtubeIds: string | null;
  members: Array<{ id?: string; name: string; cvName: string | null }>;
  units?: Array<{ id: string; name: string }>;
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

  // 已選的「其他」使用者(不含自己)；自己另外從 session 拿
  const [selectedUsers, setSelectedUsers] = useState<PickerUser[]>([]);
  const [showUserPicker, setShowUserPicker] = useState(false);
  // 是否把自己加入比對（預設 ON,可在 self 區塊用 checkbox 切掉）
  const [includeSelf, setIncludeSelf] = useState(true);

  // 自己:登入時自動加入比對。未登入則 self = null
  const self: PickerUser | null = session?.user
    ? {
        nickname: session.user.nickname || session.user.username || '我',
        shareCode: session.user.shareCode!,
        themeColor: session.user.themeColor || '#92cfbb',
      }
    : null;

  // 點 song card 開試聽 modal — 比對中的人 + ratings 會即時組成 participants 傳進 modal
  const [selectedSong, setSelectedSong] = useState<CollabSong | null>(null);

  // 結果上的二次篩選：依使用者 / 依熟悉度 / 依品牌
  // 三者都空 = 不限；同一欄 OR，欄位之間 AND
  const [includedUsers, setIncludedUsers] = useState<string[]>([]);
  const [includedFams, setIncludedFams] = useState<number[]>([]);
  const [includedBrands, setIncludedBrands] = useState<string[]>([]);
  // 排序：依加權分數 (會唱=4 / 常聽=3 / 聽過=2 / 模糊=1) 加總,分數高者排上面
  // 預設 ON — 線下聚會選歌時最有用的排序
  const [sortByScore, setSortByScore] = useState(true);

  // 全站歌曲目錄 (Global Song Catalog)，用於與後端傳回的輕量評分資料進行 Join
  const [globalSongsMap, setGlobalSongsMap] = useState<Map<string, Omit<CollabSong, 'ratings'>>>(new Map());
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const res = await fetch('/api/songs?schema=v2', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          const map = new Map<string, Omit<CollabSong, 'ratings'>>();
          for (const s of data) map.set(s.id, s);
          setGlobalSongsMap(map);
        }
      } catch (e) {
        console.error('無法載入歌曲目錄:', e);
      } finally {
        setCatalogLoading(false);
      }
    }
    loadCatalog();
  }, []);

  // 主題色（跟隨登入使用者設定）
  const themeColor = session?.user?.themeColor || '#92cfbb';

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

    // 自己 + 已選其他人組成最終 shareCodes;includeSelf 可被使用者關掉
    const shareCodes = [
      ...(self && includeSelf ? [self.shareCode] : []),
      ...selectedUsers.map((u) => u.shareCode),
    ];

    if (shareCodes.length < 2) {
      setError(
        self && includeSelf
          ? '請至少再選擇一位其他使用者來跟你比對。'
          : '請選擇至少兩個使用者，才能進行比對。',
      );
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
        // 將 API 傳回的 { id, ratings } 與全站歌曲目錄 Join
        const mergedSongs: CollabSong[] = [];
        for (const raw of data.songs) {
          const baseSong = globalSongsMap.get(raw.id);
          if (baseSong) {
            mergedSongs.push({
              ...baseSong,
              ratings: raw.ratings,
            });
          }
        }
        setResult({ users: data.users, songs: mergedSongs });
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

  // 加權分數: 5-familiarity → 會唱=4 / 常聽=3 / 聽過=2 / 模糊=1
  // 加總所有(有評過的)使用者對該歌的權重;沒評 / 不在 1..4 範圍 = 不計分
  // 排序時若有 includedUsers chip,只算被選到的人(跟「合計」對齊使用者意圖)
  function songScore(s: CollabSong, userSet: Set<string> | null): number {
    let total = 0;
    for (const [nick, fam] of Object.entries(s.ratings)) {
      if (userSet && !userSet.has(nick)) continue;
      if (typeof fam !== 'number' || fam < 1 || fam > 4) continue;
      total += 5 - fam;
    }
    return total;
  }

  // 對 API 回來的聯集再做二次過濾（同欄 OR、欄位之間 AND）+ 排序
  const filteredSongs = useMemo(() => {
    if (!result) return [];
    const userSet = includedUsers.length > 0 ? new Set(includedUsers) : null;
    const famSet = includedFams.length > 0 ? new Set(includedFams) : null;
    const brandSet = includedBrands.length > 0 ? new Set(includedBrands) : null;
    const filtered = result.songs.filter((s) => {
      if (brandSet && !brandSet.has(s.brand)) return false;
      return Object.entries(s.ratings).some(([nick, rating]) => {
        if (userSet && !userSet.has(nick)) return false;
        if (famSet && !famSet.has(rating as number)) return false;
        return true;
      });
    });
    if (!sortByScore) return filtered;
    // Array.sort 自 ES2019 stable,同分維持原順序
    return [...filtered].sort(
      (a, b) => songScore(b, userSet) - songScore(a, userSet),
    );
  }, [result, includedUsers, includedFams, includedBrands, sortByScore]);

  // 下拉只列出當前 union 結果裡實際出現過的品牌
  const presentBrands = useMemo(() => {
    if (!result) return [] as string[];
    return Array.from(new Set(result.songs.map((s) => s.brand)));
  }, [result]);

  // 使用 react-virtuoso 進行虛擬列表渲染，捨棄手動 IntersectionObserver 與 PAGE_SIZE

  // 點 song card 後算出「比對中的人對這首歌的熟悉度」(含 themeColor),傳進 SongDetailModal
  // 用 useMemo 隨 selectedSong / selectedUsers / self 變動重算
  const modalParticipants = useMemo(() => {
    if (!selectedSong) return undefined;
    const allParticipants: PickerUser[] = self ? [self, ...selectedUsers] : selectedUsers;
    return Object.entries(selectedSong.ratings).map(([nickname, fam]) => {
      const themeColor =
        allParticipants.find((u) => u.nickname === nickname)?.themeColor ??
        'var(--accent-color)';
      return { nickname, themeColor, familiarity: fam as number };
    });
  }, [selectedSong, self, selectedUsers]);

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
            {/* 自己 — 登入時固定顯示；checkbox 切換是否加入比對 */}
            {self && (
              <label
                data-testid="include-self-toggle"
                style={{
                  marginBottom: '14px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-base)',
                  borderLeft: `4px solid ${self.themeColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  opacity: includeSelf ? 1 : 0.55,
                  transition: 'opacity 0.15s ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={includeSelf}
                  onChange={(e) => setIncludeSelf(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: self.themeColor,
                  }}
                />
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  把我自己 (<strong>{self.nickname}</strong>) 加入比對
                  <span
                    className="self-toggle-hint"
                    style={{ color: 'var(--text-muted)', fontSize: '12px' }}
                  >
                    {includeSelf ? '（會跟下面這些人比）' : '（已取消 — 只看其他人）'}
                  </span>
                </span>
              </label>
            )}

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                }}
              >
                {self ? '選擇要跟你比對的使用者' : '選擇要比對的使用者'}
              </label>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowUserPicker(true)}
                data-testid="open-user-picker"
                style={{ width: '100%', padding: '10px', fontSize: '13px' }}
              >
                ＋ 選擇使用者 {selectedUsers.length > 0 ? `(已選 ${selectedUsers.length} 人)` : ''}
              </button>
            </div>

            {/* 已選的「其他」使用者 chip — 自己不在這裡 */}
            {selectedUsers.length > 0 && (
              <div
                style={{
                  marginBottom: '16px',
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                {selectedUsers.map((u) => (
                  <div
                    key={u.shareCode}
                    style={{
                      background: 'var(--bg-base)',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: `1px solid ${u.themeColor}50`,
                    }}
                  >
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: u.themeColor,
                      }}
                    />
                    {u.nickname}
                    <button
                      type="button"
                      style={{
                        cursor: 'pointer',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                      }}
                      onClick={() =>
                        setSelectedUsers(
                          selectedUsers.filter((x) => x.shareCode !== u.shareCode),
                        )
                      }
                      aria-label={`移除 ${u.nickname}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '16px' }}>
                {error}
              </div>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading || catalogLoading}>
              {catalogLoading ? '正在載入歌曲目錄...' : loading ? '正在合併歌單...' : '合併歌單'}
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
                          ? { borderColor: color, color, backgroundColor: `${color}2a`, boxShadow: `inset 0 0 0 1px ${color}` }
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
                          ? { borderColor: color, color, backgroundColor: `${color}2a`, boxShadow: `inset 0 0 0 1px ${color}` }
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

            {/* 排序切換 — 預設依分數排序,可關掉回到 union 原始順序 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                margin: '8px 0 16px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
              }}
            >
              <label
                data-testid="sort-by-score-toggle"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                title="會唱=4 / 常聽=3 / 聽過=2 / 模糊=1,所有人加總;若選了「依使用者」chip,只計算被選到的人"
              >
                <input
                  type="checkbox"
                  checked={sortByScore}
                  onChange={(e) => setSortByScore(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>依會唱程度排序</span>
              </label>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                會唱=4 / 常聽=3 / 聽過=2 / 模糊=1 加總
              </span>
            </div>

            <section className="songs-grid">
              {filteredSongs.length === 0 ? (
                <div className="card-el" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  {result.songs.length === 0
                    ? '所選使用者目前都沒有標記過任何歌曲。'
                    : '沒有符合「依使用者 / 依熟悉度 / 依品牌」條件的歌曲，調整 chip 試試。'}
                </div>
              ) : (
                <Virtuoso
                  useWindowScroll
                  data={filteredSongs}
                  itemContent={(index, song) => {
                    const brandClean = song.brand.replace('music_', '').toUpperCase();

                    return (
                      <div key={song.id} className="song-card" style={{ gap: '20px', cursor: 'pointer', marginBottom: '16px' }} onClick={() => setSelectedSong(song)}>
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
                  }}
                />
              )}

            </section>
          </div>
        )}
      </main>

      {/* 使用者多選 modal */}
      <UserPickerModal
        open={showUserPicker}
        onClose={() => setShowUserPicker(false)}
        selectedShareCodes={selectedUsers.map((u) => u.shareCode)}
        selfShareCode={self?.shareCode}
        onConfirm={(picks) => setSelectedUsers(picks)}
      />

      {/* 歌曲詳細 + 試聽 modal — collab 場景把「公開使用者」區塊 override 成比對中的人 */}
      <SongDetailModal
        song={selectedSong}
        onClose={() => setSelectedSong(null)}
        participants={modalParticipants}
        participantsTitle="當前比對的使用者"
      />
    </div>
  );
}
