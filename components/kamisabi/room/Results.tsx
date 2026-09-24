import React from 'react';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';
import { isIntroState, isTimelineState, type PlayerRow } from '@/lib/kamisabiRoom/types';

interface ResultsProps {
  room: PublicRoom;
  players: PlayerRow[];
}

/** 結算：搶牌模式排名；時間軸模式顯示勝者 */
export default function Results({ room, players }: ResultsProps) {
  const state = room.state;
  let body: React.ReactNode = null;

  if (isTimelineState(state)) {
    const winner = players.find((p) => p.id === state.winnerId);
    body = <p style={{ fontSize: '24px', fontWeight: 900 }}>{winner ? `🏆 ${winner.name} 獲勝！` : '房主結束了遊戲。'}</p>;
  } else if (isIntroState(state)) {
    const ranking = [...players].sort((a, b) => (state.scores[b.id] ?? 0) - (state.scores[a.id] ?? 0));
    const cardsOf = (id: string) => Object.values(state.taken).filter((pid) => pid === id).length;
    body = (
      <ol style={{ textAlign: 'left', margin: '0 auto', maxWidth: '360px', padding: 0, listStyle: 'none' }}>
        {ranking.map((p, i) => (
          <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '12px', background: i === 0 ? '#fef3c7' : '#f8fafc', marginBottom: '8px', fontWeight: i === 0 ? 900 : 600 }}>
            <span>{i === 0 ? '🏆 ' : `${i + 1}. `}{p.name}</span>
            <span>{state.scores[p.id] ?? 0} 分（{cardsOf(p.id)} 張）</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '0 16px', textAlign: 'center' }}>
      <div className="card-el" style={{ padding: '40px', borderRadius: '32px', maxWidth: '520px', width: '100%', backgroundColor: 'rgba(255,255,255,0.85)' }}>
        <div style={{ fontSize: '56px', marginBottom: '12px' }}>🏁</div>
        <h2 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '16px' }}>遊戲結束</h2>
        {body}
        <a href="/kamisabi" className="btn btn-primary" style={{ display: 'inline-block', marginTop: '24px', padding: '14px 32px', fontSize: '18px', borderRadius: '14px' }}>
          回到 KAMISABI
        </a>
      </div>
    </div>
  );
}
