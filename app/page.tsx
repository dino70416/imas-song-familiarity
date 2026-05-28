'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import MemberToggle from '@/components/MemberToggle';
// MultiSelect / MultiSelectOption 已被 BrandPicker / IdolPickerModal / UnitPickerModal / TypePicker 取代
import BrandPicker from '@/components/BrandPicker';
import IdolPickerModal from '@/components/IdolPickerModal';
import UnitPickerModal from '@/components/UnitPickerModal';
import TypePicker from '@/components/TypePicker';
import { buildThemeVars, getBrandColor, getBrandDisplayName, getAccentTextColor } from '@/lib/themeUtils';
import { BrandIcon } from '@/components/BrandIcon';
import { BRAND_VALUES } from '@/lib/brandMap';
import { useBrandFilter } from '@/lib/useBrandFilter';
import { filterSongs } from '@/lib/filterSongs';
import BackToTop from '@/components/BackToTop';
import SongDetailModal from '@/components/SongDetailModal';

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
  youtubeIds: string | null;
  members: Array<{ id?: string; name: string; cvName: string | null }>;
  units?: Array<{ id: string; name: string }>;
}

interface Idol {
  id: string;
  taxId: number | null;
  name: string;
  kana: string | null;
  cvName: string | null;
  production: string | null;
}

interface Unit {
  id: string;
  taxId: number | null;
  name: string;
  kana: string | null;
  production: string | null;
  memberIds: string[];
  memberCount: number;
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

