'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import KamisabiCard from '../KamisabiCard';
import { RoomApiError, roomApi } from './roomApi';
import { useSyncedAudio } from './useSyncedAudio';
import type { RoomSession } from './roomStorage';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';
import type { IntroResult, IntroState, PlayerRow, RoomSong } from '@/lib/kamisabiRoom/types';
import { allReady, nextCardDueAt } from '@/lib/kamisabiRoom/logic';
import { ttsFileUrl } from '@/lib/karutaTts';

/** 非房主的瀏覽器晚這麼久才觸發自動換題（當房主分頁沒開時的備援） */
const FALLBACK_DELAY_MS = 2000;

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
 * 所有人按「準備完成」（解鎖音訊並回報伺服器）→ 房主按「遊戲開始」出第一張 →
 * 每個瀏覽器自己預載試聽（イントロ）或朗讀檔（かるた），到 startsAt 同時播放 → 玩家點牌。
 * 之後沒有「下一張」按鈕：有人取得後 5 秒、沒人答對 35 秒，瀏覽器自動呼叫 /next。
 */
export default function IntroGame({ code, room, players, me, session, refresh, toLocalTime }: IntroGameProps) {
  const state = room.state as IntroState;
  const isKaruta = room.mode === 'karuta';
  const { audioRef, unlocked, unlock, playing, scheduleAudio, scheduleSpeech, stop, onEnded } = useSyncedAudio();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Banner | null>(null);
  const [flash, setFlash] = useState<{ songId: string; status: 'correct' | 'wrong' } | null>(null);
  /** 伺服器回的可丟牌清單（お手つき 當下）；null 時退回用公開狀態推導 */
  const [discardCards, setDiscardCards] = useState<RoomSong[] | null>(null);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  /** 倒數顯示用的本機時鐘（每秒更新） */
  const [now, setNow] = useState(() => Date.now());

  const songById = useMemo(() => new Map(room.songs.map((s) => [s.id, s])), [room.songs]);
  // 場上排列：依伺服器每局洗好的 layout（所有人一致）；舊房間沒有 layout 就退回曲名排序
  const layout = state.layout;
  const sortedSongs = useMemo(() => {
    const byTitle = (a: RoomSong, b: RoomSong) => a.title.localeCompare(b.title, 'ja');
    if (!layout || layout.length === 0) return [...room.songs].sort(byTitle);
    const pos = new Map(layout.map((id, i) => [id, i]));
    return [...room.songs].sort((a, b) => (pos.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (pos.get(b.id) ?? Number.MAX_SAFE_INTEGER) || byTitle(a, b));
  }, [room.songs, layout]);
  const nameOf = useCallback((id: string) => players.find((p) => p.id === id)?.name ?? '？', [players]);
  const ownedBy = useCallback((playerId: string) => room.songs.filter((s) => state.taken[s.id] === playerId), [room.songs, state.taken]);

  const isHost = !!me?.is_host;
  const myPending = me ? state.pendingDiscards[me.id] ?? 0 : 0;
  const started = !!state.currentSongId;
  const roundActive = started && !state.resolved;
  const remaining = room.songs.filter((s) => state.taken[s.id] === undefined).length;
  const readyCount = players.filter((p) => state.ready.includes(p.id)).length;
  const allReadyNow = allReady(state, players.map((p) => p.id));
  const hasPending = Object.values(state.pendingDiscards).some((n) => n > 0);
  /** 下一張最早可出的時間（伺服器時間 epoch ms；未開始為 0） */
  const dueAt = nextCardDueAt(state);
  const secsLeft = dueAt ? Math.max(0, Math.ceil((toLocalTime(new Date(dueAt).toISOString()) - now) / 1000)) : 0;
  const showReadyButton = !unlocked || (!!me && !started && !state.ready.includes(me.id));
  // 待丟牌對話框：伺服器剛回的清單優先；重新整理後仍有待丟（公開狀態）也要打開
  const dialogCards = discardCards ?? (me && myPending > 0 ? ownedBy(me.id) : null);

  // 最新的 props 放 ref（在 effect 內更新，不在 render 時寫 ref），
  // 讓「新回合」effect 只依賴 round key，不會每次輪詢都重排播放
  const latest = useRef({ songById, toLocalTime, isKaruta, code, token: session?.token ?? null, scheduleAudio, scheduleSpeech, stop });
  useEffect(() => {
    latest.current = { songById, toLocalTime, isKaruta, code, token: session?.token ?? null, scheduleAudio, scheduleSpeech, stop };
  });

  const roundKey = `${state.round}:${state.currentSongId ?? ''}`;
  useEffect(() => {
    if (!state.currentSongId || !state.startsAt) return;
    const { songById, toLocalTime, isKaruta, code, token, scheduleAudio, scheduleSpeech, stop } = latest.current;
    const song = songById.get(state.currentSongId);
    if (!song) return;
    const at = toLocalTime(state.startsAt);
    let cancelled = false;
    setAudioNote(null);
    setFlash(null);
    stop();

    if (!isKaruta) {
      roomApi
        .preview(song.trackId)
        .then((p) => { if (!cancelled) scheduleAudio(p.previewUrl, at); })
        .catch(() => { if (!cancelled) setAudioNote('這首歌的試聽暫時無法取得，請聽其他人的裝置。'); });
    } else {
      const url = ttsFileUrl(song.id);
      fetch(url, { method: 'HEAD' })
        .then(async (r) => {
          if (cancelled) return;
          if (r.ok) { scheduleAudio(url, at); return; }
          if (!token) { setAudioNote('這首歌還沒有朗讀檔。'); return; }
          try {
            const { text } = await roomApi.lyrics(code, token, song.id);
            if (!cancelled && !scheduleSpeech(text, at)) setAudioNote('此裝置無法朗讀，請聽其他人的裝置。');
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
  useEffect(() => { if (state.resolved) stop(); }, [state.resolved, stop]);

  // 綠框 / 紅框只閃一下
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  // 倒數顯示用的時鐘
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 自動換題（沒有「下一張」按鈕）：到 dueAt 就呼叫 /next，伺服器會再驗證時間。
  // 房主先出手、其他玩家晚 FALLBACK_DELAY_MS 當備援（房主分頁沒開也不會卡住）；帶 round 所以同一回合只會成功一次。
  // 伺服器說還沒到（時鐘偏差）→ 1 秒後再試；已換過 / 還有人沒丟牌 → 等下次狀態更新再排；斷線 → 3 秒後再試。
  const round = state.round;
  const token = session?.token ?? null;
  useEffect(() => {
    if (!token || !started) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const fire = async () => {
      try {
        await roomApi.next(code, token, round);
      } catch (e) {
        if (cancelled) return;
        if (!(e instanceof RoomApiError)) { timer = setTimeout(fire, 3000); return; }
        if (e.code === 'NOT_DUE') { timer = setTimeout(fire, 1000); return; }
      }
      if (!cancelled) await refresh();
    };
    const wait = Math.max(0, toLocalTime(new Date(dueAt).toISOString()) - Date.now()) + (isHost ? 0 : FALLBACK_DELAY_MS) + 200;
    timer = setTimeout(fire, wait);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [token, isHost, started, round, dueAt, hasPending, code, toLocalTime, refresh]);

  const claim = async (song: RoomSong) => {
    if (!session || !me || busy) return;
    if (!roundActive) { setMessage({ kind: 'info', text: '等下一張出來再搶！' }); return; }
    if (myPending > 0) { setMessage({ kind: 'bad', text: 'お手つき！請先選一張自己的牌丟回場上。' }); return; }
    setBusy(true);
    try {
      const r = await roomApi.claim(code, session.token, song.id, state.round);
      if (r.result === 'correct') {
        setFlash({ songId: song.id, status: 'correct' });
        setMessage({ kind: 'ok', text: `取得『${song.title}』！${song.points === 2 ? '（シングル 2 分）' : ''}` });
        stop();
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
    } finally {
      // 先拿到最新公開狀態再解鎖，避免玩家用舊狀態再點一次（例如丟牌後對話框閃回）
      await refresh();
      setBusy(false);
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
      // 先拿到最新公開狀態再解鎖，避免玩家用舊狀態再點一次（例如丟牌後對話框閃回）
      await refresh();
      setBusy(false);
    }
  };

  /** 「準備完成」：解鎖音訊（要在點擊事件裡）並回報伺服器 */
  const getReady = async () => {
    unlock();
    if (!session) return;
    try {
      await roomApi.ready(code, session.token);
    } catch (e) {
      setMessage({ kind: 'bad', text: e instanceof RoomApiError ? e.message : '連線失敗，請再按一次「準備完成」。' });
    }
    await refresh();
  };

  /** 房主按「遊戲開始」：出第一張（之後都自動） */
  const startGame = async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      await roomApi.next(code, session.token, state.round);
      setMessage(null);
    } catch (e) {
      setMessage({ kind: 'bad', text: e instanceof RoomApiError ? e.message : '連線失敗，請再試一次。' });
    } finally {
      // 先拿到最新公開狀態再解鎖，避免玩家用舊狀態再點一次（例如丟牌後對話框閃回）
      await refresh();
      setBusy(false);
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
      // 先拿到最新公開狀態再解鎖，避免玩家用舊狀態再點一次（例如丟牌後對話框閃回）
      await refresh();
      setBusy(false);
    }
  };

  const describe = (r: IntroResult): string => {
    const title = songById.get(r.songId)?.title ?? '？';
    if (r.type === 'correct') return `${nameOf(r.playerId)} 取得了『${title}』！`;
    if (r.type === 'otetsuki') return `${nameOf(r.playerId)} お手つき！`;
    return `${nameOf(r.playerId)} 把『${title}』丟回場上。`;
  };

  const playStatus = !started
    ? isHost
      ? allReadyNow ? '✅ 大家都準備好了，可以開始！' : `⏳ 等待大家準備（${readyCount}/${players.length}）`
      : `⏳ 等待房主開始（${readyCount}/${players.length} 已準備）`
    : state.resolved
      ? `⏱ ${secsLeft} 秒後自動出下一張`
      : playing
        ? '🎵 播放中…'
        : state.startsAt && now < toLocalTime(state.startsAt)
          ? '⏳ 準備播放…'
          : `🤔 沒人答對的話 ${secsLeft} 秒後換下一張`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <audio ref={audioRef} preload="auto" onEnded={onEnded} data-testid="room-audio" />

      <div className="kamisabi-room-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700 }}>
          {isKaruta ? 'かるたモード' : 'イントロモード'} · 房間 {room.code} · 第 <strong style={{ fontSize: '22px', color: 'var(--accent-color)' }}>{state.round}</strong> 張 · 剩 {remaining} 張
        </div>
        {showReadyButton && (
          <button type="button" className="btn btn-primary" onClick={getReady} style={{ fontWeight: 900 }}>🔊 準備完成</button>
        )}
        <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{playStatus}</span>
        {isHost && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {!started && allReadyNow && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={startGame} style={{ fontWeight: 900 }}>▶ 遊戲開始</button>
            )}
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
            {!started && state.ready.includes(p.id) ? '✅ ' : ''}{p.is_host ? '👑 ' : ''}{p.name}：{state.scores[p.id] ?? 0} 分
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

      {dialogCards && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="お手つき：選一張牌丟回場上"
          className="kamisabi-room-panel"
          style={{ position: 'fixed', left: '16px', right: '16px', bottom: '16px', zIndex: 50, boxShadow: 'var(--shadow-lg)', border: '2px solid #ef4444' }}
        >
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 900, color: '#991b1b' }}>お手つき！選一張自己的牌丟回場上</h3>
          {dialogCards.length === 0 ? (
            <p style={{ margin: 0 }}>你手上沒有牌可丟。</p>
          ) : (
            <div className="kamisabi-hand">
              {dialogCards.map((c) => (
                <KamisabiCard key={c.id} title={c.title} brand={c.brand} artworkUrl={c.artworkUrl} points={c.points} onClick={() => discard(c.id)} disabled={busy} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
