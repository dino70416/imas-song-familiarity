'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  const [session, setSession] = useState<RoomSession | null>(null);

  useEffect(() => {
    setSession(loadSession(code));
  }, [code]);

  const me = useMemo(() => (session ? players.find((p) => p.id === session.playerId) ?? null : null), [players, session]);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin" style={{ width: '64px', height: '64px', borderRadius: '50%', borderTop: '4px solid var(--accent-color)', borderBottom: '4px solid var(--accent-color)', opacity: 0.8 }} />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
        <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '20px 24px', borderRadius: '16px', border: '1px solid #fecaca', textAlign: 'center' }}>
          <p style={{ fontWeight: 'bold', fontSize: '18px', margin: '0 0 12px' }}>⚠️ {error ?? '無法載入房間'}</p>
          <a href="/kamisabi" className="btn btn-secondary">回到 KAMISABI</a>
        </div>
      </div>
    );
  }

  if (room.status === 'lobby') {
    if (!me || !session) {
      return (
        <JoinForm
          code={code}
          onJoined={(s) => {
            saveSession(code, s);
            setSession(s);
            refresh();
          }}
        />
      );
    }
    return <Lobby code={code} room={room} players={players} me={me} session={session} refresh={refresh} />;
  }

  if (room.status === 'finished') return <Results room={room} players={players} />;

  if (isTimelineState(room.state)) {
    return <TimelineGame code={code} room={room} players={players} me={me} session={me ? session : null} refresh={refresh} />;
  }
  if (isIntroState(room.state)) {
    return <IntroGame code={code} room={room} players={players} me={me} session={me ? session : null} refresh={refresh} toLocalTime={toLocalTime} />;
  }
  return null;
}
