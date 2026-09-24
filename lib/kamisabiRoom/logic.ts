import { AppError } from '@/lib/errors';
import { AUTO_NEXT_DELAY_MS, NEXT_CARD_DELAY_MS, ROOM_CODE_LENGTH, ROUND_TIMEOUT_MS, TIMELINE_HAND_SIZE, type IntroState, type RoomSong, type TimelineState } from './types';

/**
 * KAMISABI 房間規則的純函式：不碰 DB、不碰時間（now 由外面傳入）、隨機由 random 傳入方便測試。
 * Route Handler 負責 auth 與寫回；這裡只算「下一個 state」。
 */

/** 去掉 0/O/1/I 的字母數字，避免口頭報房號時搞混 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function pickRandom<T>(list: T[], random: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

// ---------------- イントロ / かるた ----------------

/** 開始搶牌模式：場上歌牌位置每局洗牌（layout），所有人看到同一種排列 */
export function createIntroState(songIds: string[] = [], random: () => number = Math.random): IntroState {
  return {
    kind: 'intro',
    round: 0,
    currentSongId: null,
    startsAt: null,
    resolved: false,
    resolvedAt: null,
    ready: [],
    layout: shuffleWith(songIds, random),
    taken: {},
    scores: {},
    pendingDiscards: {},
    lastResult: null,
  };
}

export function computeScores(taken: Record<string, string>, songs: RoomSong[]): Record<string, number> {
  const points = new Map(songs.map((s) => [s.id, s.points]));
  const scores: Record<string, number> = {};
  for (const [songId, playerId] of Object.entries(taken)) {
    scores[playerId] = (scores[playerId] ?? 0) + (points.get(songId) ?? 1);
  }
  return scores;
}

export function ownedSongs(state: IntroState, songs: RoomSong[], playerId: string): RoomSong[] {
  return songs.filter((s) => state.taken[s.id] === playerId);
}

function hasPendingDiscards(state: IntroState): boolean {
  return Object.values(state.pendingDiscards).some((n) => n > 0);
}

export function isIntroFinished(state: IntroState, songs: RoomSong[]): boolean {
  return songs.every((s) => state.taken[s.id] !== undefined) && !hasPendingDiscards(state);
}

/**
 * 房主按「下一張」：從還在場上的牌隨機挑一張。
 * 剛出過但沒人搶到的那張留在場上稍後重出，但有其他選擇時不立刻重出同一張。
 * 沒有牌可出回 null。
 */
export function pickNextSong(
  state: IntroState,
  songs: RoomSong[],
  now: number,
  random: () => number = Math.random,
): IntroState | null {
  const onTable = songs.filter((s) => state.taken[s.id] === undefined);
  if (onTable.length === 0) return null;
  const avoidRepeat = onTable.filter((s) => s.id !== state.currentSongId);
  const candidates = avoidRepeat.length > 0 ? avoidRepeat : onTable;
  const next = pickRandom(candidates, random);
  return {
    ...state,
    round: state.round + 1,
    currentSongId: next.id,
    startsAt: new Date(now + NEXT_CARD_DELAY_MS).toISOString(),
    resolved: false,
    resolvedAt: null,
    lastResult: null,
  };
}

/** 玩家按「準備完成」（可重複按） */
export function markReady(state: IntroState, playerId: string): IntroState {
  if (state.ready.includes(playerId)) return state;
  return { ...state, ready: [...state.ready, playerId] };
}

/** 所有玩家都按過「準備完成」才能出第一張 */
export function allReady(state: IntroState, playerIds: string[]): boolean {
  return playerIds.every((id) => state.ready.includes(id));
}

/**
 * 下一張最早可以出的時間（epoch ms）。
 * 未開始 → 0（由房主按「遊戲開始」）；有人取得 → resolvedAt + AUTO_NEXT_DELAY_MS；
 * 沒人答對 → startsAt + ROUND_TIMEOUT_MS。伺服器與瀏覽器都用這個算，時間一致。
 */
export function nextCardDueAt(state: IntroState): number {
  if (!state.currentSongId || !state.startsAt) return 0;
  if (state.resolved) return state.resolvedAt ? Date.parse(state.resolvedAt) + AUTO_NEXT_DELAY_MS : 0;
  return Date.parse(state.startsAt) + ROUND_TIMEOUT_MS;
}

