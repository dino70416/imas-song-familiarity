'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import KamisabiCard from '../KamisabiCard';
import { RoomApiError, roomApi } from './roomApi';
import type { RoomSession } from './roomStorage';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';
import type { PlayerRow, TimelineResult, TimelineState } from '@/lib/kamisabiRoom/types';

interface TimelineGameProps {
  code: string;
  room: PublicRoom;
  players: PlayerRow[];
  me: PlayerRow | null;
  session: RoomSession | null;
  refresh: () => Promise<void>;
}

type Banner = { kind: 'ok' | 'bad' | 'info'; text: string };

/**
 * リリースタイムライン：手牌只從 /hand 拿（別人看不到），時間軸與手牌數是公開狀態。
 * 選一張手牌 → 點時間軸上的位置 → 伺服器驗證發行日順序。
 */
export default function TimelineGame({ code, room, players, me, session, refresh }: TimelineGameProps) {
  const state = room.state as TimelineState;
  const [hand, setHand] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Banner | null>(null);

  const songById = useMemo(() => new Map(room.songs.map((s) => [s.id, s])), [room.songs]);
  const nameOf = useCallback((id: string) => players.find((p) => p.id === id)?.name ?? '？', [players]);
  const turnPlayerId = state.order[state.turnSeat];
  const myTurn = !!me && turnPlayerId === me.id && !state.winnerId;

  // 每次房間版本變動就重抓手牌（放牌 / 罰抽後會變）
  const token = session?.token;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    roomApi.hand(code, token).then((r) => { if (!cancelled) setHand(r.hand); }).catch(() => {});
    return () => { cancelled = true; };
  }, [code, token, room.version]);

  const place = async (slot: number) => {
    if (!session || !selected || busy || !myTurn) return;
    const song = songById.get(selected);
    setBusy(true);
    try {
      const r = await roomApi.place(code, session.token, selected, slot);
      const drew = r.hand.length > hand.length;
      setHand(r.hand);
      setSelected(null);
      setMessage(
        r.correct
          ? { kind: 'ok', text: `正確！『${song?.title ?? '？'}』的發行日是 ${r.releaseDate}。${r.finished ? ' 你出完手牌了，獲勝！' : ''}` }
          : { kind: 'bad', text: `錯了…『${song?.title ?? '？'}』的發行日是 ${r.releaseDate}${drew ? '，罰抽一張' : ''}。` },
      );
    } catch (e) {
      setMessage({ kind: 'bad', text: e instanceof RoomApiError ? e.message : '連線失敗，請再試一次。' });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const describe = (r: TimelineResult): string =>
    `${nameOf(r.playerId)} 把『${songById.get(r.songId)?.title ?? '？'}』放在第 ${r.slot + 1} 個位置 → ${r.correct ? '正確' : `錯了（發行日 ${r.releaseDate}${r.drew ? '，罰抽一張' : ''}）`}`;

  const slotButton = (slot: number) => (
    <button
      key={`slot-${slot}`}
      type="button"
      className="kamisabi-slot"
      aria-label={`放在第 ${slot + 1} 個位置`}
      disabled={!myTurn || !selected || busy}
      onClick={() => place(slot)}
    >
      ＋
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="kamisabi-room-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700 }}>リリースタイムライン · 房間 {room.code} · 山札 {state.deckCount} 張</div>
        <div style={{ fontWeight: 900, color: myTurn ? '#166534' : 'var(--text-secondary)' }}>
          {state.winnerId ? `🏆 ${nameOf(state.winnerId)} 獲勝！` : myTurn ? '輪到你了！選一張手牌，再點時間軸上的位置' : `輪到 ${nameOf(turnPlayerId)}`}
        </div>
      </div>

      {!me && <div className="kamisabi-banner is-info">觀戰模式：遊戲開始後無法加入。</div>}
      {message && <div className={`kamisabi-banner is-${message.kind}`} role="status">{message.text}</div>}
      {state.lastResult && <div className="kamisabi-banner is-info">{describe(state.lastResult)}</div>}

      <div className="kamisabi-room-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', fontSize: '14px' }}>
        {state.order.map((pid) => (
          <span key={pid} style={{ fontWeight: pid === turnPlayerId ? 900 : 600, color: pid === turnPlayerId ? 'var(--accent-color)' : undefined }}>
            {pid === turnPlayerId ? '▶ ' : ''}{nameOf(pid)}：{state.handCounts[pid] ?? 0} 張
          </span>
        ))}
      </div>

      <div className="kamisabi-room-panel">
        <div style={{ fontWeight: 700, marginBottom: '4px' }}>時間軸（左舊 → 右新）</div>
        <div className="kamisabi-timeline" data-testid="timeline">
          {state.line.map((id, i) => {
            const s = songById.get(id);
            return (
              <React.Fragment key={id}>
                {slotButton(i)}
                {s && <KamisabiCard title={s.title} brand={s.brand} artworkUrl={s.artworkUrl} releaseDate={s.releaseDate} />}
              </React.Fragment>
            );
          })}
          {slotButton(state.line.length)}
        </div>
      </div>

      {me && (
        <div className="kamisabi-room-panel">
          <div style={{ fontWeight: 700 }}>你的手牌（{hand.length} 張）— 別偷看發行日！</div>
          <div className="kamisabi-hand">
            {hand.map((id) => {
              const s = songById.get(id);
              if (!s) return null;
              return (
                <KamisabiCard key={id} title={s.title} brand={s.brand} artworkUrl={s.artworkUrl} selected={selected === id} onClick={() => setSelected(selected === id ? null : id)} disabled={busy} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
