'use client';

import React, { useState } from 'react';
import { RoomApiError, roomApi } from './roomApi';
import type { RoomSession } from './roomStorage';
import { PLAYER_NAME_MAX } from '@/lib/kamisabiRoom/types';

interface JoinFormProps {
  code: string;
  onJoined: (session: RoomSession) => void;
}

/** 沒有這個房間的 session 時：輸入名字加入 */
export default function JoinForm({ code, onJoined }: JoinFormProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await roomApi.join(code, trimmed);
      onJoined({ playerId: r.playerId, token: r.token, name: trimmed });
    } catch (err) {
      setError(err instanceof RoomApiError ? err.message : '加入失敗，請再試一次。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '0 16px' }}>
      <form onSubmit={submit} className="card-el" style={{ padding: '32px', borderRadius: '24px', maxWidth: '420px', width: '100%', backgroundColor: 'rgba(255,255,255,0.85)' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 4px' }}>加入房間 {code}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 20px' }}>輸入大家認得出你的名字。</p>
        <label htmlFor="join-name" style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>你的名字</label>
        <input
          id="join-name"
          value={name}
          maxLength={PLAYER_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          autoComplete="nickname"
          style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '16px' }}
        />
        {error && <div className="kamisabi-banner is-bad" style={{ marginBottom: '12px' }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()} style={{ width: '100%', padding: '14px', fontSize: '18px', borderRadius: '14px' }}>
          加入房間
        </button>
      </form>
    </div>
  );
}
