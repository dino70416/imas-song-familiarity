/**
 * KAMISABI 線上房間的共用型別（server / client 都 import；不含任何 I/O）。
 * 對應 docs/research-streaming-intro-quiz-mode.md §13。
 */

export type RoomMode = 'intro' | 'karuta' | 'timeline';
export type RoomStatus = 'lobby' | 'playing' | 'finished';

export const ROOM_MODES: RoomMode[] = ['intro', 'karuta', 'timeline'];
export const ROOM_MODE_LABEL: Record<RoomMode, string> = {
  intro: 'イントロモード（聽試聽搶牌）',
  karuta: 'かるたモード（聽朗讀搶牌）',
  timeline: 'リリースタイムライン（排發行日）',
};

/** 大廳人數上限（時間軸規則 2–8 人；搶牌模式也用同一上限，畫面才放得下） */
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const TIMELINE_HAND_SIZE = 5;
/** 房主按「下一張」後幾毫秒開始同步播放（讓所有人先預載） */
export const NEXT_CARD_DELAY_MS = 3000;
export const ROOM_CODE_LENGTH = 5;
export const PLAYER_NAME_MAX = 12;

/** 開房時從 Neon 快照的一首歌 */
export interface RoomSong {
  id: string;
  title: string;
  brand: string;
  trackId: string;
  artworkUrl: string | null;
  releaseDate: string | null; // YYYY-MM-DD；時間軸模式只用有日期的
  points: 1 | 2;              // アルバム 1 / シングル 2
}

export type IntroResult =
  | { type: 'correct'; playerId: string; songId: string; round: number }
  | { type: 'otetsuki'; playerId: string; songId: string; round: number }
  | { type: 'discard'; playerId: string; songId: string; round: number };

/** イントロ / かるた 共用（差別只在前端播試聽還是朗讀） */
export interface IntroState {
  kind: 'intro';
  round: number;
  currentSongId: string | null;
  startsAt: string | null;               // ISO
  resolved: boolean;                     // 本回合已有人取得
  taken: Record<string, string>;         // songId → playerId
  scores: Record<string, number>;        // playerId → points
  pendingDiscards: Record<string, number>; // playerId → お手つき後還沒丟的張數
  lastResult: IntroResult | null;
}

export interface TimelineResult {
  type: 'placed';
  playerId: string;
  songId: string;
  slot: number;
  correct: boolean;
  drew: boolean;          // 放錯且山札還有牌 → 罰抽
  releaseDate: string;
}

export interface TimelineState {
  kind: 'timeline';
  order: string[];                       // playerId，依座位（時計回り）
  turnSeat: number;                      // order 的索引
  deckCount: number;
  line: string[];                        // 已翻開的 songId，依發行日
  handCounts: Record<string, number>;    // playerId → 手牌張數
  winnerId: string | null;
  lastResult: TimelineResult | null;
}

export type LobbyState = Record<string, never>;
export type RoomState = LobbyState | IntroState | TimelineState;

export interface RoomRow {
  id: string;
  code: string;
  mode: RoomMode | null;
  status: RoomStatus;
  brand: string;
  songs: RoomSong[];
  state: RoomState;
  version: number;
  updated_at: string;
}

export interface PlayerRow {
  id: string;
  room_id: string;
  name: string;
  seat: number;
  is_host: boolean;
  joined_at: string;
}

export interface SecretRow {
  room_id: string;
  player_id: string;
  token: string;
  hand: string[];
}

export function isIntroState(state: RoomState): state is IntroState {
  return (state as IntroState).kind === 'intro';
}
export function isTimelineState(state: RoomState): state is TimelineState {
  return (state as TimelineState).kind === 'timeline';
}
