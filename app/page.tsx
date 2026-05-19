'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import MemberToggle from '@/components/MemberToggle';
import { buildThemeVars, getBrandColor, getBrandDisplayName, getAccentTextColor } from '@/lib/themeUtils';
import { BrandIcon } from '@/components/BrandIcon';

interface Song {
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
}

const pitchHierarchy = [
  { jp: "hihiG♯", en: "G#6", order: 60 },
  { jp: "hihiG", en: "G6", order: 59 },
  { jp: "hihiF♯", en: "F#6", order: 58 },
  { jp: "hihiF", en: "F6", order: 57 },
  { jp: "hihiE", en: "E6", order: 56 },
  { jp: "hihiD♯", en: "D#6", order: 55 },
  { jp: "hihiD", en: "D6", order: 54 },
  { jp: "hihiC♯", en: "C#6", order: 53 },
  { jp: "hihiC", en: "C6", order: 52 },
  { jp: "hihiB", en: "B5", order: 51 },
  { jp: "hihiA♯", en: "A#5", order: 50 },
  { jp: "hihiA", en: "A5", order: 49 },
  { jp: "hiG♯", en: "G#5", order: 48 },
  { jp: "hiG", en: "G5", order: 47 },
  { jp: "hiF♯", en: "F#5", order: 46 },
  { jp: "hiF", en: "F5", order: 45 },
  { jp: "hiE", en: "E5", order: 44 },
  { jp: "hiD♯", en: "D#5", order: 43 },
  { jp: "hiD", en: "D5", order: 42 },
  { jp: "hiC♯", en: "C#5", order: 41 },
  { jp: "hiC", en: "C5", order: 40 },
  { jp: "hiB", en: "B4", order: 39 },
  { jp: "hiA♯", en: "A#4", order: 38 },
  { jp: "hiA", en: "A4", order: 37 },
  { jp: "mid2G♯", en: "G#4", order: 36 },
  { jp: "mid2G", en: "G4", order: 35 },
  { jp: "mid2F♯", en: "F#4", order: 34 },
  { jp: "mid2F", en: "F4", order: 33 },
  { jp: "mid2E", en: "E4", order: 32 },
  { jp: "mid2D♯", en: "D#4", order: 31 },
  { jp: "mid2D", en: "D4", order: 30 },
  { jp: "mid2C♯", en: "C#4", order: 29 },
  { jp: "mid2C", en: "C4", order: 28 },
  { jp: "mid2B", en: "B3", order: 27 },
  { jp: "mid2A♯", en: "A#3", order: 26 },
  { jp: "mid2A", en: "A3", order: 25 },
  { jp: "mid1G♯", en: "G#3", order: 24 },
  { jp: "mid1G", en: "G3", order: 23 },
  { jp: "mid1F♯", en: "F#3", order: 22 },
  { jp: "mid1F", en: "F3", order: 21 },
  { jp: "mid1E", en: "E3", order: 20 },
  { jp: "mid1D♯", en: "D#3", order: 19 },
  { jp: "mid1D", en: "D3", order: 18 },
  { jp: "mid1C♯", en: "C#3", order: 17 },
  { jp: "mid1C", en: "C3", order: 16 },
  { jp: "mid1B", en: "B2", order: 15 },
  { jp: "mid1A♯", en: "A#2", order: 14 },
  { jp: "mid1A", en: "A2", order: 13 },
  { jp: "lowG♯", en: "G#2", order: 12 },
  { jp: "lowG", en: "G2", order: 11 },
  { jp: "lowF♯", en: "F#2", order: 10 },
  { jp: "lowF", en: "F2", order: 9 },
  { jp: "lowE", en: "E2", order: 8 },
  { jp: "lowD♯", en: "D#2", order: 7 },
  { jp: "lowD", en: "D2", order: 6 },
  { jp: "lowC♯", en: "C#2", order: 5 },
  { jp: "lowC", en: "C2", order: 4 },
  { jp: "lowB", en: "B1", order: 3 },
  { jp: "lowA♯", en: "A#1", order: 2 },
  { jp: "lowA", en: "A1", order: 1 }
];

