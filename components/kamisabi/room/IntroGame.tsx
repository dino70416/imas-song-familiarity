'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import KamisabiCard from '../KamisabiCard';
import { RoomApiError, roomApi } from './roomApi';
import { useSyncedAudio } from './useSyncedAudio';
import type { RoomSession } from './roomStorage';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';
import type { IntroResult, IntroState, PlayerRow, RoomSong } from '@/lib/kamisabiRoom/types';
import { ttsFileUrl } from '@/lib/karutaTts';

interface IntroGameProps {
  code: string;
  room: PublicRoom;
  players: PlayerRow[];
  /** null = 觀戰（沒有 session 或已開始後才進來） */
  me: PlayerRow | null;
  session: RoomSession | null;
  refresh: () => Promise<void>;
  toLocalTime: (iso: string) => number;
}

type Banner = { kind: 'ok' | 'bad' | 'info'; text: string };

/**
 * イントロ / かるた 搶牌畫面。
 * 房主按「下一張」→ 伺服器寫 currentSongId + startsAt →
 * 每個瀏覽器自己預載試聽（イントロ）或朗讀檔（かるた），到 startsAt 同時播放 → 玩家點牌。
 */
export default function IntroGame({ code, room, players, me, session, refresh, toLocalTime }: IntroGameProps) {
  const state = room.state as IntroState;
  const isKaruta = room.mode === 'karuta';
  const audio = useSyncedAudio();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Banner | null>(null);
  const [flash, setFlash] = useState<{ songId: string; status: 'correct' | 'wrong' } | null>(null);
  const [discardCards, setDiscardCards] = useState<RoomSong[] | null>(null);
  const [audioNote, setAudioNote] = useState<string | null>(null);

  const songById = useMemo(() => new Map(room.songs.map((s) => [s.id, s])), [room.songs]);
  const sortedSongs = useMemo(() => [...room.songs].sort((a, b) => a.title.localeCompare(b.title, 'ja')), [room.songs]);
  const nameOf = useCallback((id: string) => players.find((p) => p.id === id)?.name ?? '？', [players]);
  const ownedBy = useCallback((playerId: string) => room.songs.filter((s) => state.taken[s.id] === playerId), [room.songs, state.taken]);

  const isHost = !!me?.is_host;
  const myPending = me ? state.pendingDiscards[me.id] ?? 0 : 0;
  const roundActive = !!state.currentSongId && !state.resolved;
  const remaining = room.songs.filter((s) => state.taken[s.id] === undefined).length;

  // 最新的 props 放 ref，讓「新回合」effect 只依賴 round key，不會每次輪詢都重排播放
  const latest = useRef({ songById, toLocalTime, isKaruta, code, token: session?.token ?? null, audio });
  latest.current = { songById, toLocalTime, isKaruta, code, token: session?.token ?? null, audio };

  const roundKey = `${state.round}:${state.currentSongId ?? ''}`;
  useEffect(() => {
    if (!state.currentSongId || !state.startsAt) return;
    const { songById, toLocalTime, isKaruta, code, token, audio } = latest.current;
    const song = songById.get(state.currentSongId);
    if (!song) return;
    const at = toLocalTime(state.startsAt);
    let cancelled = false;
    setAudioNote(null);
    setFlash(null);
    audio.stop();

    if (!isKaruta) {
      roomApi
        .preview(song.trackId)
        .then((p) => { if (!cancelled) audio.scheduleAudio(p.previewUrl, at); })
        .catch(() => { if (!cancelled) setAudioNote('這首歌的試聽暫時無法取得，請聽其他人的裝置。'); });
    } else {
      const url = ttsFileUrl(song.id);
      fetch(url, { method: 'HEAD' })
        .then(async (r) => {
          if (cancelled) return;
          if (r.ok) { audio.scheduleAudio(url, at); return; }
          if (!token) { setAudioNote('這首歌還沒有朗讀檔。'); return; }
          try {
            const { text } = await roomApi.lyrics(code, token, song.id);
            if (!cancelled && !audio.scheduleSpeech(text, at)) setAudioNote('此裝置無法朗讀，請聽其他人的裝置。');
          } catch {
            if (!cancelled) setAudioNote('這首歌還沒有朗讀檔。');
          }
        })
        .catch(() => { if (!cancelled) setAudioNote('無法載入朗讀檔。'); });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在新回合時重排播放（其餘值走 latest ref）
  }, [roundKey, state.startsAt]);

  // 有人取得 → 全員停止播放
  const stopAudio = audio.stop;
  useEffect(() => { if (state.resolved) stopAudio(); }, [state.resolved, stopAudio]);

  // 重新整理後若還有待丟的牌，自動打開對話框
  useEffect(() => {
    if (me && myPending > 0 && !discardCards) setDiscardCards(ownedBy(me.id));
  }, [me, myPending, discardCards, ownedBy]);

  // 綠框 / 紅框只閃一下
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  const claim = async (song: RoomSong) => {
    if (!session || !me || busy) return;
    if (!roundActive) { setMessage({ kind: 'info', text: '等房主出下一張再搶！' }); return; }
    if (myPending > 0) { setMessage({ kind: 'bad', text: 'お手つき！請先選一張自己的牌丟回場上。' }); setDiscardCards(ownedBy(me.id)); return; }
    setBusy(true);
    try {
      const r = await roomApi.claim(code, session.token, song.id);
      if (r.result === 'correct') {
        setFlash({ songId: song.id, status: 'correct' });
        setMessage({ kind: 'ok', text: `取得『${song.title}』！${song.points === 2 ? '（シングル 2 分）' : ''}` });
        audio.stop();
      } else {
        setFlash({ songId: song.id, status: 'wrong' });
        if (r.result === 'otetsuki') {
          setMessage({ kind: 'bad', text: 'お手つき！選一張自己的牌丟回場上。' });
          setDiscardCards(r.cards);
        } else {
          setMessage({ kind: 'bad', text: 'お手つき！（還沒有牌可丟，繼續加油）' });
        }
      }
    } catch (e) {
      setMessage({ kind: 'bad', text: e instanceof RoomApiError ? e.message : '連線失敗，請再試一次。' });
      if (e instanceof RoomApiError && e.code === 'DISCARD_PENDING') setDiscardCards(ownedBy(me.id));
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const discard = async (songId: string) => {
    if (!session || busy) return;
    setBusy(true);
    try {
      await roomApi.discard(code, session.token, songId);
      setDiscardCards(null);
      setMessage({ kind: 'info', text: '已把牌丟回場上。' });
    } catch (e) {
      setMessage({ kind: 'bad', text: e instanceof RoomApiError ? e.message : '連線失敗，請再試一次。' });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const nextCard = async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      const r = await roomApi.next(code, session.token);
      setMessage(r.finished ? { kind: 'ok', text: '所有歌牌都取完了！' } : null);
    } catch (e) {
      setMessage({ kind: 'bad', text: e instanceof RoomApiError ? e.message : '連線失敗，請再試一次。' });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const endGame = async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      await roomApi.end(code, session.token);
    } catch (e) {
      setMessage({ kind: 'bad', text: e instanceof RoomApiError ? e.message : '連線失敗，請再試一次。' });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const describe = (r: IntroResult): string => {
    const title = songById.get(r.songId)?.title ?? '？';
    if (r.type === 'correct') return `${nameOf(r.playerId)} 取得了『${title}』！`;
    if (r.type === 'otetsuki') return `${nameOf(r.playerId)} お手つき！`;
    return `${nameOf(r.playerId)} 把『${title}』丟回場上。`;
  };

  const playStatus = audio.playing ? '🎵 播放中…' : roundActive ? '⏳ 準備播放…' : state.resolved ? '✅ 本回合結束' : '等待房主出題';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <audio ref={audio.audioRef} preload="auto" onEnded={audio.onEnded} data-testid="room-audio" />

      <div className="kamisabi-room-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700 }}>
          {isKaruta ? 'かるたモード' : 'イントロモード'} · 房間 {room.code} · 第 <strong style={{ fontSize: '22px', color: 'var(--accent-color)' }}>{state.round}</strong> 張 · 剩 {remaining} 張
        </div>
        {!audio.unlocked ? (
          <button type="button" className="btn btn-primary" onClick={audio.unlock} style={{ fontWeight: 900 }}>🔊 準備完成</button>
        ) : (
          <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{playStatus}</span>
        )}
        {isHost && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={nextCard}>▶ 下一張</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={endGame}>結束遊戲</button>
          </div>
        )}
      </div>

      {!me && <div className="kamisabi-banner is-info">觀戰模式：遊戲開始後無法加入，只能看大家搶牌。</div>}
      {audioNote && <div className="kamisabi-banner is-bad">{audioNote}</div>}
      {message && <div className={`kamisabi-banner is-${message.kind}`} role="status">{message.text}</div>}
      {state.lastResult && <div className="kamisabi-banner is-info">{describe(state.lastResult)}</div>}

      <div className="kamisabi-room-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', fontSize: '14px' }}>
        {players.map((p) => (
          <span key={p.id} style={{ fontWeight: p.id === me?.id ? 900 : 600 }}>
            {p.is_host ? '👑 ' : ''}{p.name}：{state.scores[p.id] ?? 0} 分
            {(state.pendingDiscards[p.id] ?? 0) > 0 ? '（お手つき待丟）' : ''}
          </span>
        ))}
      </div>

      <div className="kamisabi-card-grid" data-testid="card-grid">
        {sortedSongs.map((s) => {
          const takenBy = state.taken[s.id];
          return (
            <KamisabiCard
              key={s.id}
              title={s.title}
              brand={s.brand}
              artworkUrl={s.artworkUrl}
              points={s.points}
              takenBy={takenBy ? nameOf(takenBy) : null}
              status={flash?.songId === s.id ? flash.status : null}
              onClick={me ? () => claim(s) : undefined}
              disabled={!me || !!takenBy || busy}
            />
          );
        })}
      </div>

      {discardCards && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="お手つき：選一張牌丟回場上"
          className="kamisabi-room-panel"
          style={{ position: 'fixed', left: '16px', right: '16px', bottom: '16px', zIndex: 50, boxShadow: 'var(--shadow-lg)', border: '2px solid #ef4444' }}
        >
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 900, color: '#991b1b' }}>お手つき！選一張自己的牌丟回場上</h3>
          {discardCards.length === 0 ? (
            <p style={{ margin: 0 }}>你手上沒有牌可丟。</p>
          ) : (
            <div className="kamisabi-hand">
              {discardCards.map((c) => (
                <KamisabiCard key={c.id} title={c.title} brand={c.brand} artworkUrl={c.artworkUrl} points={c.points} onClick={() => discard(c.id)} disabled={busy} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
