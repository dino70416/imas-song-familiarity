'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

interface Song {
  id: string;
  slug: string;
  title: string;
  brand: string;
  musicType: string;
  lyrics: string | null;
  composer: string | null;
  arranger: string | null;
  members: Array<{ name: string; cvName: string | null }>;
}

export default function SongFamiliarityHub() {
  const { data: session, status } = useSession();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  // 篩選與搜尋狀態
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('music_ml'); // 預設選擇第一項 (Million Live)
  const [selectedType, setSelectedType] = useState('all');

  // 熟悉度狀態對照表 (songId -> familiarity)
  const [selections, setSelections] = useState<Record<string, number>>({});
  // 未儲存變更隊列 (songId -> familiarity)
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, number>>({});

  // 燈箱控制
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  // 計時器參照
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. 載入歌曲清單與初始化選取狀態
  useEffect(() => {
    async function loadSongs() {
      try {
        const res = await fetch('/api/songs');
        const data = await res.json();
        if (Array.isArray(data)) {
          setSongs(data);
        }
      } catch (e) {
        console.error('無法載入歌曲:', e);
      } finally {
        setLoading(false);
      }
    }
    loadSongs();
  }, []);

  // 2. 當登入狀態改變時，載入雲端或本機儲存空間
  useEffect(() => {
    if (status === 'authenticated') {
      // 已登入：自 API 載入雲端資料
      fetch('/api/selections')
        .then((res) => res.json())
        .then((cloudSelections) => {
          // 合併本機尚未同步的變更 (若有)
          const localStored = localStorage.getItem('guest_selections');
          const localData = localStored ? JSON.parse(localStored) : {};
          
          const merged = { ...cloudSelections, ...localData };
          setSelections(merged);

          // 若本機有未同步資料，將其推入未儲存佇列，等候下次同步
          if (Object.keys(localData).length > 0) {
            setUnsavedChanges(localData);
            // 清空暫存
            localStorage.removeItem('guest_selections');
          }
        })
        .catch((err) => console.error('載入雲端資料失敗:', err));
    } else if (status === 'unauthenticated') {
      // 未登入：自 LocalStorage 載入
      const localStored = localStorage.getItem('guest_selections');
      if (localStored) {
        setSelections(JSON.parse(localStored));
      } else {
        setSelections({});
      }
    }
  }, [status]);

  // 3. 自動儲存機制：每 60 秒檢查一次是否有未儲存的變更
  useEffect(() => {
    autoSaveIntervalRef.current = setInterval(() => {
      triggerSave(true);
    }, 60000); // 60 秒

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [unsavedChanges, selections, status]);

  // 4. 執行儲存變更 (雙軌機制)
  async function triggerSave(isAuto = false) {
    const keys = Object.keys(unsavedChanges);
    if (keys.length === 0) return;

    if (status === 'authenticated') {
      // 登入狀態：推送到伺服器資料庫
      try {
        const payload = keys.map((songId) => ({
          songId,
          familiarity: unsavedChanges[songId],
        }));

        const res = await fetch('/api/selections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          setUnsavedChanges({});
          console.log(isAuto ? '背景自動儲存成功！' : '手動儲存成功！');
        } else {
          console.error('儲存失敗');
        }
      } catch (err) {
        console.error('儲存時發生錯誤:', err);
      }
    } else {
      // 訪客狀態：直接寫入 LocalStorage
      const updatedSelections = { ...selections };
      
      // 更新暫存
      localStorage.setItem('guest_selections', JSON.stringify(updatedSelections));
      setUnsavedChanges({});
      console.log(isAuto ? '背景自動暫存至本機成功！' : '手動暫存至本機成功！');
    }
  }

  // 5. 點選熟悉度更新
  function handleSelect(songId: string, familiarity: number) {
    setSelections((prev) => {
      const updated = { ...prev };
      if (familiarity === 0) {
        delete updated[songId]; // 0 代表不記得，不儲存於資料庫以節省空間
      } else {
        updated[songId] = familiarity;
      }
      return updated;
    });

    setUnsavedChanges((prev) => ({
      ...prev,
      [songId]: familiarity,
    }));
  }

  // 6. 登入與註冊處理
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    const res = await signIn('credentials', {
      redirect: false,
      username: usernameInput,
      password: passwordInput,
    });

    if (res?.error) {
      setAuthError(res.error);
    } else {
      setShowLoginModal(false);
      setUsernameInput('');
      setPasswordInput('');
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || '註冊失敗。');
      } else {
        setAuthMessage('註冊成功！正在自動登入...');
        // 自動登入
        await signIn('credentials', {
          redirect: false,
          username: usernameInput,
          password: passwordInput,
        });
        setTimeout(() => {
          setShowRegisterModal(false);
          setUsernameInput('');
          setPasswordInput('');
          setAuthMessage('');
        }, 1500);
      }
    } catch (err) {
      setAuthError('網路異常，請稍後再試。');
    }
  }

  // 7. 過濾歌曲清單 (效能高度最佳化)
  const filteredSongs = songs.filter((song) => {
    // Brand 篩選 (不為 all 時強制符合)
    if (selectedBrand !== 'all' && song.brand !== selectedBrand) {
      return false;
    }

    // MusicType 篩選
    if (selectedType !== 'all') {
      // 包含判定
      const typeStr = song.musicType.toLowerCase();
      if (!typeStr.includes(selectedType)) return false;
    }

    // 關鍵字搜尋：歌名、成員、聲優名
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      const matchTitle = song.title.toLowerCase().includes(query);
      const matchMember = song.members.some(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          (m.cvName && m.cvName.toLowerCase().includes(query))
      );
      if (!matchTitle && !matchMember) return false;
    }

    return true;
  });

  return (
    <>
      <header>
        <div className="container header-content">
          <h1>IMAS Song Familiarity Hub</h1>
          <div className="auth-nav">
            {status === 'authenticated' && session?.user ? (
              <>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Hi, <strong>{session.user.username}</strong>
                </span>
                <a href={`/playlist/${session.user.username}`} target="_blank" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  我的公開歌單
                </a>
                <a href="/collab" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  共同歌單
                </a>
                <button onClick={() => signOut()} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  登出
                </button>
              </>
            ) : (
              <>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  訪客模式 (儲存於本機)
                </span>
                <button onClick={() => { setShowLoginModal(true); setAuthError(''); }} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  登入
                </button>
                <button onClick={() => { setShowRegisterModal(true); setAuthError(''); }} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  註冊
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container" style={{ flex: 1, paddingTop: '20px' }}>
        {/* 搜尋與篩選大廳面版 */}
        <section className="filter-panel">
          <div>
            <input
              type="text"
              className="form-input"
              placeholder="搜尋歌名、參與成員、聲優姓名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div>
            <select
              className="form-input"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="music_ml">Million Live (ML)</option>
              <option value="music_cg">Cinderella Girls (CG)</option>
              <option value="music_shiny">Shiny Colors (Shiny)</option>
              <option value="music_765">765 Pro (AS)</option>
              <option value="music_sidem">SideM</option>
              <option value="music_gakuen">Gakuen Idolmaster (Gakuen)</option>
              <option value="all">所有分類 (ALL)</option>
            </select>
          </div>
          <div>
            <select
              className="form-input"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="all">所有歌曲類型</option>
              <option value="solo">Solo (單人獨唱)</option>
              <option value="unit">Unit (組合/合唱)</option>
            </select>
          </div>
        </section>

        {/* 歌曲評估清單 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            正在載入 IMAS 歌曲庫，請稍候...
          </div>
        ) : (
          <section className="songs-grid">
            <div style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              顯示 {filteredSongs.length} 首歌曲
            </div>
            
            {filteredSongs.map((song) => {
              const currentFamiliarity = selections[song.id] || 0;
              
              // 取得 Brand 文字簡寫
              const brandClean = song.brand.replace('music_', '').toUpperCase();

              return (
                <div key={song.id} className="song-card">
                  <div className="song-info">
                    <div className="song-title-row">
                      <span className="song-title">{song.title}</span>
                      <span className="song-badge badge-brand">{brandClean}</span>
                      {song.musicType.includes('solo') && (
                        <span className="song-badge badge-type">SOLO</span>
                      )}
                      {song.musicType.includes('unit') && (
                        <span className="song-badge badge-type">UNIT</span>
                      )}
                    </div>
                    <div className="song-meta">
                      {song.lyrics && <span>作詞: {song.lyrics} </span>}
                      {song.composer && <span>/ 作曲: {song.composer} </span>}
                      {song.arranger && <span>/ 編曲: {song.arranger}</span>}
                    </div>
                    {song.members.length > 0 && (
                      <div className="song-members">
                        演唱成員: {song.members.map((m) => `${m.name}${m.cvName ? ` (${m.cvName})` : ''}`).join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="familiarity-options">
                    <button
                      onClick={() => handleSelect(song.id, 1)}
                      className={`familiarity-btn state-1 ${currentFamiliarity === 1 ? 'active' : ''}`}
                    >
                      會唱
                    </button>
                    <button
                      onClick={() => handleSelect(song.id, 2)}
                      className={`familiarity-btn state-2 ${currentFamiliarity === 2 ? 'active' : ''}`}
                    >
                      常聽
                    </button>
                    <button
                      onClick={() => handleSelect(song.id, 3)}
                      className={`familiarity-btn state-3 ${currentFamiliarity === 3 ? 'active' : ''}`}
                    >
                      有聽過
                    </button>
                    <button
                      onClick={() => handleSelect(song.id, 4)}
                      className={`familiarity-btn state-4 ${currentFamiliarity === 4 ? 'active' : ''}`}
                    >
                      不太記得
                    </button>
                    <button
                      onClick={() => handleSelect(song.id, 0)}
                      className={`familiarity-btn state-0 ${currentFamiliarity === 0 ? 'active' : ''}`}
                    >
                      不記得
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>

      {/* 右下角懸浮儲存按鈕 */}
      {Object.keys(unsavedChanges).length > 0 && (
        <button className="floating-save-btn" onClick={() => triggerSave(false)}>
          儲存變更
          <span className="badge">{Object.keys(unsavedChanges).length}</span>
        </button>
      )}

      {/* 登入彈出視窗 */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>使用者登入</h2>
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>帳號 (Username)</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>密碼 (Password)</label>
                <input
                  type="password"
                  className="form-input"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
              </div>
              {authError && (
                <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px' }}>
                  {authError}
                </div>
              )}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowLoginModal(false)} className="btn btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  登入
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 註冊彈出視窗 */}
      {showRegisterModal && (
        <div className="modal-overlay" onClick={() => setShowRegisterModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>註冊帳號</h2>
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label>帳號 (Username)</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  minLength={3}
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>密碼 (Password)</label>
                <input
                  type="password"
                  className="form-input"
                  required
                  minLength={6}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
              </div>
              {authError && (
                <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px' }}>
                  {authError}
                </div>
              )}
              {authMessage && (
                <div style={{ color: '#10b981', fontSize: '13px', marginTop: '8px' }}>
                  {authMessage}
                </div>
              )}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowRegisterModal(false)} className="btn btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  註冊
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