  // 篩選與搜尋狀態 — 全部支援多選 + OR 語意；預設皆空（=顯示全部）
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedIdols, setSelectedIdols] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  // 下排：依「我自己標的熟悉度」過濾。值為 0|1|2|3|4(OR)；空陣列 = 不限。
  // 「未評」永遠顯示(這個頁面當「待評清單」用);showRated 控制是否也顯示已填
  // 預設 showRated=false → 評過的歌就消失,清單只剩待評
  const [selectedFamiliarities, setSelectedFamiliarities] = useState<number[]>([]);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showRated, setShowRated] = useState(false);
  // 使用者在 showRated=false 時點 chip → 跳提示 + checkbox 閃爍引導視線
  // 兩個 state 都會在 timer 過後自動清掉,讓 UI 自然 fade 回去
  const [showChipHint, setShowChipHint] = useState(false);
  const [flashShowRated, setFlashShowRated] = useState(false);
  // 用 ref 抓住 timer id,元件卸載時清掉,避免 setState on unmounted
  const hintTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    };
  }, []);
  const [showPitchModal, setShowPitchModal] = useState(false);
  // 熟悉度定義說明卡 — 手機預設收起，桌面預設展開
  const [defsOpen, setDefsOpen] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function') return; // jsdom safety
    if (window.matchMedia('(max-width: 600px)').matches) setDefsOpen(false);
  }, []);

  // 偶像 / 組合 全列表（一次載入後 client-side 過濾）
  const [allIdols, setAllIdols] = useState<Idol[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);

  // 熟悉度狀態對照表 (songId -> familiarity)
  const [selections, setSelections] = useState<Record<string, number>>({});
  // 未儲存變更隊列 (songId -> familiarity)
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, number>>({});
  // 自動儲存狀態 — 給使用者看的視覺回饋
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // 載入失敗時的 inline 提示
  const [loadError, setLoadError] = useState<string | null>(null);



  // 燈箱控制
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  // 歌曲詳細彈窗
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  // 表單輸入狀態
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [themeColorInput, setThemeColorInput] = useState('#92cfbb');
  const [isPublicInput, setIsPublicInput] = useState(false);
  const [isPublicPitchRangeInput, setIsPublicPitchRangeInput] = useState(false);
  const [idolColors, setIdolColors] = useState<Array<{ name: string, color: string }>>([]);
  const [colorSearchQuery, setColorSearchQuery] = useState('');
  const [showColorSuggestions, setShowColorSuggestions] = useState(false);

  useEffect(() => {
    fetch('/api/colors')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setIdolColors(data); })
      .catch(() => { });
  }, []);

  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');

  // 1. 載入歌曲清單與初始化選取狀態
  useEffect(() => {
    async function loadSongs() {
      try {
        // 加 schema 版本當 cache-bust，避免瀏覽器拿到舊版（沒 units / 沒 member.id）的快取
        const res = await fetch('/api/songs?schema=v2', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setSongs(data);
        } else {
          throw new Error('回應格式錯誤');
        }
      } catch (e) {
        console.error('無法載入歌曲:', e);
        setLoadError('歌曲資料載入失敗，請重新整理。');
      } finally {
        setLoading(false);
      }
    }
    loadSongs();
  }, []);

  // 1b. 載入偶像 + 組合列表（給下拉選單用，受品牌篩選）
  // 失敗的話除了 console.error 還要把錯誤訊息存進 loadError 給 UI 顯示，
  // 避免使用者看到「偶像 (0)」這種令人困惑的下拉
  useEffect(() => {
    fetch('/api/idols')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setAllIdols(data);
        else throw new Error('回應格式錯誤');
      })
      .catch((e) => {
        console.error('無法載入偶像列表:', e);
        setLoadError('偶像 / 組合篩選資料載入失敗，請重新整理。');
      });
    fetch('/api/units')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setAllUnits(data);
        else throw new Error('回應格式錯誤');
      })
      .catch((e) => {
        console.error('無法載入組合列表:', e);
        setLoadError('偶像 / 組合篩選資料載入失敗，請重新整理。');
      });
  }, []);

  // 共用 hook：算 allowedProductions + 過濾偶像/組合 + 切換 brand 連帶清掉非法選取
  const { filteredIdols, filteredUnits, handleBrandsChange } = useBrandFilter({
    selectedBrands,
    allIdols,
    allUnits,
    setSelectedBrands,
    setSelectedIdols,
    setSelectedUnits,
  });

  // brand / idol / unit options 已分別由 BrandPicker / IdolPickerModal / UnitPickerModal 內部處理

  // 歌曲類型靜態 2 選項給 TypePicker 用
  const typeOptions = useMemo(
    () => [
      { id: 'solo', label: 'Solo', hint: '單人獨唱' },
      { id: 'unit', label: 'Unit', hint: '組合 / 合唱' },
    ],
    [],
  );

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

  // 3. 自動儲存：每次有未儲存變更後 500ms 觸發；快速連點會被 debounce 合併
  useEffect(() => {
    if (Object.keys(unsavedChanges).length === 0) return;
    const t = setTimeout(() => {
      triggerSave(true);
    }, 500);
    return () => clearTimeout(t);
  }, [unsavedChanges, selections, status]);

  // 4. 執行儲存變更 (雙軌機制) — 同步更新 saveState 給 UI 顯示
  async function triggerSave(isAuto = false) {
    const keys = Object.keys(unsavedChanges);
    if (keys.length === 0) return;

    setSaveState('saving');

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
          setSaveState('saved');
          setTimeout(() => setSaveState('idle'), 1500);
          console.log(isAuto ? '背景自動儲存成功！' : '手動儲存成功！');
        } else {
          setSaveState('idle');
          console.error('儲存失敗');
        }
      } catch (err) {
        setSaveState('idle');
        console.error('儲存時發生錯誤:', err);
      }
    } else {
      // 訪客狀態：直接寫入 LocalStorage
      const updatedSelections = { ...selections };
      localStorage.setItem('guest_selections', JSON.stringify(updatedSelections));
      setUnsavedChanges({});
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
      console.log(isAuto ? '背景自動暫存至本機成功！' : '手動暫存至本機成功！');
    }
  }

  // beforeunload：未儲存變更時跳離開警告 (保險，防 debounce 500ms 內離開)
  useEffect(() => {
    if (Object.keys(unsavedChanges).length === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 現代瀏覽器忽略 returnValue 內文，只看是否有值就跳預設文案
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unsavedChanges]);

  // 5. 點選熟悉度更新
  function handleSelect(songId: string, familiarity: number) {
    // 0 也是合法狀態(「不記得」explicit),要存進 DB
    // 真正的「未評」只能透過從來沒按過按鈕來達成(沒有 DB row)
    setSelections((prev) => ({ ...prev, [songId]: familiarity }));
    setUnsavedChanges((prev) => ({ ...prev, [songId]: familiarity }));
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
        body: JSON.stringify({
          nickname: nicknameInput,
          themeColor: themeColorInput,
          isPublic: isPublicInput,
          isPublicPitchRange: isPublicPitchRangeInput,
        }),
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
          isPublicPitchRange: isPublicPitchRangeInput,
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
      setIsPublicPitchRangeInput(session.user.isPublicPitchRange || false);
      setColorSearchQuery('');
      setSettingsError('');
      setSettingsSuccess('');
      setShowSettingsModal(true);
    }
  }

  // 8. 過濾歌曲清單
  //
  // 設計原則：
  // - 每個 filter 內部 = OR（任一匹配就算）
  // - filter 之間 = AND（要全部 pass 才算）
  // - 任何 filter 是空陣列 = 不限制（顯示全部）
  // - 關鍵字搜尋為全域：有 query 時自動忽略 brand 篩選
  const filteredSongs = useMemo(() => {
    const upstream = filterSongs(songs, {
      searchQuery,
      selectedBrands,
      selectedTypes,
      selectedIdols,
      selectedUnits,
    });
    // 未評歌(無 row):沒選 chip 時當「待評清單」永遠顯示;一旦選了 chip 就嚴格匹配,
    //   未評不算任何熟悉度 → 隱藏(避免選「不太記得」還會跳出沒評過的歌)
    // 已填歌(0-4 row):只在 showRated=true 時顯示;若有 chip 再用 OR 過濾
    const famSet = selectedFamiliarities.length > 0 ? new Set(selectedFamiliarities) : null;
    return upstream.filter((s) => {
      const myFam = selections[s.id];
      if (myFam === undefined) return famSet === null; // 有選 chip → 未評視為 mismatch
      if (!showRated) return false; // 已填預設隱藏
      if (famSet === null) return true;
      return famSet.has(myFam);
    });
  }, [
    songs,
    searchQuery,
    selectedBrands,
    selectedTypes,
    selectedIdols,
    selectedUnits,
    selectedFamiliarities,
    selections,
    showRated,
  ]);

  // 漸進式載入：每次只渲染 PAGE_SIZE 首，滾動到底再加下一頁。
  // 切篩選時重置為第一頁，避免遺留先前的 visibleCount。
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    searchQuery,
    selectedBrands,
    selectedTypes,
    selectedIdols,
    selectedUnits,
    selectedFamiliarities,
    showRated,
  ]);

  const visibleSongs = useMemo(
    () => filteredSongs.slice(0, visibleCount),
    [filteredSongs, visibleCount],
  );

  // 哨兵：滾到 sentinel 就再撥 PAGE_SIZE 出來
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (visibleCount >= filteredSongs.length) return;
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filteredSongs.length));
        }
      },
      { rootMargin: '400px' }, // 距視口 400px 就觸發，體感較順
    );
    io.observe(node);
    return () => io.disconnect();
  }, [visibleCount, filteredSongs.length]);

  function clearAllFilters() {
    setSearchQuery('');
    setSelectedBrands([]);
    setSelectedTypes([]);
    setSelectedIdols([]);
    setSelectedUnits([]);
    setSelectedFamiliarities([]);
    setShowRated(false);
  }

  const anyFilterActive =
    searchQuery.trim() !== '' ||
    selectedBrands.length > 0 ||
    selectedTypes.length > 0 ||
    selectedIdols.length > 0 ||
    selectedUnits.length > 0 ||
    selectedFamiliarities.length > 0 ||
    showRated; // 勾「顯示已填」也算啟用篩選(預設為 false)

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
          <div className="header-title-row">
            <h1>IMAS Song Familiarity Hub</h1>
            {status === 'authenticated' && session?.user && (
              <span className="header-greeting">
                Hi, <strong>{session.user.nickname || session.user.username}</strong>
              </span>
            )}
          </div>
          <div className="auth-nav">
            <a href="/guess" className="btn" style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: '#8b5cf6', color: 'white', fontWeight: 'bold' }}>
              🎵 猜歌遊戲
            </a>
            <button onClick={() => setShowAboutModal(true)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
              關於我們
            </button>
            {status === 'authenticated' && session?.user ? (
              <>
                <button onClick={openSettings} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  個人設定
                </button>
                <a href={`/playlist/${session.user.shareCode}`} target="_blank" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  公開歌單
                </a>
                <a href="/collab" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  共同歌單
                </a>
                <a href="/pitch-adjustment" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  音域設定
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
        {/* 載入失敗 inline 提示 */}
        {loadError && (
          <div
            role="alert"
            data-testid="load-error-banner"
            style={{
              padding: '12px 16px',
              marginBottom: '12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#b91c1c',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>⚠</span>
            <span style={{ flex: 1 }}>{loadError}</span>
            <button
              type="button"
              onClick={() => location.reload()}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              重新整理
            </button>
          </div>
        )}

        {/* 搜尋與篩選 */}
        <section className="filter-panel" data-testid="filter-panel">
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              placeholder="搜尋歌名、參與成員、聲優姓名、組合名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="filter-search"
              style={{ paddingRight: searchQuery ? '36px' : undefined }}
            />
            {searchQuery && (
              <span
                role="button"
                aria-label="清除搜尋"
                onClick={() => setSearchQuery('')}
                className="multiselect-clear"
                data-testid="filter-search-clear"
              >
                ×
              </span>
            )}
          </div>
          <BrandPicker
            options={BRAND_VALUES}
            value={selectedBrands}
            onChange={handleBrandsChange}
            placeholder="所有偶像團體"
            className="ms-brand"
          />
          <IdolPickerModal
            allIdols={allIdols}
            value={selectedIdols}
            onChange={setSelectedIdols}
            selectedBrands={selectedBrands}
            placeholder={`偶像 (${filteredIdols.length})`}
            className="ms-idol"
          />
          <UnitPickerModal
            allUnits={allUnits}
            value={selectedUnits}
            onChange={setSelectedUnits}
            selectedBrands={selectedBrands}
            placeholder={`組合 (${filteredUnits.length})`}
            className="ms-unit"
          />
          <TypePicker
            options={typeOptions}
            value={selectedTypes}
            onChange={setSelectedTypes}
            placeholder="歌曲類型"
            className="ms-type"
          />
        </section>

        {/* 第二排篩選：依「我自己標的熟悉度」過濾(OR within；和上排 AND) */}
        <section
          className="familiarity-filter-panel"
          data-testid="familiarity-filter"
        >
          <span className="familiarity-filter-label">依熟悉度：</span>
          {[
            { v: 1, label: '會唱' },
            { v: 2, label: '常聽' },
            { v: 3, label: '有聽過' },
            { v: 4, label: '不太記得' },
            { v: 0, label: '不記得' },
          ].map(({ v, label }) => {
            const active = selectedFamiliarities.includes(v);
            return (
              <button
                key={v}
                type="button"
                className={`familiarity-btn state-${v} ${active ? 'active' : ''} ${!showRated ? 'is-disabled' : ''
                  }`}
                data-testid={`fam-filter-${v}`}
                aria-pressed={active}
                aria-disabled={!showRated}
                title={
                  !showRated
                    ? '勾選「顯示已填」才能依熟悉度篩選'
                    : undefined
                }
                onClick={() => {
                  if (!showRated) {
                    // 防連點:動畫播放中再點不重新觸發 — 避免:
                    //   (a) 計時器重疊:第一個 timer 提早把後一次的 hint 收掉
                    //   (b) state 從 true→true 不會 remount,CSS animation 無法 replay
                    if (showChipHint || flashShowRated) return;
                    setShowChipHint(true);
                    setFlashShowRated(true);
                    hintTimerRef.current = window.setTimeout(() => {
                      setShowChipHint(false);
                      hintTimerRef.current = null;
                    }, 2800);
                    flashTimerRef.current = window.setTimeout(() => {
                      setFlashShowRated(false);
                      flashTimerRef.current = null;
                    }, 1200);
                    return;
                  }
                  setSelectedFamiliarities((prev) =>
                    prev.includes(v)
                      ? prev.filter((x) => x !== v)
                      : [...prev, v],
                  );
                }}
              >
                {label}
              </button>
            );
          })}
          <label
            className={`familiarity-unrated-toggle ${flashShowRated ? 'is-flashing' : ''
              }`}
            data-testid="show-rated-toggle"
            title="預設只顯示未填過的歌(當待評清單用);勾起來才會看到已填的歌"
          >
            <input
              type="checkbox"
              checked={showRated}
              onChange={(e) => setShowRated(e.target.checked)}
            />
            <span>顯示已填</span>
          </label>
          {showChipHint && (
            <span
              className="familiarity-chip-hint"
              role="status"
              aria-live="polite"
              data-testid="fam-chip-hint"
            >
              ↑ 勾「顯示已填」才能依熟悉度篩選
            </span>
          )}
          {/* 清除按鈕永遠 render(disabled 時 visibility hidden)避免 flex row reflow */}
          <button
            type="button"
            className="btn btn-secondary familiarity-filter-clear"
            onClick={() => {
              setSelectedFamiliarities([]);
              setShowRated(false);
            }}
            data-testid="fam-filter-clear"
            style={{
              visibility:
                selectedFamiliarities.length > 0 || showRated
                  ? 'visible'
                  : 'hidden',
            }}
            aria-hidden={!(selectedFamiliarities.length > 0 || showRated)}
            tabIndex={selectedFamiliarities.length > 0 || showRated ? 0 : -1}
          >
            清除
          </button>
        </section>

        {/* 熟悉度定義說明 — 手機收起，可點開 */}
        <div className={`familiarity-definitions-card ${defsOpen ? 'is-open' : 'is-closed'}`}>
          <button
            type="button"
            className="definitions-title"
            aria-expanded={defsOpen}
            onClick={() => setDefsOpen((o) => !o)}
            data-testid="defs-toggle"
          >
            <span>💡 熟悉度定義說明</span>
            <span className="defs-chevron">{defsOpen ? '−' : '+'}</span>
          </button>
          {defsOpen && (
            <div className="definitions-grid">
              <div className="def-item"><span className="def-badge state-1">會唱</span>有詞的狀況下可以一起唱</div>
              <div className="def-item"><span className="def-badge state-2">常聽</span>熟悉到會唱，但有些地方會 miss，或者常常聽但沒有想唱</div>
              <div className="def-item"><span className="def-badge state-3">有聽過</span>看到歌名或聽到前奏能想得起一點旋律 & 可以哼</div>
              <div className="def-item"><span className="def-badge state-4">不太記得</span>確定有聽過，但不記得內容</div>
              <div className="def-item"><span className="def-badge state-0">不記得</span>連歌名都不記得，或者確定沒聽過</div>
            </div>
          )}
        </div>

        {/* 歌曲評估清單 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            正在載入 IMAS 歌曲庫，請稍候...
          </div>
        ) : !anyFilterActive ? (
          // 沒有任何篩選 → 顯示空狀態，不渲染 2560 張卡片
          <div
            className="empty-state-card"
            data-testid="empty-state"
            style={{
              textAlign: 'center',
              padding: '60px 24px',
              border: '1px dashed var(--border-color)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <div style={{ fontSize: '15px', marginBottom: '8px' }}>
              請先選擇至少一個篩選條件，或輸入關鍵字搜尋
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              共 {songs.length} 首歌曲。為了效能，僅在套用篩選後才顯示。
            </div>
          </div>
        ) : (
          <section className="songs-grid">
            <div
              style={{
                marginBottom: '10px',
                fontSize: '14px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span data-testid="result-count">
                顯示 {visibleSongs.length} / {filteredSongs.length} 首歌曲
              </span>
              {visibleCount < filteredSongs.length && (
                <span
                  style={{ fontSize: '12px', color: 'var(--text-muted)' }}
                  data-testid="more-hint"
                >
                  捲到底自動載入下一批
                </span>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px', marginLeft: 'auto' }}
                onClick={clearAllFilters}
                data-testid="clear-all-filters"
              >
                清除所有篩選
              </button>
            </div>

            {visibleSongs.map((song) => {
              const currentFamiliarity = selections[song.id] || 0;
              const brandClean = song.brand.replace('music_', '').toUpperCase();

              return (
                <div key={song.id} className="song-card">
                  <div className="song-info">
                    <div className="song-title-row">
                      <button
                        type="button"
                        className="song-title song-title-btn"
                        onClick={() => setSelectedSong(song)}
                        title="點擊查看詳細資料與試聽"
                      >
                        {song.title}
                      </button>
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

            {/* 滾動哨兵：可見時自動載入下一批；沒更多就退場 */}
            {visibleCount < filteredSongs.length ? (
              <div
                ref={sentinelRef}
                data-testid="load-sentinel"
                style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                }}
              >
                載入中… (還有 {filteredSongs.length - visibleCount} 首)
              </div>
            ) : filteredSongs.length > PAGE_SIZE ? (
              <div
                style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                }}
              >
                — 已顯示全部 {filteredSongs.length} 首 —
              </div>
            ) : null}
          </section>
        )}
      </main>

      {/* 儲存狀態浮動 chip — 取代舊版的「儲存變更」浮鈕，純資訊性 */}
      {saveState !== 'idle' && (
        <div
          className={`save-indicator save-indicator--${saveState}`}
          role="status"
          aria-live="polite"
          data-testid="save-indicator"
        >
          {saveState === 'saving' ? '儲存中…' : '✓ 已儲存'}
        </div>
      )}

      <BackToTop />

      {/* 歌曲詳細彈窗 */}
      <SongDetailModal
        song={selectedSong}
        onClose={() => setSelectedSong(null)}
        currentFamiliarity={selectedSong ? (selections[selectedSong.id] || 0) : 0}
        onSelectFamiliarity={(fam) => {
          if (selectedSong) handleSelect(selectedSong.id, fam);
        }}
      />

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
                <label>P名 (Nickname)</label>
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
                <label>使用者 P名</label>
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
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={isPublicInput}
                    onChange={(e) => setIsPublicInput(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span>公開我的歌單（允許其他人在歌曲統計中看到我）</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={isPublicPitchRangeInput}
                    onChange={(e) => setIsPublicPitchRangeInput(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span>公開我的音域（允許其他人在音高對照表中參考我）</span>
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

      {/* 關於我們彈出視窗 */}
      {showAboutModal && (
        <div className="modal-overlay" onClick={() => setShowAboutModal(false)} style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{
            backgroundColor: 'var(--bg-surface, #fff)',
            padding: '24px',
            borderRadius: 'var(--radius-lg, 12px)',
            maxWidth: '1000px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid var(--border-color, #e5e7eb)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>關於我們</h2>
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                關閉
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', lineHeight: '1.8', fontSize: '14px', color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  此網頁是基於{' '}
                  <a
                    href="https://docs.google.com/spreadsheets/d/1326h1mhWc88WrnRSrJCUMr3F9_3qJJ-fQzQYKseJkoo/edit?usp=sharing"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent-color)', textDecoration: 'underline', fontWeight: 500 }}
                  >
                    im@s 曲熟悉度表單
                  </a>
                  ，由幾位同好工程師改良製作的非營利系統。
                </div>
                <div>
                  旨為提供製作人們在日卡時作為自己的選曲參考，以及挑選團內盡可能多人熟悉的曲目。
                </div>
                <div style={{ fontWeight: 600 }}>
                  希望大家能唱更多im@s的歌！
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <strong>資料來源：</strong>
                <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>
                    <a
                      href="https://idolmaster-official.jp/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}
                    >
                      【公式】アイドルマスター ポータル（アイマス）
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://x.com/Mas_Kara_Card"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}
                    >
                      アイドルマスター楽曲しばりカラオケBOT
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://fujiwarahaji.me/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}
                    >
                      アイマス楽曲DB ふじわらはじめ - アイドルマスターの楽曲情報をまとめたサイト
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <strong>系統開發人員：</strong>Dino、Pararu、Azusa
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