export type ClaimResult = 'correct' | 'otetsuki' | 'otetsuki_no_cards';

/**
 * 玩家點牌。正確 → 得卡；點錯 → お手つき（有牌的人要丟一張，沒牌的人無事）。
 */
export function applyClaim(
  state: IntroState,
  songs: RoomSong[],
  playerId: string,
  songId: string,
  now: number = Date.now(),
): { state: IntroState; result: ClaimResult } {
  if (!state.currentSongId) throw new AppError('目前沒有進行中的題目。', 409, 'NO_ACTIVE_ROUND');
  if (state.resolved) throw new AppError('慢了一步，這張已經被取走了。', 409, 'ROUND_RESOLVED');
  if ((state.pendingDiscards[playerId] ?? 0) > 0) {
    throw new AppError('お手つき！請先選一張自己的牌丟回場上。', 409, 'DISCARD_PENDING');
  }
  if (!songs.some((s) => s.id === songId)) throw new AppError('沒有這張牌。', 400, 'UNKNOWN_SONG');
  if (state.taken[songId] !== undefined) throw new AppError('這張牌已經被取走了。', 400, 'ALREADY_TAKEN');

  if (songId === state.currentSongId) {
    const taken = { ...state.taken, [songId]: playerId };
    return {
      result: 'correct',
      state: {
        ...state,
        taken,
        scores: computeScores(taken, songs),
        resolved: true,
        resolvedAt: new Date(now).toISOString(),
        lastResult: { type: 'correct', playerId, songId, round: state.round },
      },
    };
  }

  const owns = ownedSongs(state, songs, playerId).length > 0;
  return {
    result: owns ? 'otetsuki' : 'otetsuki_no_cards',
    state: {
      ...state,
      pendingDiscards: owns
        ? { ...state.pendingDiscards, [playerId]: (state.pendingDiscards[playerId] ?? 0) + 1 }
        : state.pendingDiscards,
      lastResult: { type: 'otetsuki', playerId, songId, round: state.round },
    },
  };
}

/** お手つき後玩家自選一張已取得的牌丟回場上（那張牌的分數不算） */
export function applyDiscard(state: IntroState, songs: RoomSong[], playerId: string, songId: string): IntroState {
  const pending = state.pendingDiscards[playerId] ?? 0;
  if (pending <= 0) throw new AppError('你沒有需要丟的牌。', 409, 'NO_DISCARD_PENDING');
  if (state.taken[songId] !== playerId) throw new AppError('這不是你的牌。', 400, 'NOT_YOUR_CARD');

  const taken = { ...state.taken };
  delete taken[songId];
  const pendingDiscards = { ...state.pendingDiscards };
  if (pending - 1 <= 0) delete pendingDiscards[playerId];
  else pendingDiscards[playerId] = pending - 1;

  const scores = computeScores(taken, songs);
  if (scores[playerId] === undefined) scores[playerId] = 0;

  return {
    ...state,
    taken,
    scores,
    pendingDiscards,
    lastResult: { type: 'discard', playerId, songId, round: state.round },
  };
}

// ---------------- リリースタイムライン ----------------

export function timelineSongs(songs: RoomSong[]): RoomSong[] {
  return songs.filter((s) => !!s.releaseDate);
}

