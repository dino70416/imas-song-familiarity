'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { buildThemeVars, getAccentTextColor, getBrandColor, getBrandShortName } from '@/lib/themeUtils';
import SongDetailModal from '@/components/SongDetailModal';

// 60 到 1 的完整音域對照表
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



// 依照歌曲推薦調整 key 的單獨卡片元件 (提供獨立點選 Option 1/2 切換與即時對照表和示意圖)
interface SongAdjustCardProps {
  song: any;
  comfortableLowest: number;
  comfortableHighest: number;
  getPitchName: (order: number | null) => string;
  getBrandColor: (brand: string) => string;
  getBrandShortName: (brand: string) => string;
  getAccentTextColor: (color: string) => string;
  setSelectedSong: (song: any) => void;
}

function SongAdjustCard({
  song,
  comfortableLowest,
  comfortableHighest,
  getPitchName,
  getBrandColor,
  getBrandShortName,
  getAccentTextColor,
  setSelectedSong
}: SongAdjustCardProps) {
  // 智慧推薦：若歌曲音域跨度大於擅長音域，優先對齊最低音 (Option 1)；否則預設對齊調 Key 較小 (變調幅度最小) 的選項
  const recommendedOption = useMemo<1 | 2>(() => {
    if (song.exceedsRange) return 1;
    const absK1 = Math.abs(song.K1);
    const absK2 = Math.abs(song.K2);
    return absK1 <= absK2 ? 1 : 2;
  }, [song.exceedsRange, song.K1, song.K2]);

  const [activeOption, setActiveOption] = useState<1 | 2>(recommendedOption);

  // 當歌曲或推薦選項改變時，自動同步更新選擇
  useEffect(() => {
    setActiveOption(recommendedOption);
  }, [recommendedOption, song.id]);

  // 取得科學音名 (例如 "C3", "G#4" 等)
  const getScientificPitchName = (order: number | null) => {
    if (order === null) return '--';
    const pitchObj = pitchHierarchy.find(p => p.order === order);
    return pitchObj ? pitchObj.en : '--';
  };

  const uLow = comfortableLowest;
  const uHigh = comfortableHighest;
  const userComfortableSpan = uHigh - uLow;

  const sLow = song.sLow;
  const sHigh = song.sHigh;

  // 目前所選變調
  const activeShift = activeOption === 1 ? song.K1 : song.K2;

  // 變調後音域
  const adjustedLowOrder = sLow + activeShift;
  const adjustedHighOrder = sHigh + activeShift;

  const isLowOut = adjustedLowOrder < uLow;
  const isHighOut = adjustedHighOrder > uHigh;

  // 示意圖裁切 (動態置中對比)
  const minOrder = Math.max(1, Math.min(sLow, adjustedLowOrder, uLow) - 2);
  const maxOrder = Math.min(60, Math.max(sHigh, adjustedHighOrder, uHigh) + 2);
  const span = maxOrder - minOrder;

  // 計算示意圖音名刻度 ticks (僅限白鍵，避免過度擁擠)
  const scaleTicks = useMemo(() => {
    const ticks = [];
    for (let i = minOrder; i <= maxOrder; i++) {
      const pitch = pitchHierarchy.find(p => p.order === i);
      if (pitch) {
        const isWhiteKey = !pitch.en.includes('#') && !pitch.en.includes('♯');
        if (isWhiteKey) {
          ticks.push({
            order: i,
            name: pitch.en,
            isMajor: pitch.en.startsWith('C') || pitch.en.startsWith('G')
          });
        }
      }
    }
    return ticks;
  }, [minOrder, maxOrder]);

  const userLeft = ((uLow - minOrder) / span) * 100;
  const userWidth = ((uHigh - uLow) / span) * 100;

  const songLeft = ((sLow - minOrder) / span) * 100;
  const songWidth = ((sHigh - sLow) / span) * 100;

  const adjLeft = ((adjustedLowOrder - minOrder) / span) * 100;
  const adjWidth = ((sHigh - sLow) / span) * 100;

  const brandColor = getBrandColor(song.brand);
  const brandName = getBrandShortName(song.brand);
  const accentTextColor = getAccentTextColor(brandColor);

  const formatKeyShift = (shift: number) => {
    if (shift > 0) return `+${shift}`;
    if (shift < 0) return `${shift}`;
    return '原調 (±0)';
  };

  return (
    <div className="song-adjust-card">
      {/* 頂部資訊：歌名與企劃 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedSong(song)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              fontSize: '17px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              textDecoration: 'underline',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            title="點擊查看詳細資料與試聽"
          >
            {song.title}
          </button>
          <span style={{
            backgroundColor: brandColor,
            color: accentTextColor,
            padding: '2px 8px',
            borderRadius: '99px',
            fontSize: '10px',
            fontWeight: 'bold'
          }}>
            {brandName}
          </span>
          {song.musicType && (
            <span style={{
              backgroundColor: 'var(--bg-base)',
              color: 'var(--text-muted)',
              padding: '2px 8px',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '10px',
              fontWeight: '500',
              textTransform: 'uppercase'
            }}>
              {song.musicType}
            </span>
          )}
        </div>
      </div>

      {/* 最低/最高對齊推薦選項切換 Pill */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
            🎯 選擇對齊基準
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {song.exceedsRange ? (
              <span style={{ color: '#f97316', fontWeight: '600' }}>⚠️ 跨度超出，系統優先推薦 Option 1</span>
            ) : (
              <span>💡 系統已預選變調幅度最小之最佳推薦選項</span>
            )}
          </span>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          backgroundColor: 'var(--bg-base)',
          padding: '4px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <button
            onClick={() => setActiveOption(1)}
            className={`adjust-option-btn ${activeOption === 1 ? 'active' : ''}`}
          >
            <span>1️⃣ 最低音對齊</span>
            <span style={{
              fontSize: '11px',
              backgroundColor: activeOption === 1 ? 'rgba(255,255,255,0.2)' : 'var(--bg-surface)',
              padding: '1px 6px',
              borderRadius: '4px',
              color: activeOption === 1 ? 'white' : 'var(--text-primary)',
              fontWeight: 'bold'
            }}>
              {formatKeyShift(song.K1)} Key
            </span>
            {recommendedOption === 1 && (
              <span style={{
                backgroundColor: activeOption === 1 ? 'rgba(255,255,255,0.25)' : 'var(--accent-glow-medium)',
                color: activeOption === 1 ? 'white' : 'var(--accent-text-dark)',
                padding: '1px 5px',
                borderRadius: '4px',
                fontSize: '9px',
                fontWeight: 'bold'
              }}>推薦</span>
            )}
          </button>
          <button
            onClick={() => setActiveOption(2)}
            className={`adjust-option-btn ${activeOption === 2 ? 'active' : ''}`}
          >
            <span>2️⃣ 最高音對齊</span>
            <span style={{
              fontSize: '11px',
              backgroundColor: activeOption === 2 ? 'rgba(255,255,255,0.2)' : 'var(--bg-surface)',
              padding: '1px 6px',
              borderRadius: '4px',
              color: activeOption === 2 ? 'white' : 'var(--text-primary)',
              fontWeight: 'bold'
            }}>
              {formatKeyShift(song.K2)} Key
            </span>
            {recommendedOption === 2 && (
              <span style={{
                backgroundColor: activeOption === 2 ? 'rgba(255,255,255,0.25)' : 'var(--accent-glow-medium)',
                color: activeOption === 2 ? 'white' : 'var(--accent-text-dark)',
                padding: '1px 5px',
                borderRadius: '4px',
                fontSize: '9px',
                fontWeight: 'bold'
              }}>推薦</span>
            )}
          </button>
        </div>
      </div>

      {/* 音域對比數據 Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
        <table className="adjust-table">
          <thead>
            <tr>
              <th>對照對象</th>
              <th>最低音</th>
              <th>最高音</th>
              <th>音域跨度</th>
            </tr>
          </thead>
          <tbody>
            {/* 樂曲原調 */}
            <tr className="row-original">
              <td>
                <div className="row-title">🎵 樂曲原調</div>
              </td>
              <td className="pitch-val">{getPitchName(sLow)}</td>
              <td className="pitch-val">{getPitchName(sHigh)}</td>
              <td className="span-val">{song.songSpan} 階</td>
            </tr>
            {/* 推薦變調後 */}
            <tr className={`row-adjusted ${song.exceedsRange ? 'exceeded' : 'fitted'}`}>
              <td>
                <div className="row-title highlight">
                  🎹 調整後 ({formatKeyShift(activeShift)})
                </div>
              </td>
              <td className={`pitch-val ${isLowOut ? 'out-of-bounds' : 'in-bounds'}`}>
                {getPitchName(adjustedLowOrder)}
                {isLowOut ? (
                  <span className="badge-out">超出</span>
                ) : (
                  <span className="badge-in">符合</span>
                )}
              </td>
              <td className={`pitch-val ${isHighOut ? 'out-of-bounds' : 'in-bounds'}`}>
                {getPitchName(adjustedHighOrder)}
                {isHighOut ? (
                  <span className="badge-out">超出</span>
                ) : (
                  <span className="badge-in">符合</span>
                )}
              </td>
              <td className="span-val">{song.songSpan} 階</td>
            </tr>
            {/* 使用者擅長 */}
            <tr className="row-user">
              <td>
                <div className="row-title">🎯 我的擅長音域</div>
              </td>
              <td className="pitch-val">{getPitchName(uLow)}</td>
              <td className="pitch-val">{getPitchName(uHigh)}</td>
              <td className="span-val">{userComfortableSpan} 階</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 調整 key 前後的音域區間示意圖 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px 20px',
        backgroundColor: 'var(--bg-base)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)'
      }}>
        {/* Header labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '4px' }}>
          <span>低音 ({getScientificPitchName(minOrder)})</span>
          <span>音域對比示意圖</span>
          <span>高音 ({getScientificPitchName(maxOrder)})</span>
        </div>

        {/* 鋼琴式科學音名刻度對照尺 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          {/* 對齊左側標籤欄的寬度 (130px) */}
          <div style={{ width: '130px', flexShrink: 0 }} />

          {/* 刻度尺音軌 */}
          <div style={{ flex: 1, position: 'relative', height: '18px' }}>
            {scaleTicks.map((tick, index) => {
              const left = ((tick.order - minOrder) / span) * 100;
              return (
                <div
                  key={index}
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    pointerEvents: 'none'
                  }}
                  className={tick.isMajor ? '' : 'ruler-minor-tick'}
                >
                  <span style={{
                    fontSize: '9px',
                    fontWeight: tick.isMajor ? 'bold' : 'normal',
                    color: tick.isMajor ? 'var(--text-primary)' : 'var(--text-muted)',
                    opacity: tick.isMajor ? 1 : 0.5,
                    marginBottom: '2px',
                    whiteSpace: 'nowrap'
                  }}>
                    {tick.name}
                  </span>
                  <div style={{
                    width: '1px',
                    height: tick.isMajor ? '5px' : '3px',
                    backgroundColor: tick.isMajor ? 'var(--text-secondary)' : 'var(--border-color)'
                  }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Track 1: User comfortable range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: '130px', flexShrink: 0 }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>🎯 我的擅長</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {getScientificPitchName(uLow)} ~ {getScientificPitchName(uHigh)}
            </span>
          </div>
          <div style={{ flex: 1, position: 'relative', height: '10px', backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: '99px' }}>
            {/* 鋼琴網格對照虛線 */}
            {scaleTicks.map((tick, tIdx) => {
              const left = ((tick.order - minOrder) / span) * 100;
              return (
                <div
                  key={tIdx}
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    backgroundColor: tick.isMajor ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.04)',
                    pointerEvents: 'none',
                    zIndex: 1
                  }}
                />
              );
            })}
            <div style={{
              position: 'absolute',
              left: `${userLeft}%`,
              width: `${userWidth}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--accent-color), var(--accent-glow-medium, var(--accent-color)))',
              borderRadius: '99px',
              opacity: 0.9,
              boxShadow: '0 0 6px var(--accent-glow)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 2
            }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#fff', marginLeft: '2px' }} />
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#fff', marginRight: '2px' }} />
            </div>
          </div>
        </div>

        {/* Track 2: Original song range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: '130px', flexShrink: 0 }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>🎵 樂曲原調</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {getScientificPitchName(sLow)} ~ {getScientificPitchName(sHigh)}
            </span>
          </div>
          <div style={{ flex: 1, position: 'relative', height: '10px', backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: '99px' }}>
            {/* 鋼琴網格對照虛線 */}
            {scaleTicks.map((tick, tIdx) => {
              const left = ((tick.order - minOrder) / span) * 100;
              return (
                <div
                  key={tIdx}
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    backgroundColor: tick.isMajor ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.04)',
                    pointerEvents: 'none',
                    zIndex: 1
                  }}
                />
              );
            })}
            <div style={{
              position: 'absolute',
              left: `${songLeft}%`,
              width: `${songWidth}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #0ea5e9, #6366f1)',
              borderRadius: '99px',
              opacity: 0.8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 2
            }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#fff', marginLeft: '2px' }} />
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#fff', marginRight: '2px' }} />
            </div>
          </div>
        </div>

        {/* Track 3: Adjusted song range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: '130px', flexShrink: 0 }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-text-dark, var(--text-primary))', whiteSpace: 'nowrap' }}>🎹 調整後</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {getScientificPitchName(adjustedLowOrder)} ~ {getScientificPitchName(adjustedHighOrder)}
            </span>
          </div>
          <div style={{ flex: 1, position: 'relative', height: '10px', backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: '99px' }}>
            {/* 鋼琴網格對照虛線 */}
            {scaleTicks.map((tick, tIdx) => {
              const left = ((tick.order - minOrder) / span) * 100;
              return (
                <div
                  key={tIdx}
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    backgroundColor: tick.isMajor ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.04)',
                    pointerEvents: 'none',
                    zIndex: 1
                  }}
                />
              );
            })}
            <div style={{
              position: 'absolute',
              left: `${adjLeft}%`,
              width: `${adjWidth}%`,
              height: '100%',
              background: song.exceedsRange ? 'linear-gradient(90deg, #f97316, #ea580c)' : 'linear-gradient(90deg, #10b981, #059669)',
              borderRadius: '99px',
              opacity: 0.9,
              boxShadow: song.exceedsRange ? '0 0 6px rgba(249, 115, 22, 0.4)' : '0 0 6px rgba(16, 185, 129, 0.4)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 2
            }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#fff', marginLeft: '2px' }} />
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#fff', marginRight: '2px' }} />
            </div>
          </div>
        </div>
      </div>

      {/* 底部橫幅提示 */}
      <div>
        {song.fitsNatively && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(13, 148, 136, 0.08)',
            color: '#0d9488',
            border: '1px solid rgba(13, 148, 136, 0.2)',
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600'
          }}>
            ✨ 原調即完美符合您的擅長音域，免升降 Key 調整！
          </div>
        )}

        {song.exceedsRange && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            backgroundColor: 'rgba(249, 115, 22, 0.08)',
            color: '#c2410c',
            border: '1px solid rgba(249, 115, 22, 0.2)',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '12px',
            lineHeight: '1.6'
          }}>
            <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ⚠️ 歌曲音域過寬 ({song.songSpan} 階) 警告：
            </div>
            <div>
              該曲的音域跨度已超過您個人的舒適音域跨度 ({comfortableHighest - comfortableLowest} 階)。
              無論如何調整皆會有部分音符超出擅長音域，<strong>系統優先採用最低音對齊 (Option 1)</strong>，推薦升降 Key 數值為 <strong>{formatKeyShift(song.K1)} Key</strong>。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


