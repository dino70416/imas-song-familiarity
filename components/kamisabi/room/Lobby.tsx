'use client';

import React, { useState } from 'react';
import { RoomApiError, roomApi } from './roomApi';
import type { RoomSession } from './roomStorage';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';
import { MAX_PLAYERS, MIN_PLAYERS, ROOM_MODES, ROOM_MODE_LABEL, type PlayerRow, type RoomMode } from '@/lib/kamisabiRoom/types';
import { getBrandDisplayName } from '@/lib/themeUtils';

interface LobbyProps {
  code: string;
  room: PublicRoom;
  players: PlayerRow[];
  me: PlayerRow;
  session: RoomSession;
  refresh: () => Promise<void>;
}

const MODE_HINT: Record<RoomMode, string> = {
  intro: '房主按「下一張」後 3 秒，所有人同時聽 30 秒試聽，聽出是哪首就點那張歌牌。點錯要把自己的一張牌丟回場上。アルバム 1 分、シングル 2 分。',
  karuta: '同イントロ，但播的是副歌歌詞的朗讀（沒有朗讀檔的歌會用裝置的語音合成）。',
  timeline: '每人 5 張手牌（不能看發行日），輪流把牌放進時間軸。放錯罰抽一張，先出完手牌的人贏。2–8 人。',
};

/** 大廳：顯示房號、玩家；房主選玩法開始 */
export default function Lobby({ code, room, players, me, session, refresh }: LobbyProps) {
  const [mode, setMode] = useState<RoomMode>('intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/kamisabi/room/${room.code}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await roomApi.start(code, session.token, mode);
    } catch (e) {
      setError(e instanceof RoomApiError ? e.message : '開始失敗，請再試一次。');
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const enough = players.length >= MIN_PLAYERS;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '0 16px' }}>
      <div className="card-el" style={{ padding: '32px', borderRadius: '24px', maxWidth: '560px', width: '100%', backgroundColor: 'rgba(255,255,255,0.85)' }}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontWeight: 700 }}>房間代碼</p>
        <div style={{ fontSize: '48px', fontWeight: 900, letterSpacing: '0.2em', margin: '4px 0 8px' }}>{room.code}</div>
        <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          {getBrandDisplayName(room.brand)} · {room.songs.length} 張歌牌
        </p>
        <button type="button" className="btn btn-secondary" onClick={copyLink} style={{ marginBottom: '20px' }}>
          {copied ? '✅ 已複製邀請連結' : '🔗 複製邀請連結'}
        </button>

        <h3 style={{ fontSize: '16px', fontWeight: 900, margin: '0 0 8px' }}>玩家（{players.length}/{MAX_PLAYERS}）</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {players.map((p) => (
            <li key={p.id} style={{ padding: '6px 12px', borderRadius: '999px', background: p.id === me.id ? 'var(--accent-color)' : '#eef2ff', color: p.id === me.id ? '#fff' : '#3730a3', fontWeight: 700 }}>
              {p.is_host ? '👑 ' : ''}{p.name}{p.id === me.id ? '（你）' : ''}
            </li>
          ))}
        </ul>

        {me.is_host ? (
          <fieldset style={{ border: 'none', padding: 0, margin: 0, textAlign: 'left' }}>
            <legend style={{ fontWeight: 900, marginBottom: '8px' }}>選擇玩法</legend>
            {ROOM_MODES.map((m) => (
              <label key={m} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}>
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                {ROOM_MODE_LABEL[m]}
              </label>
            ))}
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 16px' }}>{MODE_HINT[mode]}</p>
            {error && <div className="kamisabi-banner is-bad" style={{ marginBottom: '12px' }}>{error}</div>}
            <button type="button" className="btn btn-primary" disabled={!enough || busy} onClick={start} style={{ width: '100%', padding: '14px', fontSize: '18px', borderRadius: '14px' }}>
              開始遊戲
            </button>
            {!enough && <p style={{ fontSize: '13px', color: '#b91c1c', marginTop: '8px' }}>至少需要 {MIN_PLAYERS} 位玩家，把邀請連結傳給朋友吧。</p>}
          </fieldset>
        ) : (
          <p style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>⏳ 等待房主開始遊戲…</p>
        )}
      </div>
    </div>
  );
}
