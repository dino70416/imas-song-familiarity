'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RoomApiError, roomApi } from './roomApi';
import { saveSession } from './roomStorage';
import type { KamisabiSong } from '../types';
import { BRAND_VALUES } from '@/lib/brandMap';
import { getBrandColor, getBrandDisplayName } from '@/lib/themeUtils';
import { BrandIcon } from '@/components/BrandIcon';
import { PLAYER_NAME_MAX, ROOM_CODE_LENGTH } from '@/lib/kamisabiRoom/types';

interface RoomEntryProps {
  allSongs: KamisabiSong[];
  brandCounts: Record<string, number>;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '12px', fontSize: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' };

/** /kamisabi 設定頁下方的「線上房間」入口：開房（品牌 + 標記シングル）或輸入房號加入 */
export default function RoomEntry({ allSongs, brandCounts }: RoomEntryProps) {
  const router = useRouter();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [singles, setSingles] = useState<string[]>([]);
  const [showSingles, setShowSingles] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brands = BRAND_VALUES.filter((b) => (brandCounts[b] ?? 0) > 0);
  const brandSongs = allSongs.filter((s) => s.brand === brand);

  const toggleSingle = (id: string) => setSingles((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = async () => {
    if (busy || !name.trim() || !brand) return;
    setBusy(true);
    setError(null);
    try {
      const r = await roomApi.create({ name: name.trim(), brand, singles });
      saveSession(r.code, { playerId: r.playerId, token: r.token, name: name.trim() });
      router.push(`/kamisabi/room/${r.code}`);
    } catch (e) {
      setError(e instanceof RoomApiError ? e.message : '開房失敗，請再試一次。');
      setBusy(false);
    }
  };

  const join = async () => {
    const c = code.trim().toUpperCase();
    if (busy || !name.trim() || c.length !== ROOM_CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const r = await roomApi.join(c, name.trim());
      saveSession(c, { playerId: r.playerId, token: r.token, name: name.trim() });
      router.push(`/kamisabi/room/${c}`);
    } catch (e) {
      setError(e instanceof RoomApiError ? e.message : '加入失敗，請再試一次。');
      setBusy(false);
    }
  };

  return (
    <div className="card-el" style={{ padding: '28px 32px', borderRadius: '24px', maxWidth: '640px', width: '100%', backgroundColor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)', textAlign: 'left', marginTop: '24px' }}>
      <h3 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 4px' }}>🌐 線上房間</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 16px', lineHeight: 1.6 }}>
        不在同一個房間也能玩：開房後把連結傳給朋友，大家在自己的手機上同時聽、同時搶虛擬歌牌。
      </p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button type="button" className={`btn ${tab === 'create' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('create'); setError(null); }}>開新房間</button>
        <button type="button" className={`btn ${tab === 'join' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('join'); setError(null); }}>加入房間</button>
      </div>

      <label htmlFor="room-name" style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>你的名字</label>
      <input id="room-name" value={name} maxLength={PLAYER_NAME_MAX} onChange={(e) => setName(e.target.value)} autoComplete="nickname" style={{ ...inputStyle, marginBottom: '16px' }} />

      {tab === 'create' ? (
        <>
          <p style={{ fontWeight: 700, margin: '0 0 8px' }}>歌牌品牌（一房一套）</p>
          <div className="brand-picker-grid" style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
            {brands.map((b) => {
              const checked = brand === b;
              const color = getBrandColor(b);
              return (
                <label key={b} className={`brand-card ${checked ? 'is-checked' : ''}`} style={checked ? { borderColor: color, backgroundColor: `${color}10`, cursor: 'pointer' } : { cursor: 'pointer' }}>
                  <input type="radio" name="room-brand" value={b} checked={checked} onChange={() => { setBrand(b); setSingles([]); }} className="sr-only" />
                  <span className="brand-card-icon"><BrandIcon brand={b} className="brand-card-svg" /></span>
                  <span className="brand-card-name" style={{ fontSize: '12px' }}>{getBrandDisplayName(b)}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted, #9ca3af)', whiteSpace: 'nowrap' }}>{brandCounts[b]} 首</span>
                </label>
              );
            })}
          </div>
          {brand && (
            <div style={{ marginBottom: '16px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowSingles((v) => !v)} style={{ fontSize: '13px' }}>
                {showSingles ? '▾' : '▸'} 標記シングル（2 分）{singles.length > 0 ? `：已選 ${singles.length} 首` : ''}
              </button>
              {showSingles && (
                <div style={{ maxHeight: '220px', overflowY: 'auto', marginTop: '8px', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'grid', gap: '4px' }}>
                  {brandSongs.map((s) => (
                    <label key={s.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={singles.includes(s.id)} onChange={() => toggleSingle(s.id)} />
                      {s.title}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {error && <div className="kamisabi-banner is-bad" style={{ marginBottom: '12px' }}>{error}</div>}
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim() || !brand} onClick={create} style={{ width: '100%', padding: '14px', fontSize: '18px', borderRadius: '14px' }}>
            開房
          </button>
        </>
      ) : (
        <>
          <label htmlFor="room-code" style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>房間代碼</label>
          <input
            id="room-code"
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="5 碼"
            style={{ ...inputStyle, letterSpacing: '0.2em', fontWeight: 900, marginBottom: '16px' }}
          />
          {error && <div className="kamisabi-banner is-bad" style={{ marginBottom: '12px' }}>{error}</div>}
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim() || code.trim().length !== ROOM_CODE_LENGTH} onClick={join} style={{ width: '100%', padding: '14px', fontSize: '18px', borderRadius: '14px' }}>
            加入
          </button>
        </>
      )}
    </div>
  );
}
