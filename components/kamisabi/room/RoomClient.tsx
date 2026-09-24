'use client';

import React, { useMemo, useState } from 'react';
import { useRoom } from './useRoom';
import { loadSession, saveSession, type RoomSession } from './roomStorage';
import JoinForm from './JoinForm';
import Lobby from './Lobby';
import Results from './Results';
import IntroGame from './IntroGame';
import TimelineGame from './TimelineGame';
import { isIntroState, isTimelineState } from '@/lib/kamisabiRoom/types';

/**
 * /kamisabi/room/[code]：依房間狀態分派畫面。
 * session 在 localStorage；沒有 session 而房間已開始 → 觀戰。
 */
export default function RoomClient({ code }: { code: string }) {
  const { room, players, loading, error, refresh, toLocalTime } = useRoom(code);
  // 首次 render 兩端都是 loading 畫面，session 不影響 SSR 標記，可以直接用 lazy initializer 讀 localStorage
  const [session, setSession] = useState<RoomSession | null>(() => loadSession(code));

  const me = useMemo(() => (session ? players.find((p) => p.id === session.playerId) ?? null : null), [players, session]);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin" style={{ width: '64px', height: '64px', borderRadius: '50%', borderTop: '4px solid var(--accent-color)', borderBottom: '4px solid var(--accent-color)', opacity: 0.8 }} />
      </div>
    );
  }

  // 從來沒載入成功（找不到房間 / 一開始就斷線）→ 整頁錯誤
  if (!room) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
        <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '20px 24px', borderRadius: '16px', border: '1px solid #fecaca', textAlign: 'center' }}>
          <p style={{ fontWeight: 'bold', fontSize: '18px', margin: '0 0 12px' }}>⚠️ {error ?? '無法載入房間'}</p>
          <a href="/kamisabi" className="btn btn-secondary">回到 KAMISABI</a>
        </div>
      </div>
    );
  }

  let view: React.ReactNode = null;
  if (room.status === 'lobby') {
    view = !me || !session ? (
      <JoinForm
        code={code}
        onJoined={(s) => {
          saveSession(code, s);
          setSession(s);
          refresh();
        }}
      />
    ) : (
      <Lobby code={code} room={room} players={players} me={me} session={session} refresh={refresh} />
    );
  } else if (room.status === 'finished') {
    view = <Results room={room} players={players} />;
  } else if (isTimelineState(room.state)) {
    view = <TimelineGame code={code} room={room} players={players} me={me} session={me ? session : null} refresh={refresh} />;
  } else if (isIntroState(room.state)) {
    view = <IntroGame code={code} room={room} players={players} me={me} session={me ? session : null} refresh={refresh} toLocalTime={toLocalTime} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 已載入過的房間遇到暫時性錯誤：留在原畫面、只顯示提示，輪詢會自動重試 */}
      {error && <div className="kamisabi-banner is-bad" role="alert">⚠️ {error}（正在重試…）</div>}
      {view}
    </div>
  );
}