function shuffleWith<T>(list: T[], random: () => number): T[] {
  // Fisher–Yates，用傳入的 random 方便測試（lib/shuffle 綁死 Math.random）
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 開始時間軸：洗牌、每人 5 張、山札頂一張翻開當初期札、隨機決定起始玩家。
 * playerIds 依座位順序（時計回り）。
 */
export function dealTimeline(
  songs: RoomSong[],
  playerIds: string[],
  random: () => number = Math.random,
): { state: TimelineState; hands: Record<string, string[]> } {
  const dated = timelineSongs(songs);
  const need = playerIds.length * TIMELINE_HAND_SIZE + 1;
  if (dated.length < need) {
    throw new AppError(
      `這個品牌有發行日的歌只有 ${dated.length} 首，${playerIds.length} 人需要 ${need} 首。`,
      400,
      'NOT_ENOUGH_DATED_SONGS',
    );
  }
  const deck = shuffleWith(dated, random);
  const hands: Record<string, string[]> = {};
  const handCounts: Record<string, number> = {};
  let cursor = 0;
  for (const pid of playerIds) {
    hands[pid] = deck.slice(cursor, cursor + TIMELINE_HAND_SIZE).map((s) => s.id);
    handCounts[pid] = TIMELINE_HAND_SIZE;
    cursor += TIMELINE_HAND_SIZE;
  }
  const initial = deck[cursor++];
  return {
    hands,
    state: {
      kind: 'timeline',
      order: [...playerIds],
      turnSeat: Math.min(playerIds.length - 1, Math.floor(random() * playerIds.length)),
      deckCount: deck.length - cursor,
      line: [initial.id],
      handCounts,
      winnerId: null,
      lastResult: null,
    },
  };
}

/** 山札 = 有日期的歌 − 已翻開 − 所有人手牌（順序不重要，抽牌時隨機） */
export function deckSongs(songs: RoomSong[], state: TimelineState, hands: Record<string, string[]>): RoomSong[] {
  const used = new Set<string>(state.line);
  for (const h of Object.values(hands)) for (const id of h) used.add(id);
  return timelineSongs(songs).filter((s) => !used.has(s.id));
}

/**
 * 輪到的人把手牌放進時間軸第 slot 個位置（0 = 最左、line.length = 最右）。
 * 對：插入；錯：留在手牌、山札 > 0 罰抽一張。之後換下一位。先清空手牌者勝。
 */
export function applyPlace(
  state: TimelineState,
  songs: RoomSong[],
  hands: Record<string, string[]>,
  playerId: string,
  songId: string,
  slot: number,
  random: () => number = Math.random,
): { state: TimelineState; hands: Record<string, string[]>; correct: boolean; releaseDate: string } {
  if (state.winnerId) throw new AppError('遊戲已經結束了。', 409, 'GAME_OVER');
  if (state.order[state.turnSeat] !== playerId) throw new AppError('還沒輪到你。', 409, 'NOT_YOUR_TURN');
  const hand = hands[playerId] ?? [];
  if (!hand.includes(songId)) throw new AppError('這張牌不在你手上。', 400, 'NOT_IN_HAND');
  if (!Number.isInteger(slot) || slot < 0 || slot > state.line.length) throw new AppError('位置不正確。', 400, 'BAD_SLOT');

  const byId = new Map(songs.map((s) => [s.id, s]));
  const song = byId.get(songId);
  if (!song?.releaseDate) throw new AppError('這張牌沒有發行日。', 400, 'NOT_IN_HAND');
  const date = song.releaseDate;
  const prev = slot > 0 ? (byId.get(state.line[slot - 1])?.releaseDate ?? null) : null;
  const next = slot < state.line.length ? (byId.get(state.line[slot])?.releaseDate ?? null) : null;
  const correct = (prev === null || prev <= date) && (next === null || date <= next);

  const newHands = { ...hands, [playerId]: [...hand] };
  let line = state.line;
  let drew = false;
  if (correct) {
    newHands[playerId] = hand.filter((id) => id !== songId);
    line = [...state.line.slice(0, slot), songId, ...state.line.slice(slot)];
  } else {
    const deck = deckSongs(songs, state, hands);
    if (deck.length > 0) {
      const drawn = pickRandom(deck, random);
      newHands[playerId] = [...hand, drawn.id];
      drew = true;
    }
  }

  const handCounts = Object.fromEntries(Object.entries(newHands).map(([pid, h]) => [pid, h.length]));
  const winnerId = newHands[playerId].length === 0 ? playerId : null;
  const nextState: TimelineState = {
    ...state,
    line,
    handCounts,
    deckCount: deckSongs(songs, { ...state, line }, newHands).length,
    turnSeat: winnerId ? state.turnSeat : (state.turnSeat + 1) % state.order.length,
    winnerId,
    lastResult: { type: 'placed', playerId, songId, slot, correct, drew, releaseDate: date },
  };
  return { state: nextState, hands: newHands, correct, releaseDate: date };
}
