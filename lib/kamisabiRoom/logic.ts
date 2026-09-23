import { AppError } from '@/lib/errors';
import { NEXT_CARD_DELAY_MS, ROOM_CODE_LENGTH, type IntroState, type RoomSong } from './types';

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

export function createIntroState(): IntroState {
  return {
    kind: 'intro',
    round: 0,
    currentSongId: null,
    startsAt: null,
    resolved: false,
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
    lastResult: null,
  };
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