export default function PitchAdjustmentPage() {
  const { data: session, status } = useSession();

  // 音域狀態 (對應 Order 數字 1~60)
  const [comfortableLowest, setComfortableLowest] = useState<number | null>(null);
  const [comfortableHighest, setComfortableHighest] = useState<number | null>(null);
  const [singableLowest, setSingableLowest] = useState<number | null>(null);
  const [singableHighest, setSingableHighest] = useState<number | null>(null);
  const [limitLowest, setLimitLowest] = useState<number | null>(null);
  const [limitHighest, setLimitHighest] = useState<number | null>(null);

  // 儲存熟悉度與彈窗狀態
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [selectedSong, setSelectedSong] = useState<any | null>(null);

  // 狀態管理
  const [loadingRange, setLoadingRange] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

  // 儲存所有會唱歌曲以利快速對照查找
  const [userSongs, setUserSongs] = useState<any[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(false);

  // 儲存所有歌曲以供音域推薦使用
  const [allSongs, setAllSongs] = useState<any[]>([]);

  // 儲存所有公開個人音域的資料
  const [publicRanges, setPublicRanges] = useState<any[]>([]);

  // 分頁與推薦狀態
  const [activeTab, setActiveTab] = useState<'settings' | 'recommend' | 'adjustKey'>('settings');
  const [recommendCategory, setRecommendCategory] = useState<'perfect' | 'lowSide' | 'highSide' | 'bothSide'>('perfect');
  const [visibleRecommendCount, setVisibleRecommendCount] = useState(30);

  // 音域推薦的篩選狀態
  const [recommendSearch, setRecommendSearch] = useState('');
  const [recommendBrand, setRecommendBrand] = useState('all');
  const [recommendType, setRecommendType] = useState('all');

  // 依照歌曲推薦調整 key 的篩選與分頁狀態
  const [adjustSearch, setAdjustSearch] = useState('');
  const [adjustBrand, setAdjustBrand] = useState('all');
  const [adjustType, setAdjustType] = useState('all');
  const [visibleAdjustCount, setVisibleAdjustCount] = useState(30);

  // 重置歌曲調整 key 顯示曲數
  useEffect(() => {
    setVisibleAdjustCount(30);
  }, [adjustSearch, adjustBrand, adjustType]);

  // 重置推薦顯示曲數
  useEffect(() => {
    setVisibleRecommendCount(30);
  }, [recommendCategory, recommendSearch, recommendBrand, recommendType]);

  // 記錄展開狀態： Key 為 `${pitchKey}_${brand}`
  const [expandedBrands, setExpandedBrands] = useState<Record<string, boolean>>({});

  const toggleBrandExpand = (key: string) => {
    setExpandedBrands(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // 主題設定
  const themeColor = session?.user?.themeColor || '#92cfbb';

  // 輔助函式：透過 order 數字找出音名
  const getPitchName = (order: number | null) => {
    if (order === null) return '--';
    const pitchObj = pitchHierarchy.find(p => p.order === order);
    return pitchObj ? `${pitchObj.jp} (${pitchObj.en})` : '--';
  };

  // 1. 從 API 載入使用者目前的音域設定
  useEffect(() => {
    if (status !== 'authenticated') return;

    async function fetchVocalRange() {
      try {
        setLoadingRange(true);
        const res = await fetch('/api/user/vocal-range');
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();

        if (data) {
          setComfortableLowest(data.comfortableLowest);
          setComfortableHighest(data.comfortableHighest);
          setSingableLowest(data.singableLowest);
          setSingableHighest(data.singableHighest);
          setLimitLowest(data.limitLowest);
          setLimitHighest(data.limitHighest);
        }
      } catch (err: any) {
        console.error('無法載入音域設定:', err);
        setSyncError('無法載入您的音域設定，請稍候重試。');
      } finally {
        setLoadingRange(false);
      }
    }

    fetchVocalRange();
  }, [status]);

  // 1b. 載入會唱歌曲與對應音域
  useEffect(() => {
    if (status !== 'authenticated') return;

    async function loadFamiliarSongs() {
      try {
        setLoadingSongs(true);
        const [songsRes, selectionsRes] = await Promise.all([
          fetch('/api/songs?schema=v2', { cache: 'no-cache' }),
          fetch('/api/selections', { cache: 'no-cache' })
        ]);

        if (!songsRes.ok || !selectionsRes.ok) {
          throw new Error('無法載入歌曲或選擇資料。');
        }

        const songsData = await songsRes.json();
        const selectionsData = await selectionsRes.json();

        if (Array.isArray(songsData)) {
          setAllSongs(songsData);
          if (selectionsData) {
            setSelections(selectionsData);
            const familiarSongs = songsData.filter(song => {
              const hasFamiliar = selectionsData[song.id] === 1; // 1 = 會唱
              const hasPitch = song.lowestPitch || song.highestPitch;
              return hasFamiliar && hasPitch;
            });
            setUserSongs(familiarSongs);
          }
        }
      } catch (err) {
        console.error('載入會唱歌曲錯誤:', err);
      } finally {
        setLoadingSongs(false);
      }
    }

    loadFamiliarSongs();
  }, [status]);

  // 1c. 載入有公開個人音域的資料
  useEffect(() => {
    async function loadPublicRanges() {
      try {
        const res = await fetch('/api/user/public-vocal-ranges');
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setPublicRanges(data);
        }
      } catch (err) {
        console.error('無法載入公開音域資料:', err);
      }
    }
    loadPublicRanges();
  }, []);

  // 輔助：將音高字串轉成 order 數值
  const pitchToOrder = (pitchStr: string | null): number | null => {
    if (!pitchStr) return null;
    const match = pitchHierarchy.find(p => p.jp === pitchStr || p.en === pitchStr);
    return match ? match.order : null;
  };

  // 分類與排序推薦歌曲
  const recommendations = useMemo(() => {
    if (comfortableLowest === null || comfortableHighest === null) {
      return { perfect: [], lowSide: [], highSide: [], bothSide: [] };
    }

    const uLow = comfortableLowest;
    const uHigh = comfortableHighest;

    const perfect: any[] = [];
    const lowSide: any[] = [];
    const highSide: any[] = [];
    const bothSide: any[] = [];

    allSongs.forEach(song => {
      // 確保歌曲有音高資料
      if (!song.lowestPitch || !song.highestPitch) return;

      // 關鍵字搜尋 (支援歌名、歌手/成員姓名、聲優姓名、團體/組合名)
      if (recommendSearch.trim()) {
        const query = recommendSearch.toLowerCase();
        const matchesTitle = song.title?.toLowerCase().includes(query);
        const matchesRomaji = song.romaji?.toLowerCase().includes(query);
        const matchesKana = song.kana?.toLowerCase().includes(query);

        const matchesMembers = song.members?.some((m: any) =>
          m.name?.toLowerCase().includes(query) ||
          m.cvName?.toLowerCase().includes(query)
        );

        const matchesUnits = song.units?.some((u: any) =>
          u.name?.toLowerCase().includes(query)
        );

        if (!matchesTitle && !matchesRomaji && !matchesKana && !matchesMembers && !matchesUnits) return;
      }

      // 企劃篩選
      if (recommendBrand !== 'all' && song.brand !== recommendBrand) return;

      // 類型篩選
      if (recommendType !== 'all' && song.musicType !== recommendType) return;

      const sLow = pitchToOrder(song.lowestPitch);
      const sHigh = pitchToOrder(song.highestPitch);

      if (sLow === null || sHigh === null) return;

      const isLowFit = sLow >= uLow;
      const isHighFit = sHigh <= uHigh;

      if (isLowFit && isHighFit) {
        // 全部符合
        perfect.push({ ...song, sLow, sHigh });
      } else if (isHighFit && !isLowFit) {
        // 偏低 (最高音符合，最低音比使用者低)
        lowSide.push({ ...song, sLow, sHigh, diffLow: uLow - sLow });
      } else if (isLowFit && !isHighFit) {
        // 偏高 (最低音符合，最高音比使用者高)
        highSide.push({ ...song, sLow, sHigh, diffHigh: sHigh - uHigh });
      } else {
        // 太高又太低 (最高音比使用者高，最低音比使用者低)
        bothSide.push({
          ...song,
          sLow,
          sHigh,
          diffLow: uLow - sLow,
          diffHigh: sHigh - uHigh,
          totalDiff: (uLow - sLow) + (sHigh - uHigh)
        });
      }
    });

    // 排序邏輯
    // 1. 全部符合: 按歌名排序
    perfect.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));

    // 2. 偏低: 照最低音最接近依序排出來 (diffLow 由小到大)
    lowSide.sort((a, b) => a.diffLow - b.diffLow);

    // 3. 偏高: 照最高音最接近依序排出來 (diffHigh 由小到大)
    highSide.sort((a, b) => a.diffHigh - b.diffHigh);

    // 4. 太高又太低: 看兩邊各自超過的數量最低開始列 (totalDiff 由小到大)
    bothSide.sort((a, b) => a.totalDiff - b.totalDiff);

    return { perfect, lowSide, highSide, bothSide };
  }, [allSongs, comfortableLowest, comfortableHighest, recommendSearch, recommendBrand, recommendType]);

  const selectedCategorySongs = useMemo(() => {
    if (recommendCategory === 'perfect') return recommendations.perfect;
    if (recommendCategory === 'lowSide') return recommendations.lowSide;
    if (recommendCategory === 'highSide') return recommendations.highSide;
    return recommendations.bothSide;
  }, [recommendCategory, recommendations]);

  const displayedSongs = useMemo(() => {
    return selectedCategorySongs.slice(0, visibleRecommendCount);
  }, [selectedCategorySongs, visibleRecommendCount]);

  // 篩選與計算調整 key 推薦的歌曲清單
  const adjustFilteredSongs = useMemo(() => {
    if (comfortableLowest === null || comfortableHighest === null) {
      return [];
    }

    const uLow = comfortableLowest;
    const uHigh = comfortableHighest;
    const userComfortableSpan = uHigh - uLow;

    const filtered = allSongs.filter(song => {
      // 確保有音高資料
      if (!song.lowestPitch || !song.highestPitch) return false;

      // 關鍵字搜尋 (支援歌名、歌手/成員姓名、聲優姓名、團體/組合名)
      if (adjustSearch.trim()) {
        const query = adjustSearch.toLowerCase();
        const matchesTitle = song.title?.toLowerCase().includes(query);
        const matchesRomaji = song.romaji?.toLowerCase().includes(query);
        const matchesKana = song.kana?.toLowerCase().includes(query);

        const matchesMembers = song.members?.some((m: any) =>
          m.name?.toLowerCase().includes(query) ||
          m.cvName?.toLowerCase().includes(query)
        );

        const matchesUnits = song.units?.some((u: any) =>
          u.name?.toLowerCase().includes(query)
        );

        if (!matchesTitle && !matchesRomaji && !matchesKana && !matchesMembers && !matchesUnits) return;
      }

      // 企劃篩選
      if (adjustBrand !== 'all' && song.brand !== adjustBrand) return false;

      // 類型篩選
      if (adjustType !== 'all' && song.musicType !== adjustType) return false;

      return true;
    });

    const mapped = filtered.map(song => {
      const sLow = pitchToOrder(song.lowestPitch)!;
      const sHigh = pitchToOrder(song.highestPitch)!;
      const songSpan = sHigh - sLow;

      // 1. 最低音對齊 (Option 1): K1 = uLow - sLow
      const K1 = uLow - sLow;

      // 2. 最高音對齊 (Option 2): K2 = uHigh - sHigh
      const K2 = uHigh - sHigh;

      const fitsNatively = sLow >= uLow && sHigh <= uHigh;
      const exceedsRange = songSpan > userComfortableSpan;

      return {
        ...song,
        sLow,
        sHigh,
        songSpan,
        K1,
        K2,
        fitsNatively,
        exceedsRange
      };
    });

    // 依歌名排序
    mapped.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));

    return mapped;
  }, [allSongs, comfortableLowest, comfortableHighest, adjustSearch, adjustBrand, adjustType]);

  // 建立音階到「會唱」歌曲的映射對照表 (包含歌曲完整物件)
  const pitchSongsMap = useMemo(() => {
    const highest: Record<string, any[]> = {};
    const lowest: Record<string, any[]> = {};

    userSongs.forEach(song => {
      if (song.highestPitch) {
        if (!highest[song.highestPitch]) {
          highest[song.highestPitch] = [];
        }
        highest[song.highestPitch].push(song);
      }
      if (song.lowestPitch) {
        if (!lowest[song.lowestPitch]) {
          lowest[song.lowestPitch] = [];
        }
        lowest[song.lowestPitch].push(song);
      }
    });

    return { highest, lowest };
  }, [userSongs]);

  // 依品牌分類渲染歌曲標記
  const renderSongsByBrand = (songsList: any[], pitchKey: string) => {
    const grouped: Record<string, any[]> = {};
    songsList.forEach(s => {
      if (!grouped[s.brand]) {
        grouped[s.brand] = [];
      }
      grouped[s.brand].push(s);
    });

    return Object.entries(grouped).map(([brand, songs]) => {
      const brandColor = getBrandColor(brand);
      const brandName = getBrandShortName(brand);
      const textColor = getAccentTextColor(brandColor);

      const uniqueKey = `${pitchKey}_${brand}`;
      const isExpanded = !!expandedBrands[uniqueKey];

      // 如果大於 3 首，需要摺疊處理
      const needCollapse = songs.length > 3;

      const displayedSongs = needCollapse && !isExpanded
        ? songs.slice(0, 3)
        : songs;

      return (
        <div key={brand} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', lineHeight: '1.5', margin: '4px 0', flexWrap: 'wrap' }}>
          <span style={{
            backgroundColor: brandColor,
            color: textColor,
            padding: '1px 5px',
            borderRadius: '4px',
            fontSize: '9px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            marginTop: '2px'
          }}>
            {brandName}
          </span>
          <span style={{ color: 'var(--text-secondary)', display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px' }}>
            {displayedSongs.map((song, sIdx) => (
              <React.Fragment key={song.id}>
                <button
                  onClick={() => setSelectedSong(song)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    font: 'inherit',
                    color: 'var(--accent-text-dark, var(--text-primary))',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    display: 'inline',
                    textAlign: 'left'
                  }}
                  title="點擊查看詳細資料與試聽"
                >
                  {song.title}
                </button>
                {sIdx < displayedSongs.length - 1 && <span>、</span>}
              </React.Fragment>
            ))}
            {needCollapse && (
              <>
                {!isExpanded ? (
                  <button
                    onClick={() => toggleBrandExpand(uniqueKey)}
                    style={{
                      marginLeft: '6px',
                      background: 'var(--accent-glow-soft)',
                      color: 'var(--accent-text-dark)',
                      border: '1px solid var(--accent-glow-medium)',
                      borderRadius: '4px',
                      padding: '1px 6px',
                      fontSize: '9px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                    onMouseOver={(e) => {
                      (e.currentTarget as any).style.background = 'var(--accent-glow-medium)';
                    }}
                    onMouseOut={(e) => {
                      (e.currentTarget as any).style.background = 'var(--accent-glow-soft)';
                    }}
                  >
                    +{songs.length - 3}
                  </button>
                ) : (
                  <button
                    onClick={() => toggleBrandExpand(uniqueKey)}
                    style={{
                      marginLeft: '8px',
                      background: '#f1f5f9',
                      color: '#64748b',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      padding: '1px 6px',
                      fontSize: '9px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                    onMouseOver={(e) => {
                      (e.currentTarget as any).style.background = '#e2e8f0';
                    }}
                    onMouseOut={(e) => {
                      (e.currentTarget as any).style.background = '#f1f5f9';
                    }}
                    title="收合歌單"
                  >
                    ↑
                  </button>
                )}
              </>
            )}
          </span>
        </div>
      );
    });
  };

  // 2. 當使用者變更任何數值時，自動儲存至 API
  const handleSave = async (newRange: {
    comfortableLowest: number | null;
    comfortableHighest: number | null;
    singableLowest: number | null;
    singableHighest: number | null;
    limitLowest: number | null;
    limitHighest: number | null;
  }) => {
    if (status !== 'authenticated') return;

    setSyncStatus('saving');
    setSyncError(null);

    try {
      const res = await fetch('/api/user/vocal-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRange),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '儲存失敗');
      }

      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (err: any) {
      console.error('儲存音域設定失敗:', err);
      setSyncStatus('error');
      setSyncError(err.message || '儲存失敗，請檢查網路連線。');
    }
  };

  // 點選熟悉度更新（配合歌曲詳細彈窗使用，手動更改「會唱」與否可即時連動右欄表格對照）
  const handleSelect = async (songId: string, familiarity: number) => {
    setSelections(prev => {
      const updated = { ...prev };
      if (familiarity === 0) {
        delete updated[songId];
      } else {
        updated[songId] = familiarity;
      }
      return updated;
    });

    setUserSongs(prev => {
      const songObj = allSongs.find(s => s.id === songId);
      if (!songObj) return prev;

      const isSongInUserSongs = prev.some(s => s.id === songId);
      const shouldBeInUserSongs = familiarity === 1 && (songObj.lowestPitch || songObj.highestPitch);

      if (shouldBeInUserSongs && !isSongInUserSongs) {
        return [...prev, songObj];
      } else if (!shouldBeInUserSongs && isSongInUserSongs) {
        return prev.filter(s => s.id !== songId);
      }
      return prev;
    });

    try {
      await fetch('/api/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ songId, familiarity }]),
      });
    } catch (err) {
      console.error('更新歌曲熟悉度失敗:', err);
    }
  };

  // 3. 設定音域邊界時的防呆/連動邏輯
  const handleSetBoundary = (type: 'limitLowest' | 'singableLowest' | 'comfortableLowest' | 'comfortableHighest' | 'singableHighest' | 'limitHighest', order: number) => {
    let update = {
      comfortableLowest,
      comfortableHighest,
      singableLowest,
      singableHighest,
      limitLowest,
      limitHighest,
    };

    // 點擊已選取的格子，代表清除
    if (update[type] === order) {
      update[type] = null;
    } else {
      update[type] = order;

      // 當新增或變更邊界時，實施防呆校正 (保證: limitLowest <= singableLowest <= comfortableLowest <= comfortableHighest <= singableHighest <= limitHighest)
      if (type === 'limitLowest') {
        if (update.singableLowest !== null && order > update.singableLowest) {
          update.singableLowest = order;
        }
        if (update.comfortableLowest !== null && order > update.comfortableLowest) {
          update.comfortableLowest = order;
        }
        if (update.comfortableHighest !== null && order > update.comfortableHighest) {
          update.comfortableHighest = order;
        }
        if (update.singableHighest !== null && order > update.singableHighest) {
          update.singableHighest = order;
        }
        if (update.limitHighest !== null && order > update.limitHighest) {
          update.limitHighest = order;
        }
      } else if (type === 'singableLowest') {
        if (update.limitLowest !== null && order < update.limitLowest) {
          update.limitLowest = order;
        }
        if (update.comfortableLowest !== null && order > update.comfortableLowest) {
          update.comfortableLowest = order;
        }
        if (update.comfortableHighest !== null && order > update.comfortableHighest) {
          update.comfortableHighest = order;
        }
        if (update.singableHighest !== null && order > update.singableHighest) {
          update.singableHighest = order;
        }
        if (update.limitHighest !== null && order > update.limitHighest) {
          update.limitHighest = order;
        }
      } else if (type === 'comfortableLowest') {
        if (update.singableLowest !== null && order < update.singableLowest) {
          update.singableLowest = order;
        }
        if (update.limitLowest !== null && order < update.limitLowest) {
          update.limitLowest = order;
        }
        if (update.comfortableHighest !== null && order > update.comfortableHighest) {
          update.comfortableHighest = order;
        }
        if (update.singableHighest !== null && order > update.singableHighest) {
          update.singableHighest = order;
        }
        if (update.limitHighest !== null && order > update.limitHighest) {
          update.limitHighest = order;
        }
      } else if (type === 'comfortableHighest') {
        if (update.comfortableLowest !== null && order < update.comfortableLowest) {
          update.comfortableLowest = order;
        }
        if (update.singableLowest !== null && order < update.singableLowest) {
          update.singableLowest = order;
        }
        if (update.limitLowest !== null && order < update.limitLowest) {
          update.limitLowest = order;
        }
        if (update.singableHighest !== null && order > update.singableHighest) {
          update.singableHighest = order;
        }
        if (update.limitHighest !== null && order > update.limitHighest) {
          update.limitHighest = order;
        }
      } else if (type === 'singableHighest') {
        if (update.comfortableHighest !== null && order < update.comfortableHighest) {
          update.comfortableHighest = order;
        }
        if (update.comfortableLowest !== null && order < update.comfortableLowest) {
          update.comfortableLowest = order;
        }
        if (update.singableLowest !== null && order < update.singableLowest) {
          update.singableLowest = order;
        }
        if (update.limitLowest !== null && order < update.limitLowest) {
          update.limitLowest = order;
        }
        if (update.limitHighest !== null && order > update.limitHighest) {
          update.limitHighest = order;
        }
      } else if (type === 'limitHighest') {
        if (update.singableHighest !== null && order < update.singableHighest) {
          update.singableHighest = order;
        }
        if (update.comfortableHighest !== null && order < update.comfortableHighest) {
          update.comfortableHighest = order;
        }
        if (update.comfortableLowest !== null && order < update.comfortableLowest) {
          update.comfortableLowest = order;
        }
        if (update.singableLowest !== null && order < update.singableLowest) {
          update.singableLowest = order;
        }
        if (update.limitLowest !== null && order < update.limitLowest) {
          update.limitLowest = order;
        }
      }
    }

    // 更新本地 state
    setComfortableLowest(update.comfortableLowest);
    setComfortableHighest(update.comfortableHighest);
    setSingableLowest(update.singableLowest);
    setSingableHighest(update.singableHighest);
    setLimitLowest(update.limitLowest);
    setLimitHighest(update.limitHighest);

    // 發送同步請求
    handleSave(update);
  };

  // 4. 清除所有音域設定
  const handleClearAll = () => {
    const update = {
      comfortableLowest: null,
      comfortableHighest: null,
      singableLowest: null,
      singableHighest: null,
      limitLowest: null,
      limitHighest: null,
    };
    setComfortableLowest(null);
    setComfortableHighest(null);
    setSingableLowest(null);
    setSingableHighest(null);
    setLimitLowest(null);
    setLimitHighest(null);
    handleSave(update);
  };



  // 6. 視覺區域背景著色邏輯
  const getRowHighlightClass = (order: number) => {
    const isComfortable = comfortableLowest !== null && comfortableHighest !== null
      && order >= comfortableLowest && order <= comfortableHighest;
    const isSingable = singableLowest !== null && singableHighest !== null
      && order >= singableLowest && order <= singableHighest;
    const isLimit = limitLowest !== null && limitHighest !== null
      && order >= limitLowest && order <= limitHighest;

    if (isComfortable) return 'row-comfortable';
    if (isSingable) return 'row-singable';
    if (isLimit) return 'row-limit';
    return '';
  };

  // 計算音域視覺 Bar 的百分比與寬度
  const timelineRange = useMemo(() => {
    const minOrder = 1;
    const maxOrder = 60;
    const rangeSpan = maxOrder - minOrder;

    let clPct = 0;
    let chPct = 0;
    let slPct = 0;
    let shPct = 0;
    let llPct = 0;
    let lhPct = 0;

    if (comfortableLowest) clPct = ((comfortableLowest - minOrder) / rangeSpan) * 100;
    if (comfortableHighest) chPct = ((comfortableHighest - minOrder) / rangeSpan) * 100;
    if (singableLowest) slPct = ((singableLowest - minOrder) / rangeSpan) * 100;
    if (singableHighest) shPct = ((singableHighest - minOrder) / rangeSpan) * 100;
    if (limitLowest) llPct = ((limitLowest - minOrder) / rangeSpan) * 100;
    if (limitHighest) lhPct = ((limitHighest - minOrder) / rangeSpan) * 100;

    return { clPct, chPct, slPct, shPct, llPct, lhPct };
  }, [comfortableLowest, comfortableHighest, singableLowest, singableHighest, limitLowest, limitHighest]);

  // 未登入畫面的優雅提示
  if (status === 'unauthenticated') {
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
            <a href="/" className="btn btn-secondary">返回首頁</a>
          </div>
        </header>

        <main className="container" style={{ padding: '60px 24px', display: 'flex', justifyContent: 'center' }}>
          <div className="card-el" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔒</div>
            <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '16px' }}>請先登入帳號</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '30px' }}>
              音域設定需要與您的個人帳號進行關聯與儲存。登入後，系統將會記錄您的擅長與極限音域，並能配合未來的歌曲推薦功能使用！
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button onClick={() => signIn()} className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '15px' }}>
                登入 / 註冊帳號
              </button>
              <a href="/" className="btn btn-secondary" style={{ width: '100%', padding: '12px', fontSize: '15px' }}>
                返回首頁
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{
      ...(buildThemeVars(themeColor) as any),
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
    }}>
      {/* 嵌入局部 Premium Style 確保網頁特效完整度 */}
      <style>{`
        /* 音域表高亮區域配色 */
        .row-comfortable {
          background-color: var(--accent-glow-soft) !important;
        }
        .row-singable {
          background-color: rgba(56, 189, 248, 0.06) !important;
        }
        .row-limit {
          background-color: rgba(109, 40, 217, 0.06) !important;
        }
        
        .pitch-row-interactive {
          transition: background-color 0.15s ease;
        }
        .pitch-row-interactive:hover {
          background-color: var(--bg-surface-hover);
        }
        
        /* 視覺音域刻度 Bar */
        .range-timeline-container {
          position: relative;
          height: 14px;
          background: #e2e8f0;
          border-radius: 99px;
          margin: 30px 10px 10px 10px;
        }
        .timeline-comfortable-segment {
          position: absolute;
          height: 100%;
          background: var(--accent-color);
          border-radius: 99px;
          opacity: 0.85;
          box-shadow: 0 0 10px var(--accent-glow);
          z-index: 3;
        }
        .timeline-singable-segment {
          position: absolute;
          height: 100%;
          background: #38bdf8;
          border-radius: 99px;
          opacity: 0.65;
          z-index: 2;
        }
        .timeline-limit-segment {
          position: absolute;
          height: 100%;
          background: #818cf8;
          border-radius: 99px;
          opacity: 0.45;
          z-index: 1;
        }
        .timeline-pin {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 4px solid var(--accent-color);
          box-shadow: var(--shadow-md);
          z-index: 4;
          cursor: pointer;
        }
        .timeline-pin.pin-singable {
          border-color: #38bdf8;
        }
        .timeline-pin.pin-limit {
          border-color: #6366f1;
        }
        .timeline-pin::after {
          content: attr(data-label);
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          margin-bottom: 6px;
          background: var(--text-primary);
          color: white;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          font-weight: bold;
          box-shadow: var(--shadow-sm);
        }

        /* 介面卡片排列 */
        .pitch-table-card {
          max-height: 700px;
          overflow-y: auto;
          padding: 0;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
          background-color: var(--bg-surface);
        }
        
        .boundary-button {
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          border-radius: var(--radius-full);
          border: 1px solid var(--border-color);
          background-color: var(--bg-surface);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .boundary-button:hover {
          border-color: var(--text-muted);
          background-color: var(--bg-base);
        }
        
        .boundary-button.active-LL {
          background-color: #6366f1;
          color: white;
          border-color: #6366f1;
          box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
        }
        .boundary-button.active-SL {
          background-color: #0284c7;
          color: white;
          border-color: #0284c7;
          box-shadow: 0 0 8px rgba(2, 132, 199, 0.4);
        }
        .boundary-button.active-CL {
          background-color: var(--accent-color);
          color: var(--accent-on-color);
          border-color: var(--accent-color);
          box-shadow: 0 0 8px var(--accent-glow);
        }
        .boundary-button.active-CH {
          background-color: var(--accent-color);
          color: var(--accent-on-color);
          border-color: var(--accent-color);
          box-shadow: 0 0 8px var(--accent-glow);
        }
        .boundary-button.active-SH {
          background-color: #0284c7;
          color: white;
          border-color: #0284c7;
          box-shadow: 0 0 8px rgba(2, 132, 199, 0.4);
        }
        .boundary-button.active-LH {
          background-color: #6366f1;
          color: white;
          border-color: #6366f1;
          box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
        }

        .saving-status-tag {
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: var(--radius-full);
          background-color: var(--bg-base);
          border: 1px solid var(--border-color);
          transition: all 0.2s ease;
        }

        .saving-status-tag.saving {
          background-color: var(--accent-glow-soft);
          border-color: var(--accent-color);
          color: var(--accent-text-dark);
        }

        .saving-status-tag.saved {
          background-color: rgba(13, 148, 136, 0.1);
          border-color: #0d9488;
          color: #0d9488;
        }

        /* 依照歌曲推薦變調卡片優化樣式 */
        .song-adjust-card {
          padding: 20px 24px;
          background: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 16px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: var(--shadow-sm);
        }
        .song-adjust-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
          border-color: var(--accent-color);
        }
        
        .adjust-option-btn {
          padding: 8px 16px;
          border-radius: 6px;
          border: none;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          background-color: transparent;
          color: var(--text-secondary);
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        .adjust-option-btn:hover {
          background-color: var(--bg-surface-hover);
          color: var(--text-primary);
        }
        .adjust-option-btn.active {
          background-color: var(--accent-color);
          color: var(--accent-on-color);
          box-shadow: 0 2px 6px var(--accent-glow);
        }

        .adjust-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          text-align: left;
          background-color: var(--bg-surface);
        }
        .adjust-table th {
          padding: 10px 14px;
          color: var(--text-secondary);
          font-weight: 600;
          border-bottom: 1px solid var(--border-color);
          background-color: var(--bg-base);
        }
        .adjust-table td {
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-color);
          vertical-align: middle;
        }
        .adjust-table tr:last-child td {
          border-bottom: none;
        }
        .adjust-table .row-title {
          font-weight: 500;
          color: var(--text-secondary);
        }
        .adjust-table .row-title.highlight {
          font-weight: 600;
          color: var(--accent-text-dark, var(--text-primary));
        }
        .adjust-table .row-adjusted.fitted {
          background-color: var(--accent-glow-soft);
        }
        .adjust-table .row-adjusted.exceeded {
          background-color: rgba(249, 115, 22, 0.04);
        }
        .adjust-table .pitch-val {
          font-family: inherit;
          font-weight: 500;
          color: var(--text-primary);
        }
        .adjust-table .pitch-val.in-bounds {
          color: #0d9488;
          font-weight: 600;
        }
        .adjust-table .pitch-val.out-of-bounds {
          color: #ef4444;
          font-weight: 600;
        }
        .adjust-table .span-val {
          color: var(--text-muted);
        }
        
        .adjust-table .badge-in {
          font-size: 9px;
          font-weight: bold;
          color: #0d9488;
          background-color: rgba(13, 148, 136, 0.1);
          padding: 2px 6px;
          border-radius: 4px;
          margin-left: 8px;
          text-transform: uppercase;
        }
        .adjust-table .badge-out {
          font-size: 9px;
          font-weight: bold;
          color: #ef4444;
          background-color: rgba(239, 68, 68, 0.1);
          padding: 2px 6px;
          border-radius: 4px;
          margin-left: 8px;
          text-transform: uppercase;
        }
      `}</style>

      <header>
        <div className="container header-content">
          <h1>IMAS Song Familiarity Hub</h1>
          <a href="/" className="btn btn-secondary">
            返回首頁
          </a>
        </div>
      </header>

      <main className="container" style={{ paddingTop: '32px', marginBottom: '80px' }}>
        {/* 頁面標題列 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>🎤 個人音域設定</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              標記您在唱歌時能舒適掌握、或是極限能夠達到的音域。這些設定可用於對比歌曲的最高與最低音高。
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              有些歌曲未收錄最高音/最低音資料，還請見諒。
            </p>
          </div>

          {/* 自動儲存標籤 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {syncStatus === 'saving' && (
              <div className="saving-status-tag saving">
                <span className="spinner" style={{ display: 'inline-block', width: '10px', height: '10px', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                同步至雲端中...
              </div>
            )}
            {syncStatus === 'saved' && (
              <div className="saving-status-tag saved">
                ✓ 設定已儲存
              </div>
            )}
            {syncStatus === 'error' && (
              <div className="saving-status-tag" style={{ backgroundColor: '#fef2f2', borderColor: '#fee2e2', color: '#ef4444' }}>
                ⚠️ {syncError || '儲存失敗'}
              </div>
            )}
            {syncStatus === 'idle' && (
              <div className="saving-status-tag" style={{ opacity: 0.6 }}>
                雲端已同步
              </div>
            )}
          </div>
        </div>

        {/* Tab 選擇器 */}
        <div style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-color)',
          marginBottom: '28px',
          paddingBottom: '2px'
        }}>
          <button
            onClick={() => setActiveTab('settings')}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 20px',
              fontSize: '15px',
              fontWeight: activeTab === 'settings' ? '600' : '500',
              color: activeTab === 'settings' ? 'var(--accent-color)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'settings' ? '3px solid var(--accent-color)' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              marginBottom: '-3px'
            }}
          >
            ⚙️ 音域設定
          </button>
          <button
            onClick={() => setActiveTab('recommend')}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 20px',
              fontSize: '15px',
              fontWeight: activeTab === 'recommend' ? '600' : '500',
              color: activeTab === 'recommend' ? 'var(--accent-color)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'recommend' ? '3px solid var(--accent-color)' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              marginBottom: '-3px'
            }}
          >
            🎵 依照擅長音域推薦歌曲
          </button>
          <button
            onClick={() => setActiveTab('adjustKey')}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 20px',
              fontSize: '15px',
              fontWeight: activeTab === 'adjustKey' ? '600' : '500',
              color: activeTab === 'adjustKey' ? 'var(--accent-color)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'adjustKey' ? '3px solid var(--accent-color)' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              marginBottom: '-3px'
            }}
          >
            🎹 依照歌曲推薦調整 key
          </button>
        </div>

        {activeTab === 'settings' && (
          /* 雙欄主版面 (原本的音域設定) */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '24px', alignItems: 'start' }} className="collab-layout-grid">
            {/* 左欄：設定狀態與音域視覺表 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* 1. 音域狀態儀表板 */}
              <div className="card-el" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                  📊 當前音域摘要
                </h3>

                {loadingRange ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>載入中...</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }} className="range-summary-grid">
                    <div style={{ padding: '10px 12px', background: 'var(--bg-base)', borderRadius: '8px', borderLeft: '4px solid var(--accent-color)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>擅長音域 (舒適)</span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                        {comfortableLowest ? getPitchName(comfortableLowest) : '未設定'}
                      </strong>
                      <span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>~</span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                        {comfortableHighest ? getPitchName(comfortableHighest) : '未設定'}
                      </strong>
                    </div>

                    <div style={{ padding: '10px 12px', background: 'var(--bg-base)', borderRadius: '8px', borderLeft: '4px solid #38bdf8' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>可唱音域 (普通)</span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                        {singableLowest ? getPitchName(singableLowest) : '未設定'}
                      </strong>
                      <span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>~</span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                        {singableHighest ? getPitchName(singableHighest) : '未設定'}
                      </strong>
                    </div>

                    <div style={{ padding: '10px 12px', background: 'var(--bg-base)', borderRadius: '8px', borderLeft: '4px solid #6366f1' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>極限音域 (爆音)</span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                        {limitLowest ? getPitchName(limitLowest) : '未設定'}
                      </strong>
                      <span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>~</span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                        {limitHighest ? getPitchName(limitHighest) : '未設定'}
                      </strong>
                    </div>
                  </div>
                )}

                {/* 音域漸變視覺 Timeline */}
                {!loadingRange && (comfortableLowest || comfortableHighest || singableLowest || singableHighest || limitLowest || limitHighest) && (
                  <div>
                    <div className="range-timeline-container">
                      {/* 極限音域區段 */}
                      {limitLowest && limitHighest && (
                        <div
                          className="timeline-limit-segment"
                          style={{
                            left: `${timelineRange.llPct}%`,
                            width: `${timelineRange.lhPct - timelineRange.llPct}%`
                          }}
                        />
                      )}
                      {/* 可唱音域區段 */}
                      {singableLowest && singableHighest && (
                        <div
                          className="timeline-singable-segment"
                          style={{
                            left: `${timelineRange.slPct}%`,
                            width: `${timelineRange.shPct - timelineRange.slPct}%`
                          }}
                        />
                      )}
                      {/* 舒適音域區段 */}
                      {comfortableLowest && comfortableHighest && (
                        <div
                          className="timeline-comfortable-segment"
                          style={{
                            left: `${timelineRange.clPct}%`,
                            width: `${timelineRange.chPct - timelineRange.clPct}%`
                          }}
                        />
                      )}
                      {/* 指標 Pin */}
                      {limitLowest && <div className="timeline-pin pin-limit" style={{ left: `${timelineRange.llPct}%` }} data-label="極限低" />}
                      {singableLowest && <div className="timeline-pin pin-singable" style={{ left: `${timelineRange.slPct}%` }} data-label="可唱低" />}
                      {comfortableLowest && <div className="timeline-pin" style={{ left: `${timelineRange.clPct}%` }} data-label="擅長低" />}
                      {comfortableHighest && <div className="timeline-pin" style={{ left: `${timelineRange.chPct}%` }} data-label="擅長高" />}
                      {singableHighest && <div className="timeline-pin pin-singable" style={{ left: `${timelineRange.shPct}%` }} data-label="可唱高" />}
                      {limitHighest && <div className="timeline-pin pin-limit" style={{ left: `${timelineRange.lhPct}%` }} data-label="極限高" />}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', padding: '0 10px', marginTop: '16px' }}>
                      <span>低音 (lowA)</span>
                      <span>高音 (hihiG#)</span>
                    </div>
                  </div>
                )}
              </div>



              {/* 3. 使用說明說明書 */}
              <div className="card-el" style={{ padding: '24px', backgroundColor: 'var(--bg-surface)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>📖 如何標記我的音域？</h3>
                <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '20px', lineHeight: '1.8' }}>
                  <li><b>極限最低 / 最高</b>：您能夠發出聲音的最大極限範圍（即使聲音顫抖或破音）。</li>
                  <li><b>可唱最低 / 最高</b>：介在舒適跟不舒適之間，能唱但沒有那麼擅長的範圍。</li>
                  <li><b>擅長最低 / 最高</b>：您在 KTV 或平常唱歌時能保持穩定、舒適且音色好聽的常用音域範圍。</li>
                  <li>在右方的表格中，對應您想要的音高按鈕點擊即可，系統會<b>自動套用合理的連動邏輯</b>，防止邊界互相矛盾。</li>
                  <li>若想從頭開始，請點擊下方清除按鈕。</li>
                </ul>
                <button
                  onClick={handleClearAll}
                  className="btn btn-danger"
                  style={{ marginTop: '20px', padding: '6px 14px', fontSize: '12px', backgroundColor: '#ef444450', border: '1px solid #ef4444aa', color: '#dc2626', fontWeight: '600' }}
                >
                  清除所有音域設定
                </button>
              </div>

            </div>

            {/* 右欄：音域對照表 List，可點選設定 */}
            <div className="card-el" style={{ padding: '0px', overflow: 'hidden' }}>
              <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>📊 音高選擇列表 (由高至低)</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>共 60 階</span>
              </div>

              <div className="pitch-table-card">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-surface)', zIndex: 10, borderBottom: '1px solid var(--border-color)' }}>
                    <tr>
                      <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-muted)', width: '120px' }}>音名 (日文/科學)</th>
                      <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', width: '270px' }}>設定低音邊界</th>
                      <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', width: '270px' }}>設定高音邊界</th>
                      <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>「會唱」歌曲對照</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pitchHierarchy.map((p) => {
                      const isLL = limitLowest === p.order;
                      const isSL = singableLowest === p.order;
                      const isCL = comfortableLowest === p.order;
                      const isCH = comfortableHighest === p.order;
                      const isSH = singableHighest === p.order;
                      const isLH = limitHighest === p.order;

                      return (
                        <tr
                          key={p.order}
                          className={`pitch-row-interactive ${getRowHighlightClass(p.order)}`}
                          style={{ borderBottom: '1px solid var(--border-color)' }}
                        >
                          {/* 音階標題 */}
                          <td style={{ padding: '10px 16px', fontSize: '13px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div>
                                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{p.jp}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>({p.en})</span>
                              </div>
                              {/* 公開音域的使用者參考 */}
                              {(() => {
                                const matchesPublic = publicRanges.map(user => {
                                  const boundaries = [];
                                  if (user.comfortableLowest === p.order) boundaries.push('擅長低');
                                  if (user.comfortableHighest === p.order) boundaries.push('擅長高');
                                  if (user.singableLowest === p.order) boundaries.push('可唱低');
                                  if (user.singableHighest === p.order) boundaries.push('可唱高');
                                  if (user.limitLowest === p.order) boundaries.push('極限低');
                                  if (user.limitHighest === p.order) boundaries.push('極限高');

                                  if (boundaries.length > 0) {
                                    return {
                                      nickname: user.nickname,
                                      label: boundaries.join('、')
                                    };
                                  }
                                  return null;
                                }).filter(Boolean) as Array<{ nickname: string, label: string }>;

                                if (matchesPublic.length === 0) return null;

                                return (
                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    marginTop: '4px',
                                    fontSize: '10px',
                                    color: 'var(--text-secondary)'
                                  }}>
                                    {matchesPublic.map((m, idx) => (
                                      <span key={idx} style={{
                                        backgroundColor: 'var(--bg-base)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px',
                                        padding: '1px 5px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        width: 'fit-content',
                                        gap: '2px',
                                        fontSize: '9px',
                                        whiteSpace: 'nowrap'
                                      }} title={`${m.nickname} 在此音階之音域邊界：${m.label}`}>
                                        👤 {m.nickname}: <strong style={{ color: 'var(--accent-text-dark)' }}>{m.label}</strong>
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </td>

                          {/* 低音按鈕組 */}
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                onClick={() => handleSetBoundary('limitLowest', p.order)}
                                className={`boundary-button ${isLL ? 'active-LL' : ''}`}
                                title="設為極限最低音"
                              >
                                極限
                              </button>
                              <button
                                onClick={() => handleSetBoundary('singableLowest', p.order)}
                                className={`boundary-button ${isSL ? 'active-SL' : ''}`}
                                title="設為可唱最低音"
                              >
                                可唱
                              </button>
                              <button
                                onClick={() => handleSetBoundary('comfortableLowest', p.order)}
                                className={`boundary-button ${isCL ? 'active-CL' : ''}`}
                                title="設為擅長最低音"
                              >
                                擅長
                              </button>
                            </div>
                          </td>

                          {/* 高音按鈕組 */}
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                onClick={() => handleSetBoundary('comfortableHighest', p.order)}
                                className={`boundary-button ${isCH ? 'active-CH' : ''}`}
                                title="設為擅長最高音"
                              >
                                擅長
                              </button>
                              <button
                                onClick={() => handleSetBoundary('singableHighest', p.order)}
                                className={`boundary-button ${isSH ? 'active-SH' : ''}`}
                                title="設為可唱最高音"
                              >
                                可唱
                              </button>
                              <button
                                onClick={() => handleSetBoundary('limitHighest', p.order)}
                                className={`boundary-button ${isLH ? 'active-LH' : ''}`}
                                title="設為極限最高音"
                              >
                                極限
                              </button>
                            </div>
                          </td>

                          {/* 「會唱」歌曲對照 */}
                          <td style={{ padding: '10px 16px', fontSize: '12px', minWidth: '220px' }}>
                            {loadingSongs ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>載入中...</span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {pitchSongsMap.highest[p.jp] && pitchSongsMap.highest[p.jp].length > 0 && (
                                  <div>
                                    <div style={{
                                      color: '#ef4444',
                                      fontSize: '10px',
                                      fontWeight: 'bold',
                                      marginBottom: '4px'
                                    }}>最高音</div>
                                    <div style={{ paddingLeft: '4px' }}>
                                      {renderSongsByBrand(pitchSongsMap.highest[p.jp], `${p.order}_highest`)}
                                    </div>
                                  </div>
                                )}
                                {pitchSongsMap.lowest[p.jp] && pitchSongsMap.lowest[p.jp].length > 0 && (
                                  <div>
                                    <div style={{
                                      color: '#0284c7',
                                      fontSize: '10px',
                                      fontWeight: 'bold',
                                      marginBottom: '4px'
                                    }}>最低音</div>
                                    <div style={{ paddingLeft: '4px' }}>
                                      {renderSongsByBrand(pitchSongsMap.lowest[p.jp], `${p.order}_lowest`)}
                                    </div>
                                  </div>
                                )}
                                {(!pitchSongsMap.highest[p.jp] || pitchSongsMap.highest[p.jp].length === 0) &&
                                  (!pitchSongsMap.lowest[p.jp] || pitchSongsMap.lowest[p.jp].length === 0) && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.5 }}>—</span>
                                  )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'recommend' && (
          /* 音域推薦分頁 */
          <div>
            {comfortableLowest === null || comfortableHighest === null ? (
              /* 未設定音域之警告提示 */
              <div className="card-el" style={{ textAlign: 'center', padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>請先完成您的擅長音域設定</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
                  系統需要獲取您的「擅長最低音」與「擅長最高音」數值，才能依據資料庫中所有歌曲的音域進行交叉比對與個性化分類推薦。
                </p>
                <button onClick={() => setActiveTab('settings')} className="btn btn-primary">
                  前往設定音域
                </button>
              </div>
            ) : (
              /* 已設定音域，顯示推薦分類列表 */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* 頂部音域摘要卡 */}
                <div className="card-el" style={{ padding: '20px 24px', background: 'var(--bg-surface)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>🎯 您的擅長音域範圍</h3>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--accent-text-dark)' }}>
                      {getPitchName(comfortableLowest)}
                    </span>
                    <span style={{ fontSize: '16px', color: 'var(--text-muted)' }}>至</span>
                    <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--accent-text-dark)' }}>
                      {getPitchName(comfortableHighest)}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '12px' }}>
                      (共計 {comfortableHighest - comfortableLowest + 1} 階階梯)
                    </span>
                  </div>
                </div>

                {/* 篩選卡片 */}
                <div className="card-el" style={{ padding: '20px 24px', background: 'var(--bg-surface)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px', alignItems: 'center' }} className="adjust-filters-grid">
                    {/* 搜尋歌名、歌手 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>🔍 搜尋歌名、歌手或團體</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          value={recommendSearch}
                          onChange={(e) => setRecommendSearch(e.target.value)}
                          placeholder="搜尋歌名、歌手、聲優、組合..."
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-base)',
                            color: 'var(--text-primary)',
                            fontSize: '14px',
                            outline: 'none',
                          }}
                        />
                        {recommendSearch && (
                          <button
                            onClick={() => setRecommendSearch('')}
                            style={{
                              position: 'absolute',
                              right: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: '16px'
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 企劃篩選 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>🏢 偶像品牌</label>
                      <select
                        value={recommendBrand}
                        onChange={(e) => setRecommendBrand(e.target.value)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-base)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="all">所有企劃 (ALL)</option>
                        <option value="music_as">765 PRO (AS)</option>
                        <option value="music_cg">Cinderella Girls (CG)</option>
                        <option value="music_ml">Million Live (ML)</option>
                        <option value="music_sidem">SideM (SideM)</option>
                        <option value="music_shiny">Shiny Colors (SC)</option>
                        <option value="music_gakuen">學園偶像大師 (学マス)</option>
                        <option value="music_876">vα-liv</option>
                        <option value="music_godo">合同曲 (全體)</option>
                      </select>
                    </div>

                    {/* 類型篩選 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>🎵 歌曲類型</label>
                      <select
                        value={recommendType}
                        onChange={(e) => setRecommendType(e.target.value)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-base)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="all">所有類型 (ALL)</option>
                        <option value="solo">個人曲 (Solo)</option>
                        <option value="unit">團體曲 (Unit)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 四大分類選擇卡 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  marginBottom: '10px'
                }} className="recommend-category-grid">
                  <button
                    onClick={() => setRecommendCategory('perfect')}
                    style={{
                      padding: '16px',
                      background: recommendCategory === 'perfect' ? 'var(--accent-glow-soft)' : 'var(--bg-surface)',
                      border: recommendCategory === 'perfect' ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>🟢</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>全部符合</div>
                    <span className="badge" style={{
                      display: 'inline-block',
                      marginTop: '6px',
                      padding: '2px 8px',
                      backgroundColor: recommendCategory === 'perfect' ? 'var(--accent-color)' : 'var(--bg-base)',
                      color: recommendCategory === 'perfect' ? 'var(--accent-on-color)' : 'var(--text-secondary)',
                      borderRadius: '99px',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}>{recommendations.perfect.length} 首</span>
                  </button>

                  <button
                    onClick={() => setRecommendCategory('lowSide')}
                    style={{
                      padding: '16px',
                      background: recommendCategory === 'lowSide' ? 'rgba(2, 132, 199, 0.08)' : 'var(--bg-surface)',
                      border: recommendCategory === 'lowSide' ? '2px solid #0284c7' : '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>🔵</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>偏低音</div>
                    <span className="badge" style={{
                      display: 'inline-block',
                      marginTop: '6px',
                      padding: '2px 8px',
                      backgroundColor: recommendCategory === 'lowSide' ? '#0284c7' : 'var(--bg-base)',
                      color: recommendCategory === 'lowSide' ? 'white' : 'var(--text-secondary)',
                      borderRadius: '99px',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}>{recommendations.lowSide.length} 首</span>
                  </button>

                  <button
                    onClick={() => setRecommendCategory('highSide')}
                    style={{
                      padding: '16px',
                      background: recommendCategory === 'highSide' ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface)',
                      border: recommendCategory === 'highSide' ? '2px solid #ef4444' : '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>🔴</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>偏高音</div>
                    <span className="badge" style={{
                      display: 'inline-block',
                      marginTop: '6px',
                      padding: '2px 8px',
                      backgroundColor: recommendCategory === 'highSide' ? '#ef4444' : 'var(--bg-base)',
                      color: recommendCategory === 'highSide' ? 'white' : 'var(--text-secondary)',
                      borderRadius: '99px',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}>{recommendations.highSide.length} 首</span>
                  </button>

                  <button
                    onClick={() => setRecommendCategory('bothSide')}
                    style={{
                      padding: '16px',
                      background: recommendCategory === 'bothSide' ? 'rgba(234, 88, 12, 0.08)' : 'var(--bg-surface)',
                      border: recommendCategory === 'bothSide' ? '2px solid #ea580c' : '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>🟠</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>兩端超出</div>
                    <span className="badge" style={{
                      display: 'inline-block',
                      marginTop: '6px',
                      padding: '2px 8px',
                      backgroundColor: recommendCategory === 'bothSide' ? '#ea580c' : 'var(--bg-base)',
                      color: recommendCategory === 'bothSide' ? 'white' : 'var(--text-secondary)',
                      borderRadius: '99px',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}>{recommendations.bothSide.length} 首</span>
                  </button>
                </div>

                {/* 說明卡 */}
                <div className="card-el" style={{ padding: '16px 20px', backgroundColor: 'var(--bg-surface)' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    {recommendCategory === 'perfect' && '💡 完美符合：這些歌曲的最高音和最低音，皆完完全全座落在您的「擅長音域」內，您可以輕鬆駕馭整首歌！'}
                    {recommendCategory === 'lowSide' && '💡 偏低歌曲：這些歌曲的最高音符合您的掌握，但最低音比您的擅長最低音還要低。已依據「最低音最接近」由近至遠排序展示，方便您挑選能勉強下探的低音曲目。'}
                    {recommendCategory === 'highSide' && '💡 偏高歌曲：這些歌曲的最低音符合您的掌握，但最高音比您的擅長最高音還要高。已依據「最高音最接近」由近至遠排序展示，方便您挑戰高音曲目！'}
                    {recommendCategory === 'bothSide' && '💡 兩端超出：這些歌曲的最低音偏低、且最高音偏高。已依據「兩邊超出數值之總和最低的歌曲」由近至遠排序展示，方便您找出橫跨音域最少、最容易挑戰的廣音域歌曲。'}
                  </p>
                </div>

                {/* 歌曲列表網格 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {loadingSongs ? (
                    <div className="card-el" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>載入歌曲清單中...</div>
                  ) : selectedCategorySongs.length === 0 ? (
                    <div className="card-el" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>沒有符合此分類的歌曲。</div>
                  ) : (
                    <>
                      {displayedSongs.map((song: any) => {
                        const brandColor = getBrandColor(song.brand);
                        const brandName = getBrandShortName(song.brand);
                        const accentTextColor = getAccentTextColor(brandColor);

                        return (
                          <div
                            key={song.id}
                            className="song-card"
                            style={{
                              padding: '16px 20px',
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-md)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '16px'
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => setSelectedSong(song)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    margin: 0,
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    color: 'var(--text-primary)',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    textAlign: 'left'
                                  }}
                                  title="點擊查看詳細資料與試聽"
                                >
                                  {song.title}
                                </button>
                                <span style={{
                                  backgroundColor: brandColor,
                                  color: accentTextColor,
                                  padding: '2px 8px',
                                  borderRadius: '99px',
                                  fontSize: '10px',
                                  fontWeight: 'bold'
                                }}>
                                  {brandName}
                                </span>
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                <span>音域：{song.lowestPitch || '--'} ~ {song.highestPitch || '--'}</span>
                                {song.musicType && <span style={{ marginLeft: '10px', opacity: 0.7 }}>({song.musicType.toUpperCase()})</span>}
                              </div>
                            </div>

                            {/* 推薦分析標籤 */}
                            <div style={{ textAlign: 'right' }}>
                              {recommendCategory === 'perfect' && (
                                <span style={{
                                  backgroundColor: 'rgba(13, 148, 136, 0.1)',
                                  color: '#0d9488',
                                  border: '1px solid rgba(13, 148, 136, 0.25)',
                                  padding: '4px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: '12px',
                                  fontWeight: '600'
                                }}>
                                  🟢 完美符合音域
                                </span>
                              )}
                              {recommendCategory === 'lowSide' && (
                                <span style={{
                                  backgroundColor: 'rgba(2, 132, 199, 0.08)',
                                  color: '#0284c7',
                                  border: '1px solid rgba(2, 132, 199, 0.15)',
                                  padding: '4px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: '12px',
                                  fontWeight: '600'
                                }}>
                                  ⚠️ 最低低了 {song.diffLow} 階
                                </span>
                              )}
                              {recommendCategory === 'highSide' && (
                                <span style={{
                                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.15)',
                                  padding: '4px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: '12px',
                                  fontWeight: '600'
                                }}>
                                  ⚠️ 最高高了 {song.diffHigh} 階
                                </span>
                              )}
                              {recommendCategory === 'bothSide' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                                  <span style={{
                                    backgroundColor: 'rgba(234, 88, 12, 0.08)',
                                    color: '#ea580c',
                                    border: '1px solid rgba(234, 88, 12, 0.15)',
                                    padding: '4px 10px',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '12px',
                                    fontWeight: '600'
                                  }}>
                                    ⚠️ 兩端超出 (共 {song.totalDiff} 階)
                                  </span>
                                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                    低 {song.diffLow} 階 / 高 {song.diffHigh} 階
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* 顯示更多按鈕 */}
                      {visibleRecommendCount < selectedCategorySongs.length && (
                        <button
                          onClick={() => setVisibleRecommendCount(prev => prev + 30)}
                          className="btn btn-secondary"
                          style={{
                            padding: '12px',
                            marginTop: '8px',
                            width: '100%',
                            fontSize: '14px',
                            fontWeight: '600'
                          }}
                        >
                          顯示更多歌曲 (還有 {selectedCategorySongs.length - visibleRecommendCount} 首)
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'adjustKey' && (
          /* 依照歌曲推薦調整 key 分頁 */
          <div>
            {comfortableLowest === null || comfortableHighest === null ? (
              /* 未設定音域之警告提示 */
              <div className="card-el" style={{ textAlign: 'center', padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>請先完成您的擅長音域設定</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
                  系統需要獲取您的「擅長最低音」與「擅長最高音」數值，才能依據歌曲的音域計算出推薦的 Key 值（調號升降）！
                </p>
                <button onClick={() => setActiveTab('settings')} className="btn btn-primary">
                  前往設定音域
                </button>
              </div>
            ) : (
              /* 已設定音域，顯示調整 key 推薦與篩選 */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* 篩選卡片 */}
                <div className="card-el" style={{ padding: '20px 24px', background: 'var(--bg-surface)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px', alignItems: 'center' }} className="adjust-filters-grid">
                    {/* 搜尋歌名、歌手 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>🔍 搜尋歌名</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          value={adjustSearch}
                          onChange={(e) => setAdjustSearch(e.target.value)}
                          placeholder="搜尋歌名、歌手、聲優、組合..."
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-base)',
                            color: 'var(--text-primary)',
                            fontSize: '14px',
                            outline: 'none',
                          }}
                        />
                        {adjustSearch && (
                          <button
                            onClick={() => setAdjustSearch('')}
                            style={{
                              position: 'absolute',
                              right: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: '16px'
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 企劃篩選 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>🏢 偶像品牌</label>
                      <select
                        value={adjustBrand}
                        onChange={(e) => setAdjustBrand(e.target.value)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-base)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="all">所有企劃 (ALL)</option>
                        <option value="music_as">765 PRO (AS)</option>
                        <option value="music_cg">Cinderella Girls (CG)</option>
                        <option value="music_ml">Million Live (ML)</option>
                        <option value="music_sidem">SideM (SideM)</option>
                        <option value="music_shiny">Shiny Colors (SC)</option>
                        <option value="music_gakuen">學園偶像大師 (学マス)</option>
                        <option value="music_876">vα-liv</option>
                        <option value="music_godo">合同曲 (全體)</option>
                      </select>
                    </div>

                    {/* 類型篩選 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>🎵 歌曲類型</label>
                      <select
                        value={adjustType}
                        onChange={(e) => setAdjustType(e.target.value)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-base)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="all">所有類型 (ALL)</option>
                        <option value="solo">個人曲 (Solo)</option>
                        <option value="unit">團體曲 (Unit)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 說明卡片 */}
                <div className="card-el" style={{ padding: '16px 20px', backgroundColor: 'var(--bg-surface)' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>🎹 推薦 Key 值計算說明：</h4>
                  <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '20px', lineHeight: '1.7', margin: 0 }}>
                    <li><strong>1️⃣ 最低音對齊 (Option 1)</strong>：將歌曲的最低音調至符合您的「擅長最低音」。例如：<code>+3</code> 代表 KTV 升 3 Key。</li>
                    <li><strong>2️⃣ 最高音對齊 (Option 2)</strong>：將歌曲的最高音調至符合您的「擅長最高音」。例如：<code>-2</code> 代表 KTV 降 2 Key。</li>
                    <li><strong>⚠️ 寬度超出警告</strong>：若歌曲音域跨度大於您的舒適音域，調 Key 後部分音符必會超出範圍，此時<strong>系統優先推薦使用「最低音對齊 (Option 1)」</strong>以保證低音唱得下去。</li>
                    <li><strong>✨ 免調整標籤</strong>：若歌曲原調之最高/最低音均在您的擅長音域內，則會顯示「原調即可完美唱完」之綠色標章。</li>
                  </ul>
                </div>

                {/* 歌曲列表網格 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {!(adjustSearch.trim() !== '' || adjustBrand !== 'all' || adjustType !== 'all') ? (
                    <div className="card-el" style={{ textAlign: 'center', padding: '50px 40px', color: 'var(--text-secondary)' }}>
                      <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔍</div>
                      <h4 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                        請先選擇至少一個篩選條件，或輸入關鍵字搜尋
                      </h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto', lineHeight: '1.6' }}>
                        您可以透過上方搜尋框輸入歌名，或是點選企劃團體、歌曲類型來篩選出您想要變調調整的歌曲。
                      </p>
                    </div>
                  ) : adjustFilteredSongs.length === 0 ? (
                    <div className="card-el" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      找不到符合篩選條件的歌曲。
                    </div>
                  ) : (
                    <>
                      {adjustFilteredSongs.slice(0, visibleAdjustCount).map((song: any) => (
                        <SongAdjustCard
                          key={song.id}
                          song={song}
                          comfortableLowest={comfortableLowest}
                          comfortableHighest={comfortableHighest}
                          getPitchName={getPitchName}
                          getBrandColor={getBrandColor}
                          getBrandShortName={getBrandShortName}
                          getAccentTextColor={getAccentTextColor}
                          setSelectedSong={setSelectedSong}
                        />
                      ))}

                      {/* 顯示更多按鈕 */}
                      {visibleAdjustCount < adjustFilteredSongs.length && (
                        <button
                          onClick={() => setVisibleAdjustCount(prev => prev + 30)}
                          className="btn btn-secondary"
                          style={{
                            padding: '12px',
                            marginTop: '8px',
                            width: '100%',
                            fontSize: '14px',
                            fontWeight: '600'
                          }}
                        >
                          顯示更多歌曲 (還有 {adjustFilteredSongs.length - visibleAdjustCount} 首)
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* RWD 手機版多欄改單欄樣式補充 */}
      <style>{`
        @media (max-width: 900px) {
          .collab-layout-grid {
            grid-template-columns: 1fr !important;
          }
        }
        
        @media (max-width: 768px) {
          .adjust-filters-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .adjust-options-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .option-border-responsive {
            border-right: none !important;
            border-bottom: 1px solid var(--border-color) !important;
            padding-right: 0 !important;
            padding-bottom: 16px !important;
          }
        }

        @media (max-width: 600px) {
          .range-summary-grid {
            grid-template-columns: 1fr !important;
          }
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* 歌曲詳細彈窗 */}
      <SongDetailModal
        song={selectedSong}
        onClose={() => setSelectedSong(null)}
        currentFamiliarity={selectedSong ? (selections[selectedSong.id] || 0) : 0}
        onSelectFamiliarity={(fam) => {
          if (selectedSong) handleSelect(selectedSong.id, fam);
        }}
      />
    </div>
  );
}