export default function SongFamiliarityHub() {
  const { data: session, status, update } = useSession();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  // 篩選與搜尋狀態
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('music_ml'); // 預設選擇第一項 (Million Live)
  const [selectedType, setSelectedType] = useState('all');
  const [showPitchModal, setShowPitchModal] = useState(false);

  // 熟悉度狀態對照表 (songId -> familiarity)
  const [selections, setSelections] = useState<Record<string, number>>({});
  // 未儲存變更隊列 (songId -> familiarity)
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, number>>({});



  // 燈箱控制
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // 表單輸入狀態
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [themeColorInput, setThemeColorInput] = useState('#92cfbb');
  const [isPublicInput, setIsPublicInput] = useState(false);
  const [idolColors, setIdolColors] = useState<Array<{name: string, color: string}>>([]);
  const [colorSearchQuery, setColorSearchQuery] = useState('');
  const [showColorSuggestions, setShowColorSuggestions] = useState(false);

  useEffect(() => {
    fetch('/api/colors')
      .then(res => res.json())
      .then(data => setIdolColors(data))
      .catch(() => {});
  }, []);

  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');

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
        body: JSON.stringify({ username: usernameInput, password: passwordInput, nickname: nicknameInput }),
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
          setNicknameInput('');
          setAuthMessage('');
        }, 1500);
      }
    } catch (err) {
      setAuthError('網路異常，請稍後再試。');
    }
  }

  // 7. 使用者個人設定儲存
  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError('');
    setSettingsSuccess('');

    try {
      const res = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nicknameInput, themeColor: themeColorInput, isPublic: isPublicInput }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSettingsError(data.error || '儲存設定失敗。');
      } else {
        setSettingsSuccess('個人設定儲存成功！');
        // 更新 NextAuth 用戶端 Session
        await update({
          nickname: nicknameInput,
          themeColor: themeColorInput,
          isPublic: isPublicInput,
        });
        setTimeout(() => {
          setShowSettingsModal(false);
          setSettingsSuccess('');
        }, 1000);
      }
    } catch (err) {
      setSettingsError('更新個人設定時發生錯誤。');
    }
  }

  // 初始化設定表單
  function openSettings() {
    if (session?.user) {
      setNicknameInput(session.user.nickname || session.user.username);
      setThemeColorInput(session.user.themeColor || '#92cfbb');
      setIsPublicInput(session.user.isPublic || false);
      setColorSearchQuery('');
      setSettingsError('');
      setSettingsSuccess('');
      setShowSettingsModal(true);
    }
  }

  // 8. 過濾歌曲清單 (效能高度最佳化)
  const filteredSongs = songs.filter((song) => {
    // Brand 篩選 (不為 all 時強制符合)
    if (selectedBrand !== 'all' && song.brand !== selectedBrand) {
      return false;
    }

    // MusicType 篩選
    if (selectedType !== 'all') {
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

  // 動態設定主題色（含所有衍生色）
  const currentThemeColor = session?.user?.themeColor || '#92cfbb';

  return (
    <div style={{
      ...(buildThemeVars(currentThemeColor) as any),
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
    }}>
      <header>
        <div className="container header-content">
          <h1>IMAS Song Familiarity Hub</h1>
          <div className="auth-nav">
            <button onClick={() => setShowPitchModal(true)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
              音域對照表
            </button>
            {status === 'authenticated' && session?.user ? (
              <>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Hi, <strong>{session.user.nickname || session.user.username}</strong>
                </span>
                <button onClick={openSettings} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  個人設定
                </button>
                <a href={`/playlist/${session.user.shareCode}`} target="_blank" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  公開歌單
                </a>
                <a href="/collab" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  共同歌單
                </a>
                <button onClick={() => signOut({ callbackUrl: window.location.origin })} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }}>
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
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'absolute', left: '12px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <BrandIcon brand={selectedBrand} className="brand-select-icon" />
            </div>
            <select
              className="form-input"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              style={{ cursor: 'pointer', paddingLeft: '38px' }}
            >
              <option value="music_ml">{getBrandDisplayName('music_ml')}</option>
              <option value="music_cg">{getBrandDisplayName('music_cg')}</option>
              <option value="music_shiny">{getBrandDisplayName('music_shiny')}</option>
              <option value="music_as">{getBrandDisplayName('music_as')}</option>
              <option value="music_876">{getBrandDisplayName('music_876')}</option>
              <option value="music_sidem">{getBrandDisplayName('music_sidem')}</option>
              <option value="music_gakuen">{getBrandDisplayName('music_gakuen')}</option>
              <option value="music_godo">{getBrandDisplayName('music_godo')}</option>
              <option value="music_cover">{getBrandDisplayName('music_cover')}</option>
              <option value="music_remix">{getBrandDisplayName('music_remix')}</option>
              <option value="all">{getBrandDisplayName('all')}</option>
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

        {/* 熟悉度定義說明 */}
        <div className="familiarity-definitions-card">
          <h3 className="definitions-title">💡 熟悉度定義說明</h3>
          <div className="definitions-grid">
            <div className="def-item"><span className="def-badge state-1">會唱</span>有詞的狀況下可以一起唱</div>
            <div className="def-item"><span className="def-badge state-2">常聽</span>熟悉到會唱，但有些地方會 miss，或者常常聽但沒有想唱</div>
            <div className="def-item"><span className="def-badge state-3">有聽過</span>看到歌名或聽到前奏能想得起一點旋律 & 可以哼</div>
            <div className="def-item"><span className="def-badge state-4">不太記得</span>確定有聽過，但不記得內容</div>
            <div className="def-item"><span className="def-badge state-0">不記得</span>連歌名都不記得，或者確定沒聽過</div>
          </div>
        </div>

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
              const brandClean = song.brand.replace('music_', '').toUpperCase();

              return (
                <div key={song.id} className="song-card">
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
                <label>暱稱 (Nickname)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="留空將使用帳號"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
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

      {/* 個人設定彈出視窗 */}
      {showSettingsModal && session?.user && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>個人設定</h2>
            <form onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label>使用者暱稱</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>自訂主題顏色</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="color"
                    className="form-input"
                    style={{ width: '60px', height: '40px', padding: '2px', cursor: 'pointer', flexShrink: 0 }}
                    value={themeColorInput}
                    onChange={(e) => setThemeColorInput(e.target.value)}
                  />
                  <input
                    type="text"
                    className="form-input"
                    value={themeColorInput}
                    onChange={(e) => setThemeColorInput(e.target.value)}
                    placeholder="#92cfbb"
                    pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                    required
                    style={{ width: '100px', flexShrink: 0 }}
                  />
                  <div style={{ position: 'relative', flexGrow: 1 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="或搜尋擔當偶像 (如: 天海春香)..."
                      value={colorSearchQuery}
                      onChange={(e) => {
                        setColorSearchQuery(e.target.value);
                        setShowColorSuggestions(true);
                      }}
                      onFocus={() => setShowColorSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowColorSuggestions(false), 200)}
                    />
                    {showColorSuggestions && colorSearchQuery && (
                      <div className="autocomplete-dropdown">
                        {idolColors
                          .filter(c => c.name.toLowerCase().includes(colorSearchQuery.toLowerCase()))
                          .slice(0, 8)
                          .map(c => (
                            <div 
                              key={c.name} 
                              className="autocomplete-item"
                              onClick={() => {
                                setThemeColorInput(c.color);
                                setColorSearchQuery(c.name);
                                setShowColorSuggestions(false);
                              }}
                            >
                              <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: c.color, marginRight: '8px', borderRadius: '50%' }}></span>
                              {c.name} ({c.color})
                            </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={isPublicInput}
                    onChange={(e) => setIsPublicInput(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span>公開我的歌單（允許其他人在歌曲統計中看到我）</span>
                </label>
              </div>
              <div className="form-group">
                <label>個人公開歌單連結 (識別碼已雜湊保護)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/playlist/${session.user.shareCode}`}
                    style={{ background: 'var(--bg-base)', color: 'var(--text-muted)' }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={() => {
                      const url = `${window.location.origin}/playlist/${session.user.shareCode}`;
                      navigator.clipboard.writeText(url);
                      alert('已複製歌單網址至剪貼簿！');
                    }}
                  >
                    複製
                  </button>
                </div>
              </div>
              {settingsError && (
                <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px' }}>
                  {settingsError}
                </div>
              )}
              {settingsSuccess && (
                <div style={{ color: '#10b981', fontSize: '13px', marginTop: '8px' }}>
                  {settingsSuccess}
                </div>
              )}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowSettingsModal(false)} className="btn btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  儲存設定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 音域對照表彈出視窗 */}
      {showPitchModal && (
        <div className="modal-overlay" onClick={() => setShowPitchModal(false)}>
          <div className="modal-content pitch-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>音域對照表 (由高至低)</h2>
              <button 
                onClick={() => setShowPitchModal(false)} 
                className="btn btn-secondary" 
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                關閉
              </button>
            </div>
            <div className="pitch-table-container">
              <table className="pitch-table">
                <thead>
                  <tr>
                    <th>日文音名</th>
                    <th>科學音名</th>
                    <th>音高順序</th>
                  </tr>
                </thead>
                <tbody>
                  {pitchHierarchy.map((p) => (
                    <tr key={p.jp}>
                      <td style={{ fontWeight: '500' }}>{p.jp}</td>
                      <td>{p.en}</td>
                      <td style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{p.order}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
