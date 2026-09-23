# KAMISABI 線上房間模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓多位玩家在各自的瀏覽器開房 `/kamisabi/room/[code]`，同步聽 Apple Music 30 秒試聽（イントロ）或 TTS 朗讀（かるた）搶虛擬歌牌，或玩リリースタイムライン，狀態由 Supabase Realtime 即時推送。

**Architecture:** 所有會改狀態的動作走 Next.js Route Handler（service role key 寫 Supabase，伺服器端驗證規則、樂觀鎖 `version`）；瀏覽器用 anon key 只讀 + 訂閱 `rooms` / `room_players`，Realtime 不可用時退回 4 秒輪詢。開房時從 Neon 快照該品牌曲目（含一次批次 iTunes lookup 抓封面）寫進 `rooms.songs`，之後整場不碰 Neon。遊戲規則全部是 `lib/kamisabiRoom/logic.ts` 的純函式，Route Handler 只做 auth → 純函式 → 寫回。

**Tech Stack:** Next.js 16 App Router（Route Handler `params` 是 Promise）、React 19、`@supabase/supabase-js` v2（Realtime `postgres_changes`）、Prisma/Neon（只在開房快照）、vitest + @testing-library/react（jsdom）、Google Cloud TTS REST（離線產檔腳本）。

**Spec:** `docs/research-streaming-intro-quiz-mode.md` §10–§17（Part B）。官方規則見 §11。

## Global Constraints

- 路徑：單機出題機 `/kamisabi`（已存在），線上房間 `/kamisabi/room/[code]`；API 前綴 `/api/kamisabi/room`。
- 主資料庫 Neon（Prisma）維持不動；**不新增 Prisma model**。房間資料只在 Supabase（`rooms` / `room_players` / `room_secrets`）。
- 環境變數名稱固定：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`；service role key 只能出現在 `lib/supabase/server.ts`。
- 瀏覽器端絕不寫 Supabase；所有寫入經過 Route Handler，`Authorization: Bearer <token>`。
- 音源：Apple Music 30 秒試聽固定整段播放；音檔由各瀏覽器直連 Apple CDN，伺服器只發 `startsAt`。
- 只做 ①イントロ / かるた、③リリースタイムライン；②ベスト 5、④フレーズパズル不做。
- 不做多人語音；かるた朗讀用 Google Cloud TTS 預先產檔（`ja-JP-Neural2-B`，`speakingRate: 0.95`，SSML `<break time="600ms"/>` 分行），沒有檔案時退回瀏覽器 `speechSynthesis`。歌詞文字不顯示在畫面上。
- 虛擬歌牌沿用 `components/kamisabi/KamisabiCard.tsx`（63:88、Apple 600×600 封面、品牌日文全名、裝飾用 ⏮ ▶ ⏭）；新增狀態：被取走灰化 + 名牌、點錯紅框抖動、得卡綠框、シングル ★2pt、時間軸翻開後顯示發行日。
- 計分：アルバム 1 分、シングル 2 分（房主開房時勾選哪些曲是シングル）；お手つき = 從自己已取得的牌中自選一張丟回場上。
- 時間軸：每人 5 張手牌、山札頂一張為初期札、放錯罰抽一張（山札 0 不抽）、同日視為皆可、先出完手牌者勝。2–8 人。
- Next.js 16：Route Handler 第二個參數 `{ params }: { params: Promise<{ code: string }> }`，要 `await params`。程式碼前先讀 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`。
- 中文註解、繁體中文 UI 文案，與既有 kamisabi 元件一致；commit 訊息格式 `feat(kamisabi): …`，結尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- 測試：`npm test`（vitest, jsdom）。API route 測試用記憶體假 store（`tests/helpers/fakeRoomStore.ts`），不連 Supabase。

## Review Focus

1. **同一回合兩人幾乎同時點對牌** → 只有第一個 UPDATE 成功者得卡，第二個人收到 409「慢了一步」而不是 500，也不會被算お手つき。（Task 4 `runRoomMutation` 重試後 `applyClaim` 丟 `ROUND_RESOLVED`；Task 7 測試。）
2. **玩家 token 遺失（換裝置 / 清 localStorage）** → 頁面退回加入表單，但房間已開始時不能再加入；顯示「遊戲已開始」並以觀戰模式顯示畫面，不會白屏。（Task 12 測試。）
3. **Supabase 環境變數沒設** → 開房 API 回 503 與可讀訊息「房間功能尚未設定」，不是 500 堆疊；瀏覽器端 `getSupabaseBrowser()` 回 null 並自動改用輪詢。（Task 1、Task 11 測試。）
4. **時間軸模式品牌有發行日的歌不夠（< 人數×5+1）** → `/start` 回 400 與人話訊息，房間留在 lobby。（Task 3、Task 8 測試。）
5. **かるた朗讀檔不存在** → 前端 HEAD 探測 404 後改用 `speechSynthesis`，沒有 `speechSynthesis` 的環境（jsdom / 舊瀏覽器）不丟例外，只顯示「此裝置無法朗讀」。（Task 16 測試。）

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `supabase/schema.sql` | §13 資料表、RLS、Realtime publication（站長在 Supabase SQL editor 執行一次） |
| `lib/supabase/server.ts` | `getSupabaseAdmin()`：service role client（單例），缺環境變數丟 `AppError 503` |
| `lib/supabase/browser.ts` | `getSupabaseBrowser()`：anon client（單例），缺環境變數回 `null` |
| `lib/kamisabiRoom/types.ts` | Room / Player / Secret / RoomSong / IntroState / TimelineState 型別與常數 |
| `lib/kamisabiRoom/logic.ts` | 純函式：房間代碼、イントロ/かるた搶牌、お手つき、計分、時間軸發牌與放牌 |
| `lib/kamisabiRoom/store.ts` | Supabase 讀寫（service role）：建房、加入、樂觀鎖更新、手牌、清房 |
| `lib/kamisabiRoom/auth.ts` | token 產生、Bearer 解析、`authenticateRoomRequest` |
| `lib/kamisabiRoom/mutate.ts` | `runRoomMutation`：auth → 純函式 → 樂觀鎖寫回，衝突自動重讀重試 3 次 |
| `lib/kamisabiRoom/snapshot.ts` | 開房快照：Neon 查曲目 + 批次 iTunes lookup 抓封面 |
| `lib/apple.ts`（修改） | `buildItunesLookupUrl` 支援多個 id；新增 `pickArtworkMap` |
| `app/api/kamisabi/room/route.ts` | POST 開房 |
| `app/api/kamisabi/room/[code]/route.ts` | GET 房間公開狀態 + `serverNow` |
| `app/api/kamisabi/room/[code]/{join,start,next,claim,discard,place,end}/route.ts` | 各動作 |
| `app/api/kamisabi/room/[code]/hand/route.ts` | GET 自己的手牌 |
| `app/api/kamisabi/room/[code]/lyrics/route.ts` | GET かるた Web Speech 備援用的副歌文字（只給當前題） |
| `app/api/kamisabi/ping/route.ts` | Cron：喚醒 Supabase + 清 24 小時前的房 |
| `vercel.json` | Cron 排程 |
| `components/kamisabi/KamisabiCard.tsx`（修改）+ `app/globals.css` | 卡片新狀態、可點擊 |
| `components/kamisabi/room/roomStorage.ts` | localStorage 玩家 session |
| `components/kamisabi/room/roomApi.ts` | 前端 fetch 包裝（帶 Bearer） |
| `components/kamisabi/room/useRoom.ts` | 初始 GET、Realtime 訂閱、輪詢備援、時間偏移 |
| `components/kamisabi/room/useSyncedAudio.ts` | 單一 `<audio>`：解鎖 iOS、到 `startsAt` 同時播放、speechSynthesis 備援 |
| `components/kamisabi/room/RoomClient.tsx` | 依 session / status / mode 分派到 JoinForm、Lobby、IntroGame、TimelineGame、Results |
| `components/kamisabi/room/{JoinForm,Lobby,IntroGame,TimelineGame,Results}.tsx` | 各畫面 |
| `components/kamisabi/room/RoomEntry.tsx` | `/kamisabi` 設定頁的「線上房間」開房 / 加入表單 |
| `app/kamisabi/room/[code]/page.tsx` | 頁面 |
| `scripts/karuta-lyrics.ts`、`scripts/gen-karuta-tts.ts`、`lib/karutaTts.ts` | かるた朗讀對照表、產檔腳本、SSML 純函式 |
| `public/kamisabi/tts/.gitkeep` | 朗讀檔目錄 |
| `tests/kamisabiRoomLogic.unit.test.ts`、`tests/kamisabiRoomApi.test.ts`、`tests/KamisabiRoom.test.tsx`、`tests/karutaTts.unit.test.ts`、`tests/helpers/fakeRoomStore.ts` | 測試 |

---

### Task 1: Supabase 基礎：套件、環境變數、schema.sql、server/browser client、型別

**Files:**
- Modify: `package.json`（新增 `@supabase/supabase-js`）
- Modify: `.env.example`
- Create: `supabase/schema.sql`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/browser.ts`
- Create: `lib/kamisabiRoom/types.ts`
- Test: `tests/supabaseClient.unit.test.ts`

**Interfaces:**
- Produces: `getSupabaseAdmin(): SupabaseClient`（缺變數丟 `AppError(503, 'SUPABASE_NOT_CONFIGURED')`）、`getSupabaseBrowser(): SupabaseClient | null`、`types.ts` 的所有型別與常數（後面每個 Task 都 import）。

- [ ] **Step 1: 安裝套件**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: `.env.example` 加上三個變數**

在檔尾加：

```
# KAMISABI 線上房間（Supabase，另一個專案；主資料庫仍是上面的 Neon）
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_..."
SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
# Vercel Cron 呼叫 /api/kamisabi/ping 用；沒設就不驗證
CRON_SECRET=""
```

- [ ] **Step 3: 寫 `supabase/schema.sql`（站長在 Supabase SQL editor 執行一次）**

```sql
-- KAMISABI 線上房間（docs/research-streaming-intro-quiz-mode.md §13）
-- 在 Supabase Dashboard → SQL editor 貼上執行一次。

create table if not exists rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,              -- 5 碼房間代碼
  mode        text,                              -- intro | karuta | timeline（開始時才決定）
  status      text not null default 'lobby',     -- lobby | playing | finished
  brand       text not null,                     -- music_ml | music_sidem | music_shiny …
  songs       jsonb not null,                    -- 開房快照：[{id,title,brand,trackId,artworkUrl,releaseDate,points}]
  state       jsonb not null default '{}',       -- 公開狀態
  version     int  not null default 0,           -- 樂觀鎖
  updated_at  timestamptz default now()
);

create table if not exists room_players (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid references rooms(id) on delete cascade,
  name      text not null,
  seat      int  not null,
  is_host   boolean not null default false,
  joined_at timestamptz default now(),
  unique (room_id, seat)
);

-- 只有 service role 能讀：玩家 token、時間軸模式的手牌
create table if not exists room_secrets (
  room_id    uuid references rooms(id) on delete cascade,
  player_id  uuid references room_players(id) on delete cascade,
  token      text not null,
  hand       jsonb not null default '[]',
  primary key (room_id, player_id)
);
create index if not exists room_secrets_token_idx on room_secrets (room_id, token);

alter table rooms         enable row level security;
alter table room_players  enable row level security;
alter table room_secrets  enable row level security;
drop policy if exists "anon read rooms"   on rooms;
drop policy if exists "anon read players" on room_players;
create policy "anon read rooms"   on rooms        for select using (true);
create policy "anon read players" on room_players for select using (true);
-- room_secrets 不開任何 policy；anon 完全讀不到。
-- 不開任何 insert/update/delete 給 anon，寫入一律經過 API route（service role）。

alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_players;
```

- [ ] **Step 4: 寫失敗測試 `tests/supabaseClient.unit.test.ts`**

```ts
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppError } from '@/lib/errors';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getSupabaseAdmin', () => {
  test('缺環境變數時丟 503 AppError，而不是讓 createClient 炸掉', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { getSupabaseAdmin } = await import('@/lib/supabase/server');
    expect(() => getSupabaseAdmin()).toThrowError(AppError);
    try {
      getSupabaseAdmin();
    } catch (e) {
      expect((e as AppError).statusCode).toBe(503);
      expect((e as AppError).code).toBe('SUPABASE_NOT_CONFIGURED');
    }
  });

  test('有環境變數時回傳同一個 client 實例', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_test');
    const { getSupabaseAdmin } = await import('@/lib/supabase/server');
    expect(getSupabaseAdmin()).toBe(getSupabaseAdmin());
  });
});

describe('getSupabaseBrowser', () => {
  test('缺環境變數回 null（前端改用輪詢）', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const { getSupabaseBrowser } = await import('@/lib/supabase/browser');
    expect(getSupabaseBrowser()).toBeNull();
  });
});
```

- [ ] **Step 5: 跑測試確認失敗**

Run: `npx vitest run tests/supabaseClient.unit.test.ts`
Expected: FAIL（找不到 `@/lib/supabase/server`）

- [ ] **Step 6: 寫 `lib/supabase/server.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors';

/**
 * 只給 Route Handler 用的 Supabase client（service role，繞過 RLS）。
 * 絕對不要從 client component import 這個檔案。
 */
const globalForSupabase = global as unknown as { _supabaseAdmin?: SupabaseClient; _supabaseAdminKey?: string };

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new AppError('房間功能尚未設定 Supabase 環境變數。', 503, 'SUPABASE_NOT_CONFIGURED');
  }
  const cacheKey = `${url}|${key}`;
  if (!globalForSupabase._supabaseAdmin || globalForSupabase._supabaseAdminKey !== cacheKey) {
    globalForSupabase._supabaseAdmin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    globalForSupabase._supabaseAdminKey = cacheKey;
  }
  return globalForSupabase._supabaseAdmin;
}
```

- [ ] **Step 7: 寫 `lib/supabase/browser.ts`**

```ts
'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 瀏覽器用的 Supabase client（anon / publishable key）：只讀 + Realtime 訂閱。
 * 沒設環境變數時回 null，useRoom 會改用輪詢。
 */
let browserClient: SupabaseClient | null | undefined;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  browserClient = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return browserClient;
}
```

- [ ] **Step 8: 寫 `lib/kamisabiRoom/types.ts`**

```ts
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
```

- [ ] **Step 9: 跑測試確認通過**

Run: `npx vitest run tests/supabaseClient.unit.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .env.example supabase/schema.sql lib/supabase lib/kamisabiRoom/types.ts tests/supabaseClient.unit.test.ts
git commit -m "feat(kamisabi): 房間模式基礎：Supabase client、schema.sql、共用型別

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 純函式：房間代碼 + イントロ / かるた 搶牌邏輯

**Files:**
- Create: `lib/kamisabiRoom/logic.ts`
- Test: `tests/kamisabiRoomLogic.unit.test.ts`

**Interfaces:**
- Consumes: `types.ts`（Task 1）、`AppError`（`lib/errors.ts`，既有）。
- Produces（後面 Route Handler 直接呼叫）：
  - `generateRoomCode(random?: () => number): string`
  - `createIntroState(): IntroState`
  - `pickNextSong(state, songs, now: number, random?): IntroState | null`
  - `applyClaim(state, songs, playerId, songId): { state: IntroState; result: 'correct' | 'otetsuki' | 'otetsuki_no_cards' }`
  - `applyDiscard(state, songs, playerId, songId): IntroState`
  - `ownedSongs(state, songs, playerId): RoomSong[]`
  - `computeScores(taken, songs): Record<string, number>`
  - `isIntroFinished(state, songs): boolean`
  - 錯誤一律 `throw new AppError(message, status, code)`；code 有 `NO_ACTIVE_ROUND`、`ROUND_RESOLVED`、`DISCARD_PENDING`、`UNKNOWN_SONG`、`ALREADY_TAKEN`、`NOT_YOUR_CARD`、`NO_DISCARD_PENDING`。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/kamisabiRoomLogic.unit.test.ts
import { describe, expect, test } from 'vitest';
import { AppError } from '@/lib/errors';
import type { RoomSong } from '@/lib/kamisabiRoom/types';
import {
  applyClaim,
  applyDiscard,
  computeScores,
  createIntroState,
  generateRoomCode,
  isIntroFinished,
  ownedSongs,
  pickNextSong,
} from '@/lib/kamisabiRoom/logic';

const song = (id: string, points: 1 | 2 = 1, releaseDate: string | null = null): RoomSong => ({
  id, title: `Song ${id}`, brand: 'music_ml', trackId: `t${id}`, artworkUrl: null, releaseDate, points,
});
const SONGS = [song('a'), song('b', 2), song('c')];
const NOW = Date.parse('2026-09-23T12:00:00Z');

function codeOf(e: unknown) { return (e as AppError).code; }

describe('generateRoomCode', () => {
  test('5 碼、只用不易混淆的大寫字母與數字', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
  });
  test('random 固定時結果可預測', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAAA');
  });
});

describe('イントロ / かるた', () => {
  test('pickNextSong：從未取走的牌隨機挑一張，round+1，startsAt = now + 3s，避免立刻重出同一張', () => {
    let s = createIntroState();
    s = pickNextSong(s, SONGS, NOW, () => 0)!;
    expect(s.round).toBe(1);
    expect(s.currentSongId).toBe('a');
    expect(s.startsAt).toBe(new Date(NOW + 3000).toISOString());
    expect(s.resolved).toBe(false);
    // 沒人搶到、再出下一張：random=0 本來又會挑到 a，但要避開剛剛那張
    const s2 = pickNextSong(s, SONGS, NOW, () => 0)!;
    expect(s2.currentSongId).not.toBe('a');
    expect(s2.round).toBe(2);
  });

  test('pickNextSong：全部取走時回 null', () => {
    const s = { ...createIntroState(), taken: { a: 'p1', b: 'p1', c: 'p2' } };
    expect(pickNextSong(s, SONGS, NOW)).toBeNull();
  });

  test('applyClaim 正確：taken / scores / resolved / lastResult 都更新', () => {
    const s0 = pickNextSong(createIntroState(), SONGS, NOW, () => 0.5)!; // → b
    const { state, result } = applyClaim(s0, SONGS, 'p1', s0.currentSongId!);
    expect(result).toBe('correct');
    expect(state.taken[s0.currentSongId!]).toBe('p1');
    expect(state.resolved).toBe(true);
    expect(state.scores).toEqual({ p1: 2 }); // b 是シングル 2 分
    expect(state.lastResult).toEqual({ type: 'correct', playerId: 'p1', songId: 'b', round: 1 });
  });

  test('applyClaim：已有人取得後再點 → ROUND_RESOLVED（慢了一步，不算お手つき）', () => {
    const s0 = pickNextSong(createIntroState(), SONGS, NOW, () => 0)!;
    const { state } = applyClaim(s0, SONGS, 'p1', 'a');
    expect(() => applyClaim(state, SONGS, 'p2', 'a')).toThrowError(AppError);
    try { applyClaim(state, SONGS, 'p2', 'b'); } catch (e) { expect(codeOf(e)).toBe('ROUND_RESOLVED'); }
  });

  test('applyClaim：沒有進行中的回合 → NO_ACTIVE_ROUND', () => {
    try { applyClaim(createIntroState(), SONGS, 'p1', 'a'); } catch (e) { expect(codeOf(e)).toBe('NO_ACTIVE_ROUND'); }
  });

  test('applyClaim 點錯：有牌的人 pendingDiscards+1，沒牌的人只記錄 otetsuki', () => {
    let s = pickNextSong(createIntroState(), SONGS, NOW, () => 0)!; // a
    const r1 = applyClaim(s, SONGS, 'p1', 'b');
    expect(r1.result).toBe('otetsuki_no_cards');
    expect(r1.state.pendingDiscards).toEqual({});
    expect(r1.state.lastResult?.type).toBe('otetsuki');
    expect(r1.state.resolved).toBe(false);

    // p1 先拿到 a，再下一回合點錯
    s = applyClaim(r1.state, SONGS, 'p1', 'a').state;
    s = pickNextSong(s, SONGS, NOW, () => 0)!; // b
    const r2 = applyClaim(s, SONGS, 'p1', 'c');
    expect(r2.result).toBe('otetsuki');
    expect(r2.state.pendingDiscards).toEqual({ p1: 1 });
  });

  test('有待丟的牌時不能再搶 → DISCARD_PENDING', () => {
    let s = pickNextSong(createIntroState(), SONGS, NOW, () => 0)!; // a
    s = applyClaim(s, SONGS, 'p1', 'a').state;
    s = pickNextSong(s, SONGS, NOW, () => 0)!; // b
    s = applyClaim(s, SONGS, 'p1', 'c').state; // お手つき
    try { applyClaim(s, SONGS, 'p1', 'b'); } catch (e) { expect(codeOf(e)).toBe('DISCARD_PENDING'); }
  });

  test('applyDiscard：把自己的牌丟回場上，分數重算，pending 歸零', () => {
    let s = pickNextSong(createIntroState(), SONGS, NOW, () => 0)!; // a
    s = applyClaim(s, SONGS, 'p1', 'a').state;
    s = pickNextSong(s, SONGS, NOW, () => 0)!; // b
    s = applyClaim(s, SONGS, 'p1', 'c').state; // お手つき
    expect(ownedSongs(s, SONGS, 'p1').map((x) => x.id)).toEqual(['a']);
    s = applyDiscard(s, SONGS, 'p1', 'a');
    expect(s.taken).toEqual({});
    expect(s.scores).toEqual({ p1: 0 });
    expect(s.pendingDiscards).toEqual({});
    expect(s.lastResult).toEqual({ type: 'discard', playerId: 'p1', songId: 'a', round: 2 });
    // 丟回去的牌可以再被出到
    const again = pickNextSong({ ...s, currentSongId: null }, SONGS, NOW, () => 0)!;
    expect(['a', 'b', 'c']).toContain(again.currentSongId);
  });

  test('applyDiscard：沒有待丟 / 不是自己的牌', () => {
    const s = { ...createIntroState(), taken: { a: 'p2' } };
    try { applyDiscard(s, SONGS, 'p1', 'a'); } catch (e) { expect(codeOf(e)).toBe('NO_DISCARD_PENDING'); }
    try { applyDiscard({ ...s, pendingDiscards: { p1: 1 } }, SONGS, 'p1', 'a'); } catch (e) { expect(codeOf(e)).toBe('NOT_YOUR_CARD'); }
  });

  test('applyClaim：不存在的曲目 / 已被取走的曲目', () => {
    const s = pickNextSong({ ...createIntroState(), taken: { c: 'p2' } }, SONGS, NOW, () => 0)!;
    try { applyClaim(s, SONGS, 'p1', 'zzz'); } catch (e) { expect(codeOf(e)).toBe('UNKNOWN_SONG'); }
    try { applyClaim(s, SONGS, 'p1', 'c'); } catch (e) { expect(codeOf(e)).toBe('ALREADY_TAKEN'); }
  });

  test('computeScores / isIntroFinished', () => {
    expect(computeScores({ a: 'p1', b: 'p2', c: 'p1' }, SONGS)).toEqual({ p1: 2, p2: 2 });
    const done = { ...createIntroState(), taken: { a: 'p1', b: 'p2', c: 'p1' } };
    expect(isIntroFinished(done, SONGS)).toBe(true);
    expect(isIntroFinished({ ...done, pendingDiscards: { p1: 1 } }, SONGS)).toBe(false);
    expect(isIntroFinished({ ...done, taken: { a: 'p1' } }, SONGS)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/kamisabiRoomLogic.unit.test.ts`
Expected: FAIL（找不到 `@/lib/kamisabiRoom/logic`）

- [ ] **Step 3: 寫 `lib/kamisabiRoom/logic.ts`（イントロ部分；時間軸在 Task 3 加進同一檔）**

```ts
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/kamisabiRoomLogic.unit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/kamisabiRoom/logic.ts tests/kamisabiRoomLogic.unit.test.ts
git commit -m "feat(kamisabi): 房間規則純函式：房號、イントロ/かるた搶牌、お手つき、計分

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 純函式：リリースタイムライン 發牌與放牌

**Files:**
- Modify: `lib/kamisabiRoom/logic.ts`（追加）
- Test: `tests/kamisabiRoomLogic.unit.test.ts`（追加 describe）

**Interfaces:**
- Produces：
  - `timelineSongs(songs): RoomSong[]`（只留有 `releaseDate` 的）
  - `dealTimeline(songs, playerIds: string[], random?): { state: TimelineState; hands: Record<string, string[]> }`；曲數不足丟 `AppError(400, 'NOT_ENOUGH_DATED_SONGS')`
  - `deckSongs(songs, state, hands): RoomSong[]`（山札 = 有日期的歌 − line − 所有手牌）
  - `applyPlace(state, songs, hands, playerId, songId, slot, random?): { state; hands; correct: boolean; releaseDate: string }`；錯誤 code：`NOT_YOUR_TURN`、`NOT_IN_HAND`、`BAD_SLOT`、`GAME_OVER`

- [ ] **Step 1: 追加失敗測試（同一測試檔尾端）**

```ts
import { applyPlace, dealTimeline, deckSongs, timelineSongs } from '@/lib/kamisabiRoom/logic';

describe('リリースタイムライン', () => {
  // 12 首有日期（d01..d12），1 首沒日期（x）
  const DATED = Array.from({ length: 12 }, (_, i) => song(`d${String(i + 1).padStart(2, '0')}`, 1, `20${String(i + 10)}-01-01`));
  const ALL = [...DATED, song('x')];

  test('timelineSongs 只留有發行日的歌', () => {
    expect(timelineSongs(ALL).map((s) => s.id)).not.toContain('x');
    expect(timelineSongs(ALL)).toHaveLength(12);
  });

  test('dealTimeline：每人 5 張、初期札 1 張、山札 = 其餘；turnSeat 隨機', () => {
    const { state, hands } = dealTimeline(ALL, ['p1', 'p2'], () => 0);
    expect(hands.p1).toHaveLength(5);
    expect(hands.p2).toHaveLength(5);
    expect(state.line).toHaveLength(1);
    expect(state.deckCount).toBe(12 - 10 - 1);
    expect(state.handCounts).toEqual({ p1: 5, p2: 5 });
    expect(state.order).toEqual(['p1', 'p2']);
    expect(state.turnSeat).toBe(0);
    expect(state.winnerId).toBeNull();
    // 手牌 + line + 山札 不重複且都在有日期的歌裡
    const dealt = [...hands.p1, ...hands.p2, ...state.line];
    expect(new Set(dealt).size).toBe(11);
    expect(dealt).not.toContain('x');
    expect(deckSongs(ALL, state, hands)).toHaveLength(1);
  });

  test('dealTimeline：有日期的歌不足 人數×5+1 → NOT_ENOUGH_DATED_SONGS', () => {
    try { dealTimeline(ALL, ['p1', 'p2', 'p3'], () => 0); } catch (e) { expect(codeOf(e)).toBe('NOT_ENOUGH_DATED_SONGS'); }
  });

  function fixedGame() {
    // 手動排一局：p1 手牌 d01,d03,d05,d07,d09；p2 手牌 d02,d04,d06,d08,d10；初期札 d11；山札 d12
    const hands = { p1: ['d01', 'd03', 'd05', 'd07', 'd09'], p2: ['d02', 'd04', 'd06', 'd08', 'd10'] };
    const state = {
      kind: 'timeline' as const, order: ['p1', 'p2'], turnSeat: 0, deckCount: 1, line: ['d11'],
      handCounts: { p1: 5, p2: 5 }, winnerId: null, lastResult: null,
    };
    return { state, hands };
  }

  test('applyPlace 正確：放在初期札左邊，手牌減一，輪到下一位', () => {
    const { state, hands } = fixedGame();
    const r = applyPlace(state, ALL, hands, 'p1', 'd01', 0);
    expect(r.correct).toBe(true);
    expect(r.releaseDate).toBe('2010-01-01');
    expect(r.state.line).toEqual(['d01', 'd11']);
    expect(r.hands.p1).toEqual(['d03', 'd05', 'd07', 'd09']);
    expect(r.state.handCounts.p1).toBe(4);
    expect(r.state.turnSeat).toBe(1);
    expect(r.state.deckCount).toBe(1);
    expect(r.state.lastResult).toEqual({ type: 'placed', playerId: 'p1', songId: 'd01', slot: 0, correct: true, drew: false, releaseDate: '2010-01-01' });
  });

  test('applyPlace 放錯：牌留在手上、山札有牌時罰抽一張、仍換人', () => {
    const { state, hands } = fixedGame();
    const r = applyPlace(state, ALL, hands, 'p1', 'd01', 1); // d01 比 d11 舊卻放右邊
    expect(r.correct).toBe(false);
    expect(r.state.line).toEqual(['d11']);
    expect(r.hands.p1).toEqual(['d01', 'd03', 'd05', 'd07', 'd09', 'd12']);
    expect(r.state.deckCount).toBe(0);
    expect(r.state.handCounts.p1).toBe(6);
    expect(r.state.lastResult?.drew).toBe(true);
    expect(r.state.turnSeat).toBe(1);
    // 山札 0 → 放錯不抽
    const r2 = applyPlace(r.state, ALL, r.hands, 'p2', 'd02', 0 + 1);
    expect(r2.correct).toBe(false);
    expect(r2.hands.p2).toHaveLength(5);
    expect(r2.state.lastResult?.drew).toBe(false);
    expect(r2.state.turnSeat).toBe(0); // 繞回第一位
  });

  test('applyPlace：中間 slot 與同日視為皆可', () => {
    const { state, hands } = fixedGame();
    let r = applyPlace(state, ALL, hands, 'p1', 'd01', 0);            // [d01, d11]
    r = applyPlace(r.state, ALL, r.hands, 'p2', 'd06', 1);            // [d01, d06, d11]
    expect(r.correct).toBe(true);
    expect(r.state.line).toEqual(['d01', 'd06', 'd11']);
    // 同日：多一首和 d06 同日的歌塞在手牌
    const sameDay = [...ALL, song('same', 1, '2015-01-01')];
    const hands2 = { ...r.hands, p1: ['same', ...r.hands.p1] };
    const left = applyPlace(r.state, sameDay, hands2, 'p1', 'same', 1);
    const right = applyPlace(r.state, sameDay, hands2, 'p1', 'same', 2);
    expect(left.correct).toBe(true);
    expect(right.correct).toBe(true);
  });

  test('applyPlace：不是你的回合 / 不在手牌 / slot 超出範圍', () => {
    const { state, hands } = fixedGame();
    try { applyPlace(state, ALL, hands, 'p2', 'd02', 0); } catch (e) { expect(codeOf(e)).toBe('NOT_YOUR_TURN'); }
    try { applyPlace(state, ALL, hands, 'p1', 'd02', 0); } catch (e) { expect(codeOf(e)).toBe('NOT_IN_HAND'); }
    try { applyPlace(state, ALL, hands, 'p1', 'd01', 5); } catch (e) { expect(codeOf(e)).toBe('BAD_SLOT'); }
    try { applyPlace(state, ALL, hands, 'p1', 'd01', -1); } catch (e) { expect(codeOf(e)).toBe('BAD_SLOT'); }
  });

  test('先出完手牌者勝，之後不能再放', () => {
    const hands = { p1: ['d01'], p2: ['d02', 'd04'] };
    const state = { ...fixedGame().state, handCounts: { p1: 1, p2: 2 } };
    const r = applyPlace(state, ALL, hands, 'p1', 'd01', 0);
    expect(r.state.winnerId).toBe('p1');
    expect(r.state.handCounts.p1).toBe(0);
    try { applyPlace(r.state, ALL, r.hands, 'p2', 'd02', 0); } catch (e) { expect(codeOf(e)).toBe('GAME_OVER'); }
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/kamisabiRoomLogic.unit.test.ts`
Expected: FAIL（`dealTimeline` 等 not exported）

- [ ] **Step 3: 在 `lib/kamisabiRoom/logic.ts` 追加**

```ts
import { TIMELINE_HAND_SIZE, type TimelineState } from './types';
import { shuffle } from '@/lib/shuffle';

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
  const deck = random === Math.random ? shuffle(dated) : shuffleWith(dated, random);
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
  const prev = slot > 0 ? byId.get(state.line[slot - 1])?.releaseDate ?? null : null;
  const next = slot < state.line.length ? byId.get(state.line[slot])?.releaseDate ?? null : null;
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/kamisabiRoomLogic.unit.test.ts`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```bash
git add lib/kamisabiRoom/logic.ts tests/kamisabiRoomLogic.unit.test.ts
git commit -m "feat(kamisabi): リリースタイムライン 發牌、放牌、罰抽、勝負判定純函式

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Supabase store、token auth、樂觀鎖 mutation helper、測試用假 store

**Files:**
- Create: `lib/kamisabiRoom/store.ts`
- Create: `lib/kamisabiRoom/auth.ts`
- Create: `lib/kamisabiRoom/mutate.ts`
- Create: `tests/helpers/fakeRoomStore.ts`
- Test: `tests/kamisabiRoomAuth.unit.test.ts`

**Interfaces:**
- Consumes: `getSupabaseAdmin()`（Task 1）、`types.ts`。
- Produces（`store.ts`，全部 async；Route Handler 只透過這層碰 Supabase）：
  - `createRoom({ code, brand, songs }): Promise<RoomRow>`（code 撞到 unique → `AppError(409,'CODE_TAKEN')`）
  - `getRoomByCode(code): Promise<RoomRow | null>`
  - `listPlayers(roomId): Promise<PlayerRow[]>`（seat 升冪）
  - `addPlayer({ roomId, name, seat, isHost }): Promise<PlayerRow>`（seat 撞到 → `AppError(409,'SEAT_TAKEN')`）
  - `createSecret({ roomId, playerId, token }): Promise<void>`
  - `findSecretByToken(roomId, token): Promise<SecretRow | null>`
  - `listSecrets(roomId): Promise<SecretRow[]>`
  - `setHands(roomId, hands: Record<string, string[]>): Promise<void>`
  - `updateRoom(roomId, expectedVersion, patch: { mode?; status?; state? }): Promise<RoomRow>`（0 列更新 → `AppError(409,'VERSION_CONFLICT')`）
  - `deleteStaleRooms(before: Date): Promise<number>`、`pingDatabase(): Promise<void>`
- Produces（`auth.ts`）：`generateToken(): string`、`readBearer(request): string | null`、`authenticateRoomRequest(request, code, { hostOnly? }): Promise<RoomContext>`，`RoomContext = { room, player, secret, players }`。
- Produces（`mutate.ts`）：`runRoomMutation<T>(request, code, opts, fn)`；`fn(ctx) → { patch, result, hands? }`，衝突自動重讀重試 3 次；回 `result`。
- 假 store：`tests/helpers/fakeRoomStore.ts` 匯出 `createFakeStore()`，回傳與 `store.ts` 同名同簽名的函式 + `reset()`；測試用 `vi.mock('@/lib/kamisabiRoom/store', () => fake)`。

- [ ] **Step 1: 寫 `tests/helpers/fakeRoomStore.ts`（記憶體版，含樂觀鎖）**

```ts
import { AppError } from '@/lib/errors';
import type { PlayerRow, RoomRow, RoomSong, RoomState, SecretRow, RoomMode, RoomStatus } from '@/lib/kamisabiRoom/types';

/** 與 lib/kamisabiRoom/store.ts 同介面的記憶體實作，給 API route 測試用 */
export function createFakeStore() {
  let rooms: RoomRow[] = [];
  let players: PlayerRow[] = [];
  let secrets: SecretRow[] = [];
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  return {
    reset() { rooms = []; players = []; secrets = []; seq = 0; },
    // 測試用的後門
    _rooms: () => rooms,
    _secrets: () => secrets,

    async createRoom(input: { code: string; brand: string; songs: RoomSong[] }): Promise<RoomRow> {
      if (rooms.some((r) => r.code === input.code)) throw new AppError('房號重複', 409, 'CODE_TAKEN');
      const row: RoomRow = { id: uuid(), code: input.code, mode: null, status: 'lobby', brand: input.brand, songs: input.songs, state: {}, version: 0, updated_at: new Date().toISOString() };
      rooms.push(row);
      return structuredClone(row);
    },
    async getRoomByCode(code: string): Promise<RoomRow | null> {
      const r = rooms.find((x) => x.code === code);
      return r ? structuredClone(r) : null;
    },
    async listPlayers(roomId: string): Promise<PlayerRow[]> {
      return structuredClone(players.filter((p) => p.room_id === roomId).sort((a, b) => a.seat - b.seat));
    },
    async addPlayer(input: { roomId: string; name: string; seat: number; isHost: boolean }): Promise<PlayerRow> {
      if (players.some((p) => p.room_id === input.roomId && p.seat === input.seat)) throw new AppError('座位重複', 409, 'SEAT_TAKEN');
      const row: PlayerRow = { id: uuid(), room_id: input.roomId, name: input.name, seat: input.seat, is_host: input.isHost, joined_at: new Date().toISOString() };
      players.push(row);
      return structuredClone(row);
    },
    async createSecret(input: { roomId: string; playerId: string; token: string }): Promise<void> {
      secrets.push({ room_id: input.roomId, player_id: input.playerId, token: input.token, hand: [] });
    },
    async findSecretByToken(roomId: string, token: string): Promise<SecretRow | null> {
      const s = secrets.find((x) => x.room_id === roomId && x.token === token);
      return s ? structuredClone(s) : null;
    },
    async listSecrets(roomId: string): Promise<SecretRow[]> {
      return structuredClone(secrets.filter((s) => s.room_id === roomId));
    },
    async setHands(roomId: string, hands: Record<string, string[]>): Promise<void> {
      for (const s of secrets) if (s.room_id === roomId && hands[s.player_id]) s.hand = [...hands[s.player_id]];
    },
    async updateRoom(roomId: string, expectedVersion: number, patch: { mode?: RoomMode; status?: RoomStatus; state?: RoomState }): Promise<RoomRow> {
      const r = rooms.find((x) => x.id === roomId);
      if (!r || r.version !== expectedVersion) throw new AppError('房間狀態已被其他人更新，請重試。', 409, 'VERSION_CONFLICT');
      Object.assign(r, patch, { version: r.version + 1, updated_at: new Date().toISOString() });
      return structuredClone(r);
    },
    async deleteStaleRooms(before: Date): Promise<number> {
      const n = rooms.length;
      rooms = rooms.filter((r) => new Date(r.updated_at) >= before);
      return n - rooms.length;
    },
    async pingDatabase(): Promise<void> {},
  };
}

export type FakeStore = ReturnType<typeof createFakeStore>;
```

- [ ] **Step 2: 寫失敗測試 `tests/kamisabiRoomAuth.unit.test.ts`**

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { createFakeStore } from './helpers/fakeRoomStore';

const fake = createFakeStore();
vi.mock('@/lib/kamisabiRoom/store', () => fake);

import { authenticateRoomRequest, generateToken, readBearer } from '@/lib/kamisabiRoom/auth';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import * as store from '@/lib/kamisabiRoom/store';

const req = (token?: string) => new Request('http://localhost/api/x', { headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function seedRoom() {
  const room = await store.createRoom({ code: 'ABCDE', brand: 'music_ml', songs: [] });
  const host = await store.addPlayer({ roomId: room.id, name: 'host', seat: 0, isHost: true });
  const guest = await store.addPlayer({ roomId: room.id, name: 'guest', seat: 1, isHost: false });
  await store.createSecret({ roomId: room.id, playerId: host.id, token: 'tok-host' });
  await store.createSecret({ roomId: room.id, playerId: guest.id, token: 'tok-guest' });
  return { room, host, guest };
}

beforeEach(() => fake.reset());

describe('token 工具', () => {
  test('generateToken 每次不同且夠長', () => {
    const a = generateToken();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(generateToken()).not.toBe(a);
  });
  test('readBearer', () => {
    expect(readBearer(req('abc'))).toBe('abc');
    expect(readBearer(req())).toBeNull();
    expect(readBearer(new Request('http://x', { headers: { Authorization: 'Basic zzz' } }))).toBeNull();
  });
});

describe('authenticateRoomRequest', () => {
  test('找不到房間 → 404；沒 token → 401；token 錯 → 401；非房主但要求 hostOnly → 403', async () => {
    await seedRoom();
    await expect(authenticateRoomRequest(req('tok-host'), 'ZZZZZ')).rejects.toMatchObject({ statusCode: 404 });
    await expect(authenticateRoomRequest(req(), 'ABCDE')).rejects.toMatchObject({ statusCode: 401 });
    await expect(authenticateRoomRequest(req('nope'), 'ABCDE')).rejects.toMatchObject({ statusCode: 401 });
    await expect(authenticateRoomRequest(req('tok-guest'), 'ABCDE', { hostOnly: true })).rejects.toMatchObject({ statusCode: 403 });
  });
  test('成功回 room / player / secret / players，房號不分大小寫', async () => {
    const { host } = await seedRoom();
    const ctx = await authenticateRoomRequest(req('tok-host'), 'abcde', { hostOnly: true });
    expect(ctx.player.id).toBe(host.id);
    expect(ctx.players.map((p) => p.name)).toEqual(['host', 'guest']);
    expect(ctx.secret.token).toBe('tok-host');
  });
});

describe('runRoomMutation', () => {
  test('寫回 patch、version+1、回傳 result', async () => {
    await seedRoom();
    const result = await runRoomMutation(req('tok-host'), 'ABCDE', {}, (ctx) => ({
      patch: { status: 'playing' as const },
      result: { was: ctx.room.status },
    }));
    expect(result).toEqual({ was: 'lobby' });
    const room = await store.getRoomByCode('ABCDE');
    expect(room?.status).toBe('playing');
    expect(room?.version).toBe(1);
  });

  test('版本衝突時重讀再跑一次 fn（fn 看到最新 room）', async () => {
    const { room } = await seedRoom();
    let calls = 0;
    const result = await runRoomMutation(req('tok-host'), 'ABCDE', {}, async (ctx) => {
      calls++;
      if (calls === 1) {
        // 模擬別人在我們讀完之後先寫入
        await store.updateRoom(room.id, 0, { status: 'playing' });
      }
      return { patch: { mode: 'intro' as const }, result: ctx.room.version };
    });
    expect(calls).toBe(2);
    expect(result).toBe(1);
    expect((await store.getRoomByCode('ABCDE'))?.version).toBe(2);
  });

  test('連續衝突 3 次後放棄 → 409 VERSION_CONFLICT', async () => {
    const { room } = await seedRoom();
    let v = 0;
    await expect(
      runRoomMutation(req('tok-host'), 'ABCDE', {}, async () => {
        await store.updateRoom(room.id, v++, { status: 'lobby' });
        return { patch: { status: 'playing' as const }, result: null };
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  test('fn 丟 AppError 直接往外丟，不重試、不寫入', async () => {
    await seedRoom();
    let calls = 0;
    await expect(
      runRoomMutation(req('tok-host'), 'ABCDE', {}, () => { calls++; throw new AppError('x', 400, 'X'); }),
    ).rejects.toMatchObject({ code: 'X' });
    expect(calls).toBe(1);
    expect((await store.getRoomByCode('ABCDE'))?.version).toBe(0);
  });

  test('hands 有給時寫進 room_secrets', async () => {
    const { host } = await seedRoom();
    await runRoomMutation(req('tok-host'), 'ABCDE', {}, () => ({ patch: {}, result: null, hands: { [host.id]: ['s1', 's2'] } }));
    expect((await store.findSecretByToken((await store.getRoomByCode('ABCDE'))!.id, 'tok-host'))?.hand).toEqual(['s1', 's2']);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run tests/kamisabiRoomAuth.unit.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 4: 寫 `lib/kamisabiRoom/store.ts`**

```ts
import { AppError } from '@/lib/errors';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { PlayerRow, RoomMode, RoomRow, RoomSong, RoomState, RoomStatus, SecretRow } from './types';

/**
 * KAMISABI 房間的 Supabase 讀寫（service role）。只給 Route Handler 用。
 * 測試時整個模組會被 tests/helpers/fakeRoomStore.ts 取代，所以介面要保持簡單、可 mock。
 */

const PG_UNIQUE_VIOLATION = '23505';

function fail(message: string, error: { message: string; code?: string } | null): never {
  console.error('[kamisabi room store]', message, error);
  throw new AppError(`${message}（${error?.message ?? 'unknown'}）`, 500, 'SUPABASE_ERROR');
}

export async function createRoom(input: { code: string; brand: string; songs: RoomSong[] }): Promise<RoomRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('rooms')
    .insert({ code: input.code, brand: input.brand, songs: input.songs, state: {} })
    .select()
    .single();
  if (error?.code === PG_UNIQUE_VIOLATION) throw new AppError('房號重複，請再試一次。', 409, 'CODE_TAKEN');
  if (error || !data) fail('建立房間失敗', error);
  return data as RoomRow;
}

export async function getRoomByCode(code: string): Promise<RoomRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('rooms').select().eq('code', code).maybeSingle();
  if (error) fail('讀取房間失敗', error);
  return (data as RoomRow | null) ?? null;
}

export async function listPlayers(roomId: string): Promise<PlayerRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('room_players').select().eq('room_id', roomId).order('seat', { ascending: true });
  if (error) fail('讀取玩家失敗', error);
  return (data ?? []) as PlayerRow[];
}

export async function addPlayer(input: { roomId: string; name: string; seat: number; isHost: boolean }): Promise<PlayerRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('room_players')
    .insert({ room_id: input.roomId, name: input.name, seat: input.seat, is_host: input.isHost })
    .select()
    .single();
  if (error?.code === PG_UNIQUE_VIOLATION) throw new AppError('有人同時加入，請再試一次。', 409, 'SEAT_TAKEN');
  if (error || !data) fail('加入房間失敗', error);
  return data as PlayerRow;
}

export async function createSecret(input: { roomId: string; playerId: string; token: string }): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from('room_secrets').insert({ room_id: input.roomId, player_id: input.playerId, token: input.token, hand: [] });
  if (error) fail('建立玩家憑證失敗', error);
}

export async function findSecretByToken(roomId: string, token: string): Promise<SecretRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('room_secrets').select().eq('room_id', roomId).eq('token', token).maybeSingle();
  if (error) fail('驗證玩家失敗', error);
  return (data as SecretRow | null) ?? null;
}

export async function listSecrets(roomId: string): Promise<SecretRow[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('room_secrets').select().eq('room_id', roomId);
  if (error) fail('讀取手牌失敗', error);
  return (data ?? []) as SecretRow[];
}

export async function setHands(roomId: string, hands: Record<string, string[]>): Promise<void> {
  const db = getSupabaseAdmin();
  for (const [playerId, hand] of Object.entries(hands)) {
    const { error } = await db.from('room_secrets').update({ hand }).eq('room_id', roomId).eq('player_id', playerId);
    if (error) fail('寫入手牌失敗', error);
  }
}

/** 樂觀鎖：只有 version 沒被別人動過才寫入；0 列 → 409 VERSION_CONFLICT，呼叫端重讀再試 */
export async function updateRoom(
  roomId: string,
  expectedVersion: number,
  patch: { mode?: RoomMode; status?: RoomStatus; state?: RoomState },
): Promise<RoomRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('rooms')
    .update({ ...patch, version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .eq('version', expectedVersion)
    .select();
  if (error) fail('更新房間失敗', error);
  if (!data || data.length === 0) throw new AppError('房間狀態已被其他人更新，請重試。', 409, 'VERSION_CONFLICT');
  return data[0] as RoomRow;
}

export async function deleteStaleRooms(before: Date): Promise<number> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('rooms').delete().lt('updated_at', before.toISOString()).select('id');
  if (error) fail('清除舊房間失敗', error);
  return data?.length ?? 0;
}

/** 免費方案閒置 7 天會暫停專案；Cron 定期打一下 */
export async function pingDatabase(): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from('rooms').select('id').limit(1);
  if (error) fail('ping 失敗', error);
}
```

- [ ] **Step 5: 寫 `lib/kamisabiRoom/auth.ts`**

```ts
import { randomBytes } from 'crypto';
import { AppError } from '@/lib/errors';
import * as store from './store';
import type { PlayerRow, RoomRow, SecretRow } from './types';

export interface RoomContext {
  room: RoomRow;
  player: PlayerRow;
  secret: SecretRow;
  players: PlayerRow[];
}

/** 玩家憑證：加入時產生、存 room_secrets，瀏覽器放 localStorage，之後每個動作帶 Bearer */
export function generateToken(): string {
  return randomBytes(24).toString('hex');
}

export function readBearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const m = header.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function loadRoomOr404(code: string): Promise<RoomRow> {
  const room = await store.getRoomByCode(normalizeCode(code));
  if (!room) throw new AppError('找不到這個房間。', 404, 'ROOM_NOT_FOUND');
  return room;
}

export async function authenticateRoomRequest(
  request: Request,
  code: string,
  opts: { hostOnly?: boolean } = {},
): Promise<RoomContext> {
  const room = await loadRoomOr404(code);
  const token = readBearer(request);
  if (!token) throw new AppError('請先加入房間。', 401, 'NO_TOKEN');
  const secret = await store.findSecretByToken(room.id, token);
  if (!secret) throw new AppError('玩家憑證無效，請重新加入房間。', 401, 'BAD_TOKEN');
  const players = await store.listPlayers(room.id);
  const player = players.find((p) => p.id === secret.player_id);
  if (!player) throw new AppError('玩家不存在。', 401, 'BAD_TOKEN');
  if (opts.hostOnly && !player.is_host) throw new AppError('只有房主可以這麼做。', 403, 'NOT_HOST');
  return { room, player, secret, players };
}
```

- [ ] **Step 6: 寫 `lib/kamisabiRoom/mutate.ts`**

```ts
import { AppError } from '@/lib/errors';
import { authenticateRoomRequest, type RoomContext } from './auth';
import * as store from './store';
import type { RoomMode, RoomState, RoomStatus } from './types';

export interface MutationOutcome<T> {
  patch: { mode?: RoomMode; status?: RoomStatus; state?: RoomState };
  result: T;
  /** 時間軸模式：要寫回 room_secrets 的手牌（playerId → songIds） */
  hands?: Record<string, string[]>;
}

const MAX_ATTEMPTS = 3;

/**
 * 所有會改房間狀態的 API 都走這裡：
 * auth → 讀最新 room → 純函式算 patch → 樂觀鎖寫回；
 * 撞到 VERSION_CONFLICT 就重讀再算一次（最多 3 次），讓「兩人同時點牌」由第一個成功者得卡。
 * 純函式丟的 AppError（規則錯誤）直接往外丟，不重試。
 */
export async function runRoomMutation<T>(
  request: Request,
  code: string,
  opts: { hostOnly?: boolean },
  fn: (ctx: RoomContext) => MutationOutcome<T> | Promise<MutationOutcome<T>>,
): Promise<T> {
  let lastConflict: AppError | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ctx = await authenticateRoomRequest(request, code, opts);
    const outcome = await fn(ctx);
    try {
      await store.updateRoom(ctx.room.id, ctx.room.version, outcome.patch);
    } catch (e) {
      if (e instanceof AppError && e.code === 'VERSION_CONFLICT') {
        lastConflict = e;
        continue;
      }
      throw e;
    }
    if (outcome.hands) await store.setHands(ctx.room.id, outcome.hands);
    return outcome.result;
  }
  throw lastConflict ?? new AppError('房間狀態已被其他人更新，請重試。', 409, 'VERSION_CONFLICT');
}
```

- [ ] **Step 7: 跑測試確認通過**

Run: `npx vitest run tests/kamisabiRoomAuth.unit.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add lib/kamisabiRoom/store.ts lib/kamisabiRoom/auth.ts lib/kamisabiRoom/mutate.ts tests/helpers/fakeRoomStore.ts tests/kamisabiRoomAuth.unit.test.ts
git commit -m "feat(kamisabi): 房間 Supabase store、玩家 token 驗證、樂觀鎖 mutation helper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 開房快照：Neon 曲目 + 批次 iTunes 封面

**Files:**
- Modify: `lib/apple.ts`（`buildItunesLookupUrl` 接受多個 id；新增 `pickArtworkMap`）
- Create: `lib/kamisabiRoom/snapshot.ts`
- Test: `tests/apple.unit.test.ts`（追加）、`tests/kamisabiRoomSnapshot.unit.test.ts`

**Interfaces:**
- Produces: `buildItunesLookupUrl(trackIds: string | string[]): string`、`pickArtworkMap(results: ItunesTrack[]): Map<string, string>`（trackId → 600×600 封面）、`buildRoomSongs(brand: string, singleIds: string[]): Promise<RoomSong[]>`（少於 2 首丟 `AppError(400,'NOT_ENOUGH_SONGS')`；封面查詢失敗只留 null 不阻擋開房）、`fetchArtworkMap(trackIds: string[]): Promise<Map<string,string>>`。

- [ ] **Step 1: 在 `tests/apple.unit.test.ts` 追加失敗測試**

```ts
import { pickArtworkMap } from '../lib/apple';

describe('多筆 lookup', () => {
  test('buildItunesLookupUrl 接受陣列，用逗號串起', () => {
    expect(buildItunesLookupUrl(['1', '2'])).toBe('https://itunes.apple.com/lookup?id=1%2C2&country=jp&entity=song');
  });
  test('pickArtworkMap 只挑曲目、把 100x100 換成 600x600', () => {
    const results: ItunesTrack[] = [
      { wrapperType: 'collection', artworkUrl100: 'https://x/album/100x100bb.jpg' },
      { wrapperType: 'track', trackId: 11, artworkUrl100: 'https://x/a/100x100bb.jpg' },
      { wrapperType: 'track', trackId: 22 },
    ];
    const map = pickArtworkMap(results);
    expect(map.get('11')).toBe('https://x/a/600x600bb.jpg');
    expect(map.has('22')).toBe(false);
    expect(map.size).toBe(1);
  });
});
```

- [ ] **Step 2: 寫失敗測試 `tests/kamisabiRoomSnapshot.unit.test.ts`**

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

const findMany = vi.fn();
vi.mock('@/lib/prisma', () => ({ prisma: { song: { findMany } } }));

import { buildRoomSongs } from '@/lib/kamisabiRoom/snapshot';

const rows = [
  { id: 's1', title: 'A', brand: 'music_ml', appleTrackId: '11', releaseDate: '2020-01-01' },
  { id: 's2', title: 'B', brand: 'music_ml', appleTrackId: '22', releaseDate: null },
];

beforeEach(() => {
  findMany.mockReset();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results: [{ wrapperType: 'track', trackId: 11, artworkUrl100: 'https://x/a/100x100bb.jpg' }] }),
  }) as unknown as typeof fetch;
});

describe('buildRoomSongs', () => {
  test('只查該品牌有 appleTrackId 的歌、帶封面、依 singleIds 標 2 分', async () => {
    findMany.mockResolvedValue(rows);
    const songs = await buildRoomSongs('music_ml', ['s2']);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ brand: 'music_ml' }) }));
    expect(songs).toEqual([
      { id: 's1', title: 'A', brand: 'music_ml', trackId: '11', artworkUrl: 'https://x/a/600x600bb.jpg', releaseDate: '2020-01-01', points: 1 },
      { id: 's2', title: 'B', brand: 'music_ml', trackId: '22', artworkUrl: null, releaseDate: null, points: 2 },
    ]);
    // 一次 lookup 就好
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('id=11%2C22');
  });

  test('少於 2 首 → 400 NOT_ENOUGH_SONGS', async () => {
    findMany.mockResolvedValue([rows[0]]);
    await expect(buildRoomSongs('music_ml', [])).rejects.toMatchObject({ statusCode: 400, code: 'NOT_ENOUGH_SONGS' });
  });

  test('iTunes 掛了照樣開房，封面 null', async () => {
    findMany.mockResolvedValue(rows);
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'));
    const songs = await buildRoomSongs('music_ml', []);
    expect(songs.every((s) => s.artworkUrl === null)).toBe(true);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run tests/apple.unit.test.ts tests/kamisabiRoomSnapshot.unit.test.ts`
Expected: FAIL

- [ ] **Step 4: 修改 `lib/apple.ts`**

把 `buildItunesLookupUrl` 改成：

```ts
/** 一次可查多個 trackId（iTunes lookup 支援逗號分隔，實測 200 個以內 OK） */
export function buildItunesLookupUrl(trackIds: string | string[]): string {
  const ids = Array.isArray(trackIds) ? trackIds : [trackIds];
  const params = new URLSearchParams({
    id: ids.join(','),
    country: ITUNES_COUNTRY,
    entity: 'song',
  });
  return `https://itunes.apple.com/lookup?${params.toString()}`;
}
```

在 `pickApplePreview` 前面加：

```ts
export function toLargeArtwork(artworkUrl100: string): string {
  // artworkUrl100 的路徑尾巴是 "100x100bb.jpg"，換成 600x600 可拿高解析封面
  return artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.');
}

/** 多筆 lookup → trackId → 600×600 封面（房間開房時一次抓 50 張） */
export function pickArtworkMap(results: ItunesTrack[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of results) {
    if ((r.wrapperType === 'track' || r.kind === 'song') && r.trackId !== undefined && r.artworkUrl100) {
      map.set(String(r.trackId), toLargeArtwork(r.artworkUrl100));
    }
  }
  return map;
}
```

並把 `pickApplePreview` 內的 `artworkUrl: track.artworkUrl100 ? track.artworkUrl100.replace(...) : null` 改成 `artworkUrl: track.artworkUrl100 ? toLargeArtwork(track.artworkUrl100) : null`。

- [ ] **Step 5: 寫 `lib/kamisabiRoom/snapshot.ts`**

```ts
import { AppError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { buildItunesLookupUrl, pickArtworkMap, type ItunesTrack } from '@/lib/apple';
import type { RoomSong } from './types';

const LOOKUP_CHUNK = 100;
const LOOKUP_REVALIDATE_SECONDS = 6 * 60 * 60;

/** 一次抓多個 trackId 的封面；任何失敗都只回空 map，不阻擋開房 */
export async function fetchArtworkMap(trackIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < trackIds.length; i += LOOKUP_CHUNK) {
    const chunk = trackIds.slice(i, i + LOOKUP_CHUNK);
    try {
      const res = await fetch(buildItunesLookupUrl(chunk), {
        next: { revalidate: LOOKUP_REVALIDATE_SECONDS },
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { results?: ItunesTrack[] };
      for (const [k, v] of pickArtworkMap(data.results ?? [])) map.set(k, v);
    } catch (err) {
      console.error('[kamisabi room] artwork lookup failed', err);
    }
  }
  return map;
}

/**
 * 開房快照：該品牌所有有 Apple 曲目 ID 的歌（歌牌收錄曲）。
 * 之後整場遊戲只讀 rooms.songs，不再碰 Neon。
 */
export async function buildRoomSongs(brand: string, singleIds: string[]): Promise<RoomSong[]> {
  const rows = await prisma.song.findMany({
    where: { brand, appleTrackId: { not: null }, NOT: { appleTrackId: '' } },
    select: { id: true, title: true, brand: true, appleTrackId: true, releaseDate: true },
    orderBy: { title: 'asc' },
  });
  if (rows.length < 2) {
    throw new AppError('這個品牌可出題的歌不足 2 首（需先補 Apple Music 曲目 ID）。', 400, 'NOT_ENOUGH_SONGS');
  }
  const artwork = await fetchArtworkMap(rows.map((r) => r.appleTrackId as string));
  const singles = new Set(singleIds);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    brand: r.brand,
    trackId: r.appleTrackId as string,
    artworkUrl: artwork.get(r.appleTrackId as string) ?? null,
    releaseDate: r.releaseDate ?? null,
    points: singles.has(r.id) ? 2 : 1,
  }));
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run tests/apple.unit.test.ts tests/kamisabiRoomSnapshot.unit.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/apple.ts lib/kamisabiRoom/snapshot.ts tests/apple.unit.test.ts tests/kamisabiRoomSnapshot.unit.test.ts
git commit -m "feat(kamisabi): 開房快照：Neon 曲目 + 一次批次 iTunes lookup 抓封面

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: API：開房、讀房、加入

**Files:**
- Create: `app/api/kamisabi/room/route.ts`（POST 開房）
- Create: `app/api/kamisabi/room/[code]/route.ts`（GET 公開狀態）
- Create: `app/api/kamisabi/room/[code]/join/route.ts`
- Create: `lib/kamisabiRoom/http.ts`（共用：讀 JSON body、玩家名稱驗證、公開 room 形狀）
- Test: `tests/kamisabiRoomApi.test.ts`

**Interfaces:**
- Consumes: Task 2 `generateRoomCode`、Task 4 store/auth、Task 5 `buildRoomSongs`。
- Produces（HTTP 合約，前端 `roomApi.ts` 依此實作）：
  - `POST /api/kamisabi/room` body `{ name, brand, singles?: string[] }` → 201 `{ code, roomId, playerId, token }`
  - `GET /api/kamisabi/room/[code]` → 200 `{ room: PublicRoom, players: PlayerRow[], serverNow: number }`；`PublicRoom = Pick<RoomRow,'id'|'code'|'mode'|'status'|'brand'|'songs'|'state'|'version'>`
  - `POST /api/kamisabi/room/[code]/join` body `{ name }` → 201 `{ playerId, token, seat }`；房間不在 lobby → 409 `ROOM_STARTED`；滿員 → 409 `ROOM_FULL`
  - `http.ts`：`readJson<T>(request): Promise<T>`（壞 JSON → 400）、`validatePlayerName(v: unknown): string`（trim、1–12 字）、`toPublicRoom(room): PublicRoom`、`routeParams(ctx): Promise<{ code: string }>`

- [ ] **Step 1: 寫失敗測試 `tests/kamisabiRoomApi.test.ts`（先寫這三支 route 的部分；之後 Task 7/8 追加）**

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createFakeStore } from './helpers/fakeRoomStore';
import type { RoomSong } from '@/lib/kamisabiRoom/types';

const fake = createFakeStore();
vi.mock('@/lib/kamisabiRoom/store', () => fake);

const buildRoomSongs = vi.fn();
vi.mock('@/lib/kamisabiRoom/snapshot', () => ({ buildRoomSongs: (...args: unknown[]) => buildRoomSongs(...args) }));

import { resetRateLimits } from '@/lib/rateLimit';
import { POST as createRoom } from '@/app/api/kamisabi/room/route';
import { GET as getRoom } from '@/app/api/kamisabi/room/[code]/route';
import { POST as joinRoom } from '@/app/api/kamisabi/room/[code]/join/route';

const song = (id: string, points: 1 | 2 = 1, releaseDate: string | null = null): RoomSong => ({
  id, title: `Song ${id}`, brand: 'music_ml', trackId: `t${id}`, artworkUrl: null, releaseDate, points,
});
export const SONGS = [song('a'), song('b', 2), song('c')];

export const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
export function post(path: string, body: unknown, token?: string, ip = '1.1.1.1') {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
export function get(path: string, token?: string) {
  return new Request(`http://localhost${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

export async function openRoom(name = 'host', ip = '1.1.1.1') {
  const res = await createRoom(post('/api/kamisabi/room', { name, brand: 'music_ml', singles: ['b'] }, undefined, ip));
  expect(res.status).toBe(201);
  return (await res.json()) as { code: string; roomId: string; playerId: string; token: string };
}
export async function joinAs(code: string, name: string) {
  const res = await joinRoom(post(`/api/kamisabi/room/${code}/join`, { name }, undefined, `2.2.2.${name.length}`), ctx(code));
  expect(res.status).toBe(201);
  return (await res.json()) as { playerId: string; token: string; seat: number };
}

beforeEach(() => {
  fake.reset();
  resetRateLimits();
  buildRoomSongs.mockReset().mockResolvedValue(SONGS);
});

describe('POST /api/kamisabi/room', () => {
  test('開房：快照曲目、房主 seat 0、回 code/token', async () => {
    const r = await openRoom();
    expect(r.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(r.token).toMatch(/^[0-9a-f]{48}$/);
    expect(buildRoomSongs).toHaveBeenCalledWith('music_ml', ['b']);
    const room = await fake.getRoomByCode(r.code);
    expect(room?.status).toBe('lobby');
    expect(room?.songs).toEqual(SONGS);
    const players = await fake.listPlayers(room!.id);
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ name: 'host', seat: 0, is_host: true });
  });

  test('名字空白 / 太長 / brand 缺 → 400', async () => {
    for (const body of [{ name: '   ', brand: 'music_ml' }, { name: 'x'.repeat(13), brand: 'music_ml' }, { name: 'ok' }]) {
      const res = await createRoom(post('/api/kamisabi/room', body));
      expect(res.status).toBe(400);
    }
  });

  test('快照丟 NOT_ENOUGH_SONGS 時原樣回 400', async () => {
    const { AppError } = await import('@/lib/errors');
    buildRoomSongs.mockRejectedValue(new AppError('不足', 400, 'NOT_ENOUGH_SONGS'));
    const res = await createRoom(post('/api/kamisabi/room', { name: 'h', brand: 'music_ml' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('NOT_ENOUGH_SONGS');
  });

  test('同一 IP 開房太頻繁 → 429', async () => {
    for (let i = 0; i < 5; i++) await openRoom('h', '9.9.9.9');
    const res = await createRoom(post('/api/kamisabi/room', { name: 'h', brand: 'music_ml' }, undefined, '9.9.9.9'));
    expect(res.status).toBe(429);
  });
});

describe('GET /api/kamisabi/room/[code]', () => {
  test('回公開狀態、玩家、serverNow；房號不分大小寫；找不到 → 404', async () => {
    const r = await openRoom();
    const res = await getRoom(get(`/api/kamisabi/room/${r.code.toLowerCase()}`), ctx(r.code.toLowerCase()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room).toMatchObject({ code: r.code, status: 'lobby', version: 0, songs: SONGS });
    expect(body.room).not.toHaveProperty('updated_at');
    expect(body.players[0].name).toBe('host');
    expect(Math.abs(body.serverNow - Date.now())).toBeLessThan(5000);
    expect((await getRoom(get('/api/kamisabi/room/ZZZZZ'), ctx('ZZZZZ'))).status).toBe(404);
  });
});

describe('POST /api/kamisabi/room/[code]/join', () => {
  test('加入：seat 遞增、token 各自不同', async () => {
    const r = await openRoom();
    const g1 = await joinAs(r.code, 'g1');
    const g2 = await joinAs(r.code, 'g22');
    expect(g1.seat).toBe(1);
    expect(g2.seat).toBe(2);
    expect(g1.token).not.toBe(g2.token);
  });

  test('已開始 → 409 ROOM_STARTED；滿 8 人 → 409 ROOM_FULL；壞 JSON → 400', async () => {
    const r = await openRoom();
    const room = await fake.getRoomByCode(r.code);
    for (let i = 1; i < 8; i++) await joinAs(r.code, `p${'x'.repeat(i)}`);
    const full = await joinRoom(post(`/api/kamisabi/room/${r.code}/join`, { name: 'late' }), ctx(r.code));
    expect(full.status).toBe(409);
    expect((await full.json()).code).toBe('ROOM_FULL');

    await fake.updateRoom(room!.id, 0, { status: 'playing' });
    const started = await joinRoom(post(`/api/kamisabi/room/${r.code}/join`, { name: 'late' }), ctx(r.code));
    expect((await started.json()).code).toBe('ROOM_STARTED');

    const bad = await joinRoom(new Request(`http://localhost/api/kamisabi/room/${r.code}/join`, { method: 'POST', body: '{nope' }), ctx(r.code));
    expect(bad.status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/kamisabiRoomApi.test.ts`
Expected: FAIL（route 模組不存在）

- [ ] **Step 3: 寫 `lib/kamisabiRoom/http.ts`**

```ts
import { AppError } from '@/lib/errors';
import { PLAYER_NAME_MAX, type RoomRow } from './types';

export type PublicRoom = Pick<RoomRow, 'id' | 'code' | 'mode' | 'status' | 'brand' | 'songs' | 'state' | 'version'>;

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError('請求格式不正確。', 400, 'BAD_JSON');
  }
}

export function validatePlayerName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new AppError('請輸入名字。', 400, 'BAD_NAME');
  if (name.length > PLAYER_NAME_MAX) throw new AppError(`名字最多 ${PLAYER_NAME_MAX} 個字。`, 400, 'BAD_NAME');
  return name;
}

export function toPublicRoom(room: RoomRow): PublicRoom {
  const { id, code, mode, status, brand, songs, state, version } = room;
  return { id, code, mode, status, brand, songs, state, version };
}

/** Next.js 16：Route Handler 的 params 是 Promise */
export async function routeParams(ctx: { params: Promise<{ code: string }> }): Promise<{ code: string }> {
  return ctx.params;
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
}
```

- [ ] **Step 4: 寫 `app/api/kamisabi/room/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { rateLimit } from '@/lib/rateLimit';
import { BRAND_VALUES } from '@/lib/brandMap';
import { generateRoomCode } from '@/lib/kamisabiRoom/logic';
import { buildRoomSongs } from '@/lib/kamisabiRoom/snapshot';
import { generateToken } from '@/lib/kamisabiRoom/auth';
import { clientIp, readJson, validatePlayerName } from '@/lib/kamisabiRoom/http';
import * as store from '@/lib/kamisabiRoom/store';

/**
 * POST /api/kamisabi/room  { name, brand, singles?: string[] }
 * 開房：快照 Neon 曲目 → rooms / room_players（房主 seat 0）/ room_secrets → 回 { code, roomId, playerId, token }
 */
export async function POST(request: Request) {
  try {
    if (!rateLimit(`kamisabi-room-create:${clientIp(request)}`, 5, 1, 12000)) {
      throw new AppError('開房太頻繁，請稍後再試。', 429, 'RATE_LIMITED');
    }
    const body = await readJson<{ name?: unknown; brand?: unknown; singles?: unknown }>(request);
    const name = validatePlayerName(body.name);
    const brand = typeof body.brand === 'string' ? body.brand : '';
    if (!(BRAND_VALUES as readonly string[]).includes(brand)) throw new AppError('請選擇品牌。', 400, 'BAD_BRAND');
    const singles = Array.isArray(body.singles) ? body.singles.filter((x): x is string => typeof x === 'string') : [];

    const songs = await buildRoomSongs(brand, singles);

    let room = null;
    for (let attempt = 0; attempt < 5 && !room; attempt++) {
      try {
        room = await store.createRoom({ code: generateRoomCode(), brand, songs });
      } catch (e) {
        if (!(e instanceof AppError && e.code === 'CODE_TAKEN')) throw e;
      }
    }
    if (!room) throw new AppError('房號產生失敗，請再試一次。', 500, 'CODE_TAKEN');

    const player = await store.addPlayer({ roomId: room.id, name, seat: 0, isHost: true });
    const token = generateToken();
    await store.createSecret({ roomId: room.id, playerId: player.id, token });

    return NextResponse.json({ code: room.code, roomId: room.id, playerId: player.id, token }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 5: 寫 `app/api/kamisabi/room/[code]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { handleError } from '@/lib/errors';
import { loadRoomOr404 } from '@/lib/kamisabiRoom/auth';
import { routeParams, toPublicRoom } from '@/lib/kamisabiRoom/http';
import * as store from '@/lib/kamisabiRoom/store';

/**
 * GET /api/kamisabi/room/[code]
 * 公開狀態（任何人可讀，和 anon key 直讀 Supabase 看到的一樣）+ serverNow 讓前端校正時鐘。
 * 初次載入與 Realtime 不可用時的輪詢都打這支。
 */
export async function GET(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const room = await loadRoomOr404(code);
    const players = await store.listPlayers(room.id);
    return NextResponse.json({ room: toPublicRoom(room), players, serverNow: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 6: 寫 `app/api/kamisabi/room/[code]/join/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { rateLimit } from '@/lib/rateLimit';
import { generateToken, loadRoomOr404 } from '@/lib/kamisabiRoom/auth';
import { clientIp, readJson, routeParams, validatePlayerName } from '@/lib/kamisabiRoom/http';
import { MAX_PLAYERS } from '@/lib/kamisabiRoom/types';
import * as store from '@/lib/kamisabiRoom/store';

/**
 * POST /api/kamisabi/room/[code]/join  { name }  → { playerId, token, seat }
 * 只有 lobby 能加入；seat = 目前人數（撞到 unique 就重試一次）。
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    if (!rateLimit(`kamisabi-room-join:${clientIp(request)}`, 10, 2, 10000)) {
      throw new AppError('加入太頻繁，請稍後再試。', 429, 'RATE_LIMITED');
    }
    const { code } = await routeParams(ctx);
    const body = await readJson<{ name?: unknown }>(request);
    const name = validatePlayerName(body.name);
    const room = await loadRoomOr404(code);
    if (room.status !== 'lobby') throw new AppError('遊戲已經開始，無法加入。', 409, 'ROOM_STARTED');

    let player = null;
    for (let attempt = 0; attempt < 2 && !player; attempt++) {
      const players = await store.listPlayers(room.id);
      if (players.length >= MAX_PLAYERS) throw new AppError(`房間已滿（最多 ${MAX_PLAYERS} 人）。`, 409, 'ROOM_FULL');
      try {
        player = await store.addPlayer({ roomId: room.id, name, seat: players.length, isHost: false });
      } catch (e) {
        if (!(e instanceof AppError && e.code === 'SEAT_TAKEN')) throw e;
      }
    }
    if (!player) throw new AppError('有人同時加入，請再試一次。', 409, 'SEAT_TAKEN');

    const token = generateToken();
    await store.createSecret({ roomId: room.id, playerId: player.id, token });
    return NextResponse.json({ playerId: player.id, token, seat: player.seat }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 7: 跑測試確認通過**

Run: `npx vitest run tests/kamisabiRoomApi.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add lib/kamisabiRoom/http.ts app/api/kamisabi/room/route.ts "app/api/kamisabi/room/[code]/route.ts" "app/api/kamisabi/room/[code]/join/route.ts" tests/kamisabiRoomApi.test.ts
git commit -m "feat(kamisabi): 房間 API：開房、讀取公開狀態、加入

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: API：開始、下一張、搶牌、丟牌、結束

**Files:**
- Create: `app/api/kamisabi/room/[code]/start/route.ts`
- Create: `app/api/kamisabi/room/[code]/next/route.ts`
- Create: `app/api/kamisabi/room/[code]/claim/route.ts`
- Create: `app/api/kamisabi/room/[code]/discard/route.ts`
- Create: `app/api/kamisabi/room/[code]/end/route.ts`
- Test: `tests/kamisabiRoomApi.test.ts`（追加）

**Interfaces:**
- Consumes: Task 2/3 純函式、Task 4 `runRoomMutation`、Task 6 helper。
- Produces（HTTP）：
  - `POST .../start` 房主 `{ mode }` → `{ state }`；人數 < 2 → 400 `NOT_ENOUGH_PLAYERS`；非 lobby → 409 `ROOM_STARTED`；timeline 曲數不足 → 400 `NOT_ENOUGH_DATED_SONGS`
  - `POST .../next` 房主（intro/karuta）→ `{ state, finished: boolean }`
  - `POST .../claim` `{ songId }` → `{ result: 'correct'|'otetsuki'|'otetsuki_no_cards', cards: RoomSong[] (otetsuki 時可丟的牌), finished }`；規則錯誤 400/409 帶 code
  - `POST .../discard` `{ songId }` → `{ state }`
  - `POST .../end` 房主 → `{ status: 'finished' }`

- [ ] **Step 1: 追加失敗測試**

```ts
import { POST as startRoom } from '@/app/api/kamisabi/room/[code]/start/route';
import { POST as nextCard } from '@/app/api/kamisabi/room/[code]/next/route';
import { POST as claimCard } from '@/app/api/kamisabi/room/[code]/claim/route';
import { POST as discardCard } from '@/app/api/kamisabi/room/[code]/discard/route';
import { POST as endRoom } from '@/app/api/kamisabi/room/[code]/end/route';
import type { IntroState } from '@/lib/kamisabiRoom/types';

async function introGame() {
  const host = await openRoom();
  const guest = await joinAs(host.code, 'guest');
  const res = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'intro' }, host.token), ctx(host.code));
  expect(res.status).toBe(200);
  return { host, guest, code: host.code };
}
async function state(code: string) {
  return (await fake.getRoomByCode(code))!.state as IntroState;
}

describe('start / next / claim / discard / end', () => {
  test('start：非房主 403；人數不足 400；成功後 status=playing、mode 寫入、state 初始化', async () => {
    const host = await openRoom();
    const alone = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'intro' }, host.token), ctx(host.code));
    expect((await alone.json()).code).toBe('NOT_ENOUGH_PLAYERS');
    const guest = await joinAs(host.code, 'guest');
    const forbidden = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'intro' }, guest.token), ctx(host.code));
    expect(forbidden.status).toBe(403);
    const badMode = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'best5' }, host.token), ctx(host.code));
    expect(badMode.status).toBe(400);
    const ok = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'karuta' }, host.token), ctx(host.code));
    expect(ok.status).toBe(200);
    const room = await fake.getRoomByCode(host.code);
    expect(room).toMatchObject({ status: 'playing', mode: 'karuta', version: 1 });
    expect((room!.state as IntroState).kind).toBe('intro');
    const again = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'intro' }, host.token), ctx(host.code));
    expect((await again.json()).code).toBe('ROOM_STARTED');
  });

  test('next → claim 正確 → next → 全部取完自動 finished', async () => {
    const { host, guest, code } = await introGame();
    const n1 = await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, host.token), ctx(code));
    expect(n1.status).toBe(200);
    let s = await state(code);
    expect(s.round).toBe(1);
    expect(s.currentSongId).not.toBeNull();
    expect(Date.parse(s.startsAt!)).toBeGreaterThan(Date.now());

    // 非房主不能出題
    expect((await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, guest.token), ctx(code))).status).toBe(403);

    const c1 = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, guest.token), ctx(code));
    expect(c1.status).toBe(200);
    expect(await c1.json()).toMatchObject({ result: 'correct', finished: false });
    s = await state(code);
    expect(s.taken[s.currentSongId!]).toBe(guest.playerId);
    expect(s.resolved).toBe(true);

    // 慢了一步
    const late = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, host.token), ctx(code));
    expect(late.status).toBe(409);
    expect((await late.json()).code).toBe('ROUND_RESOLVED');

    // 把剩下兩張都拿掉 → finished
    for (let i = 0; i < 2; i++) {
      await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, host.token), ctx(code));
      s = await state(code);
      const res = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, host.token), ctx(code));
      expect(res.status).toBe(200);
    }
    expect((await fake.getRoomByCode(code))!.status).toBe('finished');
    s = await state(code);
    expect(s.scores[host.playerId]).toBeGreaterThan(0);
  });

  test('お手つき：有牌的人收到可丟的牌，丟完才能再搶', async () => {
    const { host, guest, code } = await introGame();
    await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, host.token), ctx(code));
    let s = await state(code);
    await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, guest.token), ctx(code));
    const firstCard = s.currentSongId!;

    await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, host.token), ctx(code));
    s = await state(code);
    const wrong = SONGS.find((x) => x.id !== s.currentSongId && x.id !== firstCard)!.id;
    const o = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: wrong }, guest.token), ctx(code));
    expect(o.status).toBe(200);
    const body = await o.json();
    expect(body.result).toBe('otetsuki');
    expect(body.cards.map((c: RoomSong) => c.id)).toEqual([firstCard]);

    const blocked = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, guest.token), ctx(code));
    expect((await blocked.json()).code).toBe('DISCARD_PENDING');

    const notMine = await discardCard(post(`/api/kamisabi/room/${code}/discard`, { songId: wrong }, guest.token), ctx(code));
    expect(notMine.status).toBe(400);
    const d = await discardCard(post(`/api/kamisabi/room/${code}/discard`, { songId: firstCard }, guest.token), ctx(code));
    expect(d.status).toBe(200);
    s = await state(code);
    expect(s.taken[firstCard]).toBeUndefined();
    expect(s.pendingDiscards).toEqual({});

    const ok = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: s.currentSongId }, guest.token), ctx(code));
    expect(ok.status).toBe(200);
  });

  test('沒牌的人點錯 → otetsuki_no_cards，不用丟牌', async () => {
    const { host, guest, code } = await introGame();
    await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, host.token), ctx(code));
    const s = await state(code);
    const wrong = SONGS.find((x) => x.id !== s.currentSongId)!.id;
    const o = await claimCard(post(`/api/kamisabi/room/${code}/claim`, { songId: wrong }, guest.token), ctx(code));
    expect(await o.json()).toMatchObject({ result: 'otetsuki_no_cards', cards: [] });
  });

  test('claim 在 lobby / 時間軸模式 → 409；end 只有房主', async () => {
    const host = await openRoom();
    const guest = await joinAs(host.code, 'guest');
    const lobby = await claimCard(post(`/api/kamisabi/room/${host.code}/claim`, { songId: 'a' }, guest.token), ctx(host.code));
    expect(lobby.status).toBe(409);
    expect((await endRoom(post(`/api/kamisabi/room/${host.code}/end`, {}, guest.token), ctx(host.code))).status).toBe(403);
    const ended = await endRoom(post(`/api/kamisabi/room/${host.code}/end`, {}, host.token), ctx(host.code));
    expect(ended.status).toBe(200);
    expect((await fake.getRoomByCode(host.code))!.status).toBe('finished');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/kamisabiRoomApi.test.ts`
Expected: FAIL

- [ ] **Step 3: 寫 `app/api/kamisabi/room/[code]/start/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { createIntroState, dealTimeline } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { readJson, routeParams } from '@/lib/kamisabiRoom/http';
import { MAX_PLAYERS, MIN_PLAYERS, ROOM_MODES, type RoomMode } from '@/lib/kamisabiRoom/types';

/**
 * POST /api/kamisabi/room/[code]/start  { mode }（房主）
 * intro / karuta：空的搶牌狀態；timeline：發牌、手牌寫進 room_secrets。
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const body = await readJson<{ mode?: unknown }>(request);
    const mode = body.mode as RoomMode;
    if (!ROOM_MODES.includes(mode)) throw new AppError('請選擇玩法。', 400, 'BAD_MODE');

    const state = await runRoomMutation(request, code, { hostOnly: true }, ({ room, players }) => {
      if (room.status !== 'lobby') throw new AppError('遊戲已經開始了。', 409, 'ROOM_STARTED');
      if (players.length < MIN_PLAYERS) throw new AppError(`至少需要 ${MIN_PLAYERS} 位玩家。`, 400, 'NOT_ENOUGH_PLAYERS');
      if (players.length > MAX_PLAYERS) throw new AppError(`最多 ${MAX_PLAYERS} 位玩家。`, 400, 'TOO_MANY_PLAYERS');

      if (mode === 'timeline') {
        const order = [...players].sort((a, b) => a.seat - b.seat).map((p) => p.id);
        const dealt = dealTimeline(room.songs, order);
        return { patch: { mode, status: 'playing' as const, state: dealt.state }, hands: dealt.hands, result: dealt.state };
      }
      const intro = createIntroState();
      return { patch: { mode, status: 'playing' as const, state: intro }, result: intro };
    });

    return NextResponse.json({ state });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 4: 寫 `app/api/kamisabi/room/[code]/next/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { isIntroFinished, pickNextSong } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { routeParams } from '@/lib/kamisabiRoom/http';
import { isIntroState } from '@/lib/kamisabiRoom/types';

/** POST /api/kamisabi/room/[code]/next（房主）：出下一張；沒牌可出就結束 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const result = await runRoomMutation(request, code, { hostOnly: true }, ({ room }) => {
      if (room.status !== 'playing' || !isIntroState(room.state)) {
        throw new AppError('目前不是搶牌模式的進行中房間。', 409, 'NOT_PLAYING');
      }
      const next = pickNextSong(room.state, room.songs, Date.now());
      if (!next) {
        if (!isIntroFinished(room.state, room.songs)) throw new AppError('還有玩家沒丟牌，請等他們丟完。', 409, 'DISCARD_PENDING');
        return { patch: { status: 'finished' as const }, result: { state: room.state, finished: true } };
      }
      return { patch: { state: next }, result: { state: next, finished: false } };
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 5: 寫 `app/api/kamisabi/room/[code]/claim/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { rateLimit } from '@/lib/rateLimit';
import { applyClaim, isIntroFinished, ownedSongs } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { readBearer } from '@/lib/kamisabiRoom/auth';
import { readJson, routeParams } from '@/lib/kamisabiRoom/http';
import { isIntroState } from '@/lib/kamisabiRoom/types';

/**
 * POST /api/kamisabi/room/[code]/claim  { songId }
 * 第一個成功寫入的人得卡（樂觀鎖）；點錯回 otetsuki 與可丟的牌。
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    if (!rateLimit(`kamisabi-room-claim:${readBearer(request) ?? 'anon'}`, 20, 5, 5000)) {
      throw new AppError('點太快了，請稍等。', 429, 'RATE_LIMITED');
    }
    const body = await readJson<{ songId?: unknown }>(request);
    const songId = typeof body.songId === 'string' ? body.songId : '';
    if (!songId) throw new AppError('缺少 songId。', 400, 'BAD_REQUEST');

    const result = await runRoomMutation(request, code, {}, ({ room, player }) => {
      if (room.status !== 'playing' || !isIntroState(room.state)) {
        throw new AppError('目前不是搶牌模式的進行中房間。', 409, 'NOT_PLAYING');
      }
      const { state, result } = applyClaim(room.state, room.songs, player.id, songId);
      const finished = isIntroFinished(state, room.songs);
      return {
        patch: finished ? { state, status: 'finished' as const } : { state },
        result: { result, finished, cards: result === 'otetsuki' ? ownedSongs(state, room.songs, player.id) : [] },
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 6: 寫 `app/api/kamisabi/room/[code]/discard/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { applyDiscard } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { readJson, routeParams } from '@/lib/kamisabiRoom/http';
import { isIntroState } from '@/lib/kamisabiRoom/types';

/** POST /api/kamisabi/room/[code]/discard  { songId }：お手つき後自選一張丟回場上 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const body = await readJson<{ songId?: unknown }>(request);
    const songId = typeof body.songId === 'string' ? body.songId : '';
    if (!songId) throw new AppError('缺少 songId。', 400, 'BAD_REQUEST');

    const state = await runRoomMutation(request, code, {}, ({ room, player }) => {
      if (!isIntroState(room.state)) throw new AppError('目前不是搶牌模式。', 409, 'NOT_PLAYING');
      const next = applyDiscard(room.state, room.songs, player.id, songId);
      return { patch: { state: next }, result: next };
    });
    return NextResponse.json({ state });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 7: 寫 `app/api/kamisabi/room/[code]/end/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { handleError } from '@/lib/errors';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { routeParams } from '@/lib/kamisabiRoom/http';

/** POST /api/kamisabi/room/[code]/end（房主）：提前結束，進結算畫面 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    await runRoomMutation(request, code, { hostOnly: true }, () => ({ patch: { status: 'finished' as const }, result: null }));
    return NextResponse.json({ status: 'finished' });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 8: 跑測試確認通過**

Run: `npx vitest run tests/kamisabiRoomApi.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add "app/api/kamisabi/room/[code]" tests/kamisabiRoomApi.test.ts
git commit -m "feat(kamisabi): 房間 API：開始、下一張、搶牌、お手つき丟牌、結束

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: API：時間軸放牌與手牌

**Files:**
- Create: `app/api/kamisabi/room/[code]/place/route.ts`
- Create: `app/api/kamisabi/room/[code]/hand/route.ts`
- Test: `tests/kamisabiRoomApi.test.ts`（追加）

**Interfaces:**
- Produces（HTTP）：
  - `GET .../hand`（帶 token）→ `{ hand: string[] }`
  - `POST .../place` `{ songId, slot }` → `{ correct, releaseDate, hand: string[], state, finished }`

- [ ] **Step 1: 追加失敗測試**

```ts
import { POST as placeCard } from '@/app/api/kamisabi/room/[code]/place/route';
import { GET as getHand } from '@/app/api/kamisabi/room/[code]/hand/route';
import type { TimelineState } from '@/lib/kamisabiRoom/types';

const DATED = Array.from({ length: 12 }, (_, i) => song(`d${String(i + 1).padStart(2, '0')}`, 1, `20${String(i + 10)}-01-01`));

describe('timeline: start / hand / place', () => {
  test('曲數不足 → 400 NOT_ENOUGH_DATED_SONGS，房間留在 lobby', async () => {
    const host = await openRoom();            // SONGS 都沒日期
    await joinAs(host.code, 'guest');
    const res = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'timeline' }, host.token), ctx(host.code));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('NOT_ENOUGH_DATED_SONGS');
    expect((await fake.getRoomByCode(host.code))!.status).toBe('lobby');
  });

  test('發牌後各自只看得到自己的手牌；輪到的人放牌；放錯罰抽', async () => {
    buildRoomSongs.mockResolvedValue(DATED);
    const host = await openRoom();
    const guest = await joinAs(host.code, 'guest');
    const started = await startRoom(post(`/api/kamisabi/room/${host.code}/start`, { mode: 'timeline' }, host.token), ctx(host.code));
    expect(started.status).toBe(200);
    const code = host.code;
    let s = (await fake.getRoomByCode(code))!.state as TimelineState;
    expect(s.line).toHaveLength(1);
    expect(s.deckCount).toBe(1);

    const hHand = (await (await getHand(get(`/api/kamisabi/room/${code}/hand`, host.token), ctx(code))).json()).hand as string[];
    const gHand = (await (await getHand(get(`/api/kamisabi/room/${code}/hand`, guest.token), ctx(code))).json()).hand as string[];
    expect(hHand).toHaveLength(5);
    expect(gHand).toHaveLength(5);
    expect(hHand.some((id) => gHand.includes(id))).toBe(false);
    expect((await getHand(get(`/api/kamisabi/room/${code}/hand`), ctx(code))).status).toBe(401);

    const turn = s.order[s.turnSeat] === host.playerId ? { me: host, hand: hHand } : { me: guest, hand: gHand };
    const other = turn.me === host ? guest : host;

    // 不是你的回合
    const nyt = await placeCard(post(`/api/kamisabi/room/${code}/place`, { songId: 'd01', slot: 0 }, other.token), ctx(code));
    expect((await nyt.json()).code).toBe('NOT_YOUR_TURN');

    // 故意放錯：把手牌中最舊的放最右邊（初期札之後）── 除非初期札比它更舊，那就放最左邊
    const byId = new Map(DATED.map((x) => [x.id, x]));
    const oldest = [...turn.hand].sort((a, b) => byId.get(a)!.releaseDate!.localeCompare(byId.get(b)!.releaseDate!))[0];
    const initialDate = byId.get(s.line[0])!.releaseDate!;
    const wrongSlot = byId.get(oldest)!.releaseDate! <= initialDate ? 1 : 0;
    const wrong = await placeCard(post(`/api/kamisabi/room/${code}/place`, { songId: oldest, slot: wrongSlot }, turn.me.token), ctx(code));
    expect(wrong.status).toBe(200);
    const wb = await wrong.json();
    expect(wb.correct).toBe(false);
    expect(wb.hand).toHaveLength(6); // 罰抽
    expect(wb.releaseDate).toBe(byId.get(oldest)!.releaseDate);
    s = (await fake.getRoomByCode(code))!.state as TimelineState;
    expect(s.deckCount).toBe(0);
    expect(s.order[s.turnSeat]).toBe(other.playerId);

    // 換另一個人正確放：同一張邏輯反過來
    const oHand = (await (await getHand(get(`/api/kamisabi/room/${code}/hand`, other.token), ctx(code))).json()).hand as string[];
    const oOldest = [...oHand].sort((a, b) => byId.get(a)!.releaseDate!.localeCompare(byId.get(b)!.releaseDate!))[0];
    const rightSlot = byId.get(oOldest)!.releaseDate! <= initialDate ? 0 : 1;
    const right = await placeCard(post(`/api/kamisabi/room/${code}/place`, { songId: oOldest, slot: rightSlot }, other.token), ctx(code));
    const rb = await right.json();
    expect(rb.correct).toBe(true);
    expect(rb.hand).toHaveLength(4);
    expect(rb.finished).toBe(false);
    s = (await fake.getRoomByCode(code))!.state as TimelineState;
    expect(s.line).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/kamisabiRoomApi.test.ts`
Expected: FAIL

- [ ] **Step 3: 寫 `app/api/kamisabi/room/[code]/hand/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { handleError } from '@/lib/errors';
import { authenticateRoomRequest } from '@/lib/kamisabiRoom/auth';
import { routeParams } from '@/lib/kamisabiRoom/http';

/** GET /api/kamisabi/room/[code]/hand（帶 token）：只回自己的手牌 songId */
export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const { secret } = await authenticateRoomRequest(request, code);
    return NextResponse.json({ hand: secret.hand ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 4: 寫 `app/api/kamisabi/room/[code]/place/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { applyPlace } from '@/lib/kamisabiRoom/logic';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import { readJson, routeParams } from '@/lib/kamisabiRoom/http';
import { isTimelineState } from '@/lib/kamisabiRoom/types';
import * as store from '@/lib/kamisabiRoom/store';

/**
 * POST /api/kamisabi/room/[code]/place  { songId, slot }
 * 時間軸：伺服器驗證日期順序；對就插入、錯就留手牌並罰抽。手牌只回給本人。
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const body = await readJson<{ songId?: unknown; slot?: unknown }>(request);
    const songId = typeof body.songId === 'string' ? body.songId : '';
    const slot = typeof body.slot === 'number' ? body.slot : NaN;
    if (!songId || !Number.isInteger(slot)) throw new AppError('缺少 songId 或 slot。', 400, 'BAD_REQUEST');

    const result = await runRoomMutation(request, code, {}, async ({ room, player }) => {
      if (room.status !== 'playing' || !isTimelineState(room.state)) {
        throw new AppError('目前不是時間軸模式的進行中房間。', 409, 'NOT_PLAYING');
      }
      const secrets = await store.listSecrets(room.id);
      const hands = Object.fromEntries(secrets.map((s) => [s.player_id, s.hand ?? []]));
      const placed = applyPlace(room.state, room.songs, hands, player.id, songId, slot);
      const finished = placed.state.winnerId !== null;
      return {
        patch: finished ? { state: placed.state, status: 'finished' as const } : { state: placed.state },
        hands: placed.hands,
        result: { correct: placed.correct, releaseDate: placed.releaseDate, hand: placed.hands[player.id], state: placed.state, finished },
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run tests/kamisabiRoomApi.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "app/api/kamisabi/room/[code]/place" "app/api/kamisabi/room/[code]/hand" tests/kamisabiRoomApi.test.ts
git commit -m "feat(kamisabi): 房間 API：時間軸放牌、罰抽、手牌查詢

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 維運：ping / 清房 Cron

**Files:**
- Create: `app/api/kamisabi/ping/route.ts`
- Create: `vercel.json`
- Test: `tests/kamisabiRoomApi.test.ts`（追加）

**Interfaces:**
- `GET /api/kamisabi/ping` → `{ ok: true, deleted: number }`；設定 `CRON_SECRET` 時要求 `Authorization: Bearer <CRON_SECRET>`，否則 401。

- [ ] **Step 1: 追加失敗測試**

```ts
import { GET as ping } from '@/app/api/kamisabi/ping/route';

describe('GET /api/kamisabi/ping', () => {
  test('沒設 CRON_SECRET 時任何人可打；刪掉 24 小時前的房', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const host = await openRoom();
    const room = fake._rooms().find((r) => r.code === host.code)!;
    room.updated_at = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const res = await ping(get('/api/kamisabi/ping'));
    expect(await res.json()).toEqual({ ok: true, deleted: 1 });
    expect(await fake.getRoomByCode(host.code)).toBeNull();
    vi.unstubAllEnvs();
  });
  test('設了 CRON_SECRET 就要對 → 否則 401', async () => {
    vi.stubEnv('CRON_SECRET', 'sekrit');
    expect((await ping(get('/api/kamisabi/ping'))).status).toBe(401);
    expect((await ping(get('/api/kamisabi/ping', 'sekrit'))).status).toBe(200);
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: 寫 `app/api/kamisabi/ping/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { readBearer } from '@/lib/kamisabiRoom/auth';
import * as store from '@/lib/kamisabiRoom/store';

const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/kamisabi/ping（Vercel Cron，見 vercel.json）
 * 1. 對 Supabase 做一次 select，免費方案閒置 7 天才不會被暫停
 * 2. 刪掉 24 小時沒動的房間
 */
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && readBearer(request) !== secret) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    await store.pingDatabase();
    const deleted = await store.deleteStaleRooms(new Date(Date.now() - STALE_MS));
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 3: 寫 `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/kamisabi/ping", "schedule": "0 3 */3 * *" }
  ]
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/kamisabiRoomApi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/kamisabi/ping/route.ts vercel.json tests/kamisabiRoomApi.test.ts
git commit -m "feat(kamisabi): ping / 清房 Cron（喚醒 Supabase、刪 24 小時前的房）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `KamisabiCard` 新狀態（可點、被取走、點錯、得卡、★2pt、發行日）+ CSS

**Files:**
- Modify: `components/kamisabi/KamisabiCard.tsx`
- Modify: `app/globals.css`（`.kamisabi-card-controls svg.is-play` 之後追加）
- Test: `tests/KamisabiCard.test.tsx`

**Interfaces:**
- Produces：`KamisabiCard` 新 props（全部可省略，單機出題機不用改）：
  `points?: 1 | 2`、`takenBy?: string | null`、`status?: 'correct' | 'wrong' | null`、`releaseDate?: string | null`、`selected?: boolean`、`onClick?: () => void`、`disabled?: boolean`。有 `onClick` 時根元素是 `<button type="button">`，否則維持 `<div>`。
- CSS class：`.kamisabi-card.is-taken / .is-correct / .is-wrong / .is-selected`、`.kamisabi-card-points`、`.kamisabi-card-taken-tag`、`.kamisabi-card-date`、`.kamisabi-card-grid`、`.kamisabi-room-panel`、`.kamisabi-timeline`、`.kamisabi-slot`、`.kamisabi-hand`、`.kamisabi-banner.is-ok/.is-bad/.is-info`。

- [ ] **Step 1: 寫失敗測試 `tests/KamisabiCard.test.tsx`**

```tsx
import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import KamisabiCard from '../components/kamisabi/KamisabiCard';

test('預設是 div、顯示曲名與品牌日文全名', () => {
  const { container } = render(<KamisabiCard title="READY!!" brand="music_ml" artworkUrl={null} />);
  expect(container.querySelector('div.kamisabi-card')).not.toBeNull();
  expect(screen.getByText('READY!!')).toBeDefined();
  expect(screen.getByText('アイドルマスター ミリオンライブ！')).toBeDefined();
});

test('有 onClick 時是 button，disabled 時不觸發', () => {
  const onClick = vi.fn();
  const { rerender } = render(<KamisabiCard title="A" brand="music_ml" artworkUrl={null} onClick={onClick} />);
  fireEvent.click(screen.getByRole('button', { name: /A/ }));
  expect(onClick).toHaveBeenCalledTimes(1);
  rerender(<KamisabiCard title="A" brand="music_ml" artworkUrl={null} onClick={onClick} disabled />);
  fireEvent.click(screen.getByRole('button', { name: /A/ }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('被取走 → is-taken + 名牌；★2pt；發行日；狀態 class', () => {
  const { container } = render(
    <KamisabiCard title="A" brand="music_ml" artworkUrl={null} takenBy="未来" points={2} releaseDate="2013-04-24" status="correct" selected />,
  );
  const card = container.querySelector('.kamisabi-card')!;
  expect(card.className).toContain('is-taken');
  expect(card.className).toContain('is-correct');
  expect(card.className).toContain('is-selected');
  expect(screen.getByText('未来')).toBeDefined();
  expect(screen.getByText('★2pt')).toBeDefined();
  expect(screen.getByText('2013-04-24')).toBeDefined();
});

test('status=wrong → is-wrong', () => {
  const { container } = render(<KamisabiCard title="A" brand="music_ml" artworkUrl={null} status="wrong" />);
  expect(container.querySelector('.kamisabi-card')!.className).toContain('is-wrong');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/KamisabiCard.test.tsx`
Expected: FAIL（沒有 button / 名牌）

- [ ] **Step 3: 改寫 `components/kamisabi/KamisabiCard.tsx`**

```tsx
import React from 'react';
import { getKamisabiBrandName } from '@/lib/kamisabi';

interface KamisabiCardProps {
  title: string;
  brand: string;
  /** Apple 封面（600×600）；沒有時顯示色塊 */
  artworkUrl: string | null;
  className?: string;
  /** シングル 2 分 → 右上角 ★2pt */
  points?: 1 | 2;
  /** 被誰取走 → 灰化並蓋上名牌 */
  takenBy?: string | null;
  /** 得卡綠框 / 點錯紅框抖動 */
  status?: 'correct' | 'wrong' | null;
  /** 時間軸翻開後顯示發行日 */
  releaseDate?: string | null;
  selected?: boolean;
  /** 有給就變成可點的 <button> */
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * 仿實體 KAMISABI 歌牌：淡彩全像底、專輯封面、曲名、品牌名、分隔線、播放圖示（純裝飾）。
 * 樣式在 globals.css 的 .kamisabi-card。單機出題機與線上房間共用。
 */
export default function KamisabiCard({
  title, brand, artworkUrl, className = '', points = 1, takenBy = null, status = null, releaseDate = null, selected = false, onClick, disabled = false,
}: KamisabiCardProps) {
  const classes = [
    'kamisabi-card',
    className,
    takenBy ? 'is-taken' : '',
    status === 'correct' ? 'is-correct' : '',
    status === 'wrong' ? 'is-wrong' : '',
    selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  const body = (
    <>
      <div className="kamisabi-card-cover">
        {artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artworkUrl} alt="" width={600} height={600} loading="lazy" />
        ) : (
          <span aria-hidden="true">♪</span>
        )}
      </div>
      <div className="kamisabi-card-title">{title}</div>
      <div className="kamisabi-card-brand">{getKamisabiBrandName(brand)}</div>
      <div className="kamisabi-card-rule" />
      <div className="kamisabi-card-controls" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M11 6v12L2 12zM22 6v12l-9-6z" /></svg>
        <svg viewBox="0 0 24 24" className="is-play"><path d="M6 4v16l14-8z" /></svg>
        <svg viewBox="0 0 24 24"><path d="M13 6v12l9-6zM2 6v12l9-6z" /></svg>
      </div>
      {points === 2 && <span className="kamisabi-card-points">★2pt</span>}
      {takenBy && <span className="kamisabi-card-taken-tag">{takenBy}</span>}
      {releaseDate && <span className="kamisabi-card-date">{releaseDate}</span>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} disabled={disabled} aria-pressed={selected || undefined}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}
```

- [ ] **Step 4: 在 `app/globals.css` 的 `.kamisabi-card-controls svg.is-play { … }` 之後追加**

```css
/* ---- 線上房間：卡片狀態 ---- */
button.kamisabi-card {
  font: inherit;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
button.kamisabi-card:disabled { cursor: default; }
button.kamisabi-card:not(:disabled):hover { transform: translateY(-3px); }
button.kamisabi-card:focus-visible { outline: 3px solid #6366f1; outline-offset: 2px; }
.kamisabi-card.is-taken > *:not(.kamisabi-card-taken-tag):not(.kamisabi-card-points) {
  filter: grayscale(1);
  opacity: 0.45;
}
.kamisabi-card-taken-tag {
  position: absolute;
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%) rotate(-8deg);
  background: #1b1b1f;
  color: #fff;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 8cqw;
  font-weight: 900;
  white-space: nowrap;
  max-width: 95%;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}
.kamisabi-card.is-correct { box-shadow: 0 0 0 3px #22c55e, 0 8px 18px rgba(34, 197, 94, 0.35); }
.kamisabi-card.is-wrong { box-shadow: 0 0 0 3px #ef4444; animation: kamisabi-shake 0.5s; }
@keyframes kamisabi-shake {
  0%, 100% { transform: none; }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
.kamisabi-card.is-selected { transform: translateY(-8px); box-shadow: 0 0 0 3px #6366f1, 0 10px 20px rgba(99, 102, 241, 0.3); }
@media (prefers-reduced-motion: reduce) {
  .kamisabi-card.is-wrong { animation: none; }
  button.kamisabi-card { transition: none; }
}
.kamisabi-card-points {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #f59e0b;
  color: #1b1b1f;
  font-weight: 900;
  font-size: 7cqw;
  padding: 2px 7px;
  border-radius: 999px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.kamisabi-card-date {
  position: absolute;
  left: 50%;
  bottom: -14px;
  transform: translateX(-50%);
  background: #1b1b1f;
  color: #fff;
  font-size: 7cqw;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.kamisabi-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 12px;
}
.kamisabi-card-grid .kamisabi-card { max-width: none; width: 100%; }
.kamisabi-room-panel {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
.kamisabi-timeline {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding: 12px 8px 30px;
}
.kamisabi-timeline .kamisabi-card { width: 112px; max-width: none; flex-shrink: 0; }
.kamisabi-slot {
  flex-shrink: 0;
  width: 40px;
  height: 130px;
  border-radius: 10px;
  border: 2px dashed #a5b4fc;
  background: rgba(99, 102, 241, 0.08);
  color: #4f46e5;
  font-weight: 900;
  font-size: 18px;
  cursor: pointer;
}
.kamisabi-slot:disabled { opacity: 0.3; cursor: default; }
.kamisabi-hand { display: flex; gap: 12px; overflow-x: auto; padding: 14px 4px 8px; }
.kamisabi-hand .kamisabi-card { width: 124px; max-width: none; flex-shrink: 0; }
.kamisabi-banner { padding: 10px 14px; border-radius: 12px; font-weight: 700; line-height: 1.5; }
.kamisabi-banner.is-ok { background: #dcfce7; color: #166534; }
.kamisabi-banner.is-bad { background: #fee2e2; color: #991b1b; }
.kamisabi-banner.is-info { background: #e0e7ff; color: #3730a3; }
```

- [ ] **Step 5: 跑測試確認通過（含既有 KamisabiClient 測試沒壞）**

Run: `npx vitest run tests/KamisabiCard.test.tsx tests/KamisabiClient.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/kamisabi/KamisabiCard.tsx app/globals.css tests/KamisabiCard.test.tsx
git commit -m "feat(kamisabi): 歌牌元件支援可點擊、被取走、點錯、得卡、★2pt、發行日狀態

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: 前端基礎：session 儲存、API 包裝、`useRoom`（Realtime + 輪詢）、`useSyncedAudio`

**Files:**
- Create: `components/kamisabi/room/roomStorage.ts`
- Create: `components/kamisabi/room/roomApi.ts`
- Create: `components/kamisabi/room/useRoom.ts`
- Create: `components/kamisabi/room/useSyncedAudio.ts`
- Test: `tests/kamisabiRoomClient.unit.test.tsx`

**Interfaces:**
- `roomStorage.ts`：`RoomSession = { playerId: string; token: string; name: string }`；`loadSession(code): RoomSession | null`、`saveSession(code, s)`、`clearSession(code)`（key `kamisabi:room:<CODE>`，全部 try/catch）。
- `roomApi.ts`：`class RoomApiError extends Error { status: number; code: string }`；`roomApi.create / get / join / start / next / claim / discard / place / hand / lyrics / end / preview`，簽名見程式碼；回傳型別 `RoomSnapshot = { room: PublicRoom; players: PlayerRow[]; serverNow: number }`。
- `useRoom(code)` → `{ room, players, loading, error, refresh, realtime, toLocalTime(iso): number }`。
- `useSyncedAudio()` → `{ audioRef, unlocked, unlock, playing, scheduleAudio(url, atMs), scheduleSpeech(text, atMs): boolean, stop, onEnded }`。

- [ ] **Step 1: 寫失敗測試 `tests/kamisabiRoomClient.unit.test.tsx`**

```tsx
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/supabase/browser', () => ({ getSupabaseBrowser: () => null }));

import { clearSession, loadSession, saveSession } from '@/components/kamisabi/room/roomStorage';
import { RoomApiError, roomApi } from '@/components/kamisabi/room/roomApi';
import { useRoom } from '@/components/kamisabi/room/useRoom';
import { useSyncedAudio } from '@/components/kamisabi/room/useSyncedAudio';

describe('roomStorage', () => {
  beforeEach(() => localStorage.clear());
  test('save / load / clear，房號不分大小寫', () => {
    saveSession('abcde', { playerId: 'p', token: 't', name: 'n' });
    expect(loadSession('ABCDE')).toEqual({ playerId: 'p', token: 't', name: 'n' });
    clearSession('ABCDE');
    expect(loadSession('abcde')).toBeNull();
  });
  test('壞資料回 null', () => {
    localStorage.setItem('kamisabi:room:XXXXX', '{nope');
    expect(loadSession('XXXXX')).toBeNull();
  });
});

describe('roomApi', () => {
  afterEach(() => vi.restoreAllMocks());
  test('帶 Bearer、JSON body；錯誤變 RoomApiError 帶 code', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: '慢了一步', code: 'ROUND_RESOLVED' }), { status: 409, headers: { 'content-type': 'application/json' } }),
    );
    await expect(roomApi.claim('ABCDE', 'tok', 's1')).rejects.toMatchObject({ status: 409, code: 'ROUND_RESOLVED', message: '慢了一步' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/kamisabi/room/ABCDE/claim');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok', 'content-type': 'application/json' });
    expect((init as RequestInit).body).toBe(JSON.stringify({ songId: 's1' }));
  });
  test('RoomApiError 是 Error', () => {
    expect(new RoomApiError('x', 400, 'X')).toBeInstanceOf(Error);
  });
});

describe('useRoom（沒有 Supabase 時用輪詢）', () => {
  afterEach(() => vi.restoreAllMocks());
  test('初次載入 GET、算 serverNow 偏移、404 → error', async () => {
    const snapshot = { room: { id: 'r1', code: 'ABCDE', mode: null, status: 'lobby', brand: 'music_ml', songs: [], state: {}, version: 0 }, players: [], serverNow: Date.now() + 10_000 };
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(snapshot), { status: 200 }));
    const { result } = renderHook(() => useRoom('ABCDE'));
    await waitFor(() => expect(result.current.room?.code).toBe('ABCDE'));
    expect(result.current.realtime).toBe(false);
    // 伺服器比本機快 10 秒 → 伺服器時間換成本機時間要減 10 秒
    const iso = new Date(Date.now() + 13_000).toISOString();
    expect(result.current.toLocalTime(iso)).toBeLessThan(Date.now() + 4_000);

    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: '找不到這個房間。', code: 'ROOM_NOT_FOUND' }), { status: 404 }));
    const { result: r2 } = renderHook(() => useRoom('ZZZZZ'));
    await waitFor(() => expect(r2.current.error).toBe('找不到這個房間。'));
  });
});

describe('useSyncedAudio', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  test('unlock 後 unlocked=true；scheduleAudio 到時間才 play；stop 取消', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSyncedAudio());
    const el = document.createElement('audio');
    result.current.audioRef.current = el;
    await act(async () => { result.current.unlock(); await Promise.resolve(); });
    expect(result.current.unlocked).toBe(true);

    act(() => result.current.scheduleAudio('https://x/a.m4a', Date.now() + 2000));
    expect(el.src).toBe('https://x/a.m4a');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1); // 只有 unlock 那次
    act(() => { vi.advanceTimersByTime(2100); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);

    act(() => result.current.scheduleAudio('https://x/b.m4a', Date.now() + 2000));
    act(() => result.current.stop());
    act(() => { vi.advanceTimersByTime(3000); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  test('沒有 speechSynthesis 時 scheduleSpeech 回 false 不丟例外', () => {
    const { result } = renderHook(() => useSyncedAudio());
    expect(result.current.scheduleSpeech('テスト', Date.now())).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/kamisabiRoomClient.unit.test.tsx`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 寫 `components/kamisabi/room/roomStorage.ts`**

```ts
/** 玩家在某個房間的身分：加入時由 API 發 token，存在 localStorage，之後每個動作都帶 */
export interface RoomSession {
  playerId: string;
  token: string;
  name: string;
}

const key = (code: string) => `kamisabi:room:${code.trim().toUpperCase()}`;

export function loadSession(code: string): RoomSession | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoomSession>;
    if (typeof parsed.playerId !== 'string' || typeof parsed.token !== 'string') return null;
    return { playerId: parsed.playerId, token: parsed.token, name: typeof parsed.name === 'string' ? parsed.name : '' };
  } catch {
    return null;
  }
}

export function saveSession(code: string, session: RoomSession): void {
  try {
    localStorage.setItem(key(code), JSON.stringify(session));
  } catch {
    /* 隱私模式等情況：忽略，這一頁還是能玩 */
  }
}

export function clearSession(code: string): void {
  try {
    localStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: 寫 `components/kamisabi/room/roomApi.ts`**

```ts
import type { ApplePreview } from '@/lib/apple';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';
import type { IntroState, PlayerRow, RoomMode, RoomSong, TimelineState } from '@/lib/kamisabiRoom/types';

export class RoomApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'RoomApiError';
    this.status = status;
    this.code = code;
  }
}

export interface RoomSnapshot {
  room: PublicRoom;
  players: PlayerRow[];
  serverNow: number;
}

async function call<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown; token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  let data: { error?: string; code?: string } & Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* 沒 body */
  }
  if (!res.ok) throw new RoomApiError(data.error ?? `HTTP ${res.status}`, res.status, data.code ?? 'HTTP_ERROR');
  return data as T;
}

const base = (code: string) => `/api/kamisabi/room/${encodeURIComponent(code.toUpperCase())}`;

/** 前端唯一會碰房間 API 的地方；瀏覽器絕不直接寫 Supabase */
export const roomApi = {
  create: (body: { name: string; brand: string; singles: string[] }) =>
    call<{ code: string; roomId: string; playerId: string; token: string }>('/api/kamisabi/room', { body }),
  get: (code: string) => call<RoomSnapshot>(base(code)),
  join: (code: string, name: string) => call<{ playerId: string; token: string; seat: number }>(`${base(code)}/join`, { body: { name } }),
  start: (code: string, token: string, mode: RoomMode) => call<{ state: IntroState | TimelineState }>(`${base(code)}/start`, { body: { mode }, token }),
  next: (code: string, token: string) => call<{ state: IntroState; finished: boolean }>(`${base(code)}/next`, { body: {}, token }),
  claim: (code: string, token: string, songId: string) =>
    call<{ result: 'correct' | 'otetsuki' | 'otetsuki_no_cards'; cards: RoomSong[]; finished: boolean }>(`${base(code)}/claim`, { body: { songId }, token }),
  discard: (code: string, token: string, songId: string) => call<{ state: IntroState }>(`${base(code)}/discard`, { body: { songId }, token }),
  place: (code: string, token: string, songId: string, slot: number) =>
    call<{ correct: boolean; releaseDate: string; hand: string[]; state: TimelineState; finished: boolean }>(`${base(code)}/place`, { body: { songId, slot }, token }),
  hand: (code: string, token: string) => call<{ hand: string[] }>(`${base(code)}/hand`, { token }),
  lyrics: (code: string, token: string, songId: string) => call<{ text: string }>(`${base(code)}/lyrics?songId=${encodeURIComponent(songId)}`, { token }),
  end: (code: string, token: string) => call<{ status: 'finished' }>(`${base(code)}/end`, { body: {}, token }),
  preview: (trackId: string) => call<ApplePreview>(`/api/apple/preview?trackId=${encodeURIComponent(trackId)}`),
};
```

- [ ] **Step 5: 寫 `components/kamisabi/room/useRoom.ts`**

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';
import type { PlayerRow, RoomRow } from '@/lib/kamisabiRoom/types';
import { RoomApiError, roomApi } from './roomApi';

const POLL_MS = 4000;

/**
 * 房間公開狀態：初次 GET → Supabase Realtime 訂閱 rooms UPDATE / room_players INSERT；
 * 沒有 Supabase 環境變數或訂閱失敗時退回每 4 秒輪詢。
 * 另外算出「伺服器時間 − 本機時間」的偏移，讓 startsAt 能在各裝置同時觸發。
 */
export function useRoom(code: string) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState(false);
  const skewRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const snap = await roomApi.get(code);
      skewRef.current = snap.serverNow - Date.now();
      setRoom((prev) => (prev && prev.version > snap.room.version ? prev : snap.room));
      setPlayers(snap.players);
      setError(null);
    } catch (e) {
      setError(e instanceof RoomApiError ? e.message : '無法連線到房間，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime：rooms 一列更新就整包換掉（payload.new 是完整列）
  const roomId = room?.id;
  useEffect(() => {
    if (!roomId) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const channel = sb
      .channel(`kamisabi-room:${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        const next = payload.new as RoomRow;
        setRoom((prev) => (prev && prev.version >= next.version ? prev : {
          id: next.id, code: next.code, mode: next.mode, status: next.status, brand: next.brand, songs: next.songs, state: next.state, version: next.version,
        }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => {
        refresh();
      })
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED';
        setRealtime(ok);
        if (ok) refresh(); // 補上訂閱前漏掉的更新
      });
    return () => {
      sb.removeChannel(channel);
      setRealtime(false);
    };
  }, [roomId, refresh]);

  // 輪詢備援
  useEffect(() => {
    if (realtime || error) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [realtime, error, refresh]);

  // 回到分頁時補抓一次
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const toLocalTime = useCallback((iso: string) => Date.parse(iso) - skewRef.current, []);

  return { room, players, loading, error, refresh, realtime, toLocalTime };
}
```

- [ ] **Step 6: 寫 `components/kamisabi/room/useSyncedAudio.ts`**

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** 44 byte 的空 WAV：在使用者手勢裡播一次，之後同一個 <audio> 就能程式化播放（iOS / Chrome 自動播放限制） */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/**
 * 房間同步播放：伺服器只發 startsAt，每個瀏覽器自己排 timer，到點同時 play。
 * 一個 <audio> 元素重複使用（iOS 解鎖後換 src 仍可播）。かるた沒有 mp3 時退回 speechSynthesis。
 */
export function useSyncedAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [playing, setPlaying] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const unlock = useCallback(() => {
    const el = audioRef.current;
    if (!el) {
      setUnlocked(true);
      return;
    }
    el.src = SILENT_WAV;
    el.play()
      .then(() => el.pause())
      .catch(() => {})
      .finally(() => setUnlocked(true));
  }, []);

  const scheduleAudio = useCallback((url: string, atMs: number) => {
    const el = audioRef.current;
    if (!el) return;
    clearTimer();
    el.src = url;
    el.load();
    const delay = Math.max(0, atMs - Date.now());
    timerRef.current = setTimeout(() => {
      try {
        el.currentTime = 0;
      } catch {
        /* metadata 未載入 */
      }
      el.play()
        .then(() => setPlaying(true))
        .catch((err) => console.error('room audio play failed', err));
    }, delay);
  }, [clearTimer]);

  /** 回 false = 這個環境沒有語音合成，呼叫端顯示提示 */
  const scheduleSpeech = useCallback((text: string, atMs: number): boolean => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return false;
    clearTimer();
    const delay = Math.max(0, atMs - Date.now());
    timerRef.current = setTimeout(() => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 0.95;
      u.onend = () => setPlaying(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      setPlaying(true);
    }, delay);
    return true;
  }, [clearTimer]);

  const stop = useCallback(() => {
    clearTimer();
    audioRef.current?.pause();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(false);
  }, [clearTimer]);

  useEffect(() => () => stop(), [stop]);

  const onEnded = useCallback(() => setPlaying(false), []);

  return { audioRef, unlocked, unlock, playing, scheduleAudio, scheduleSpeech, stop, onEnded };
}
```

- [ ] **Step 7: 跑測試確認通過**

Run: `npx vitest run tests/kamisabiRoomClient.unit.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add components/kamisabi/room/roomStorage.ts components/kamisabi/room/roomApi.ts components/kamisabi/room/useRoom.ts components/kamisabi/room/useSyncedAudio.ts tests/kamisabiRoomClient.unit.test.tsx
git commit -m "feat(kamisabi): 房間前端基礎：session、API 包裝、Realtime/輪詢 useRoom、同步播放 hook

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: かるた朗讀：SSML 純函式、歌詞對照表、Google TTS 產檔腳本、歌詞備援 API

**Files:**
- Create: `lib/karutaTts.ts`
- Create: `scripts/karuta-lyrics.ts`
- Create: `scripts/gen-karuta-tts.ts`
- Create: `app/api/kamisabi/room/[code]/lyrics/route.ts`
- Create: `public/kamisabi/tts/.gitkeep`
- Modify: `package.json`（scripts 加 `gen:karuta-tts`）
- Test: `tests/karutaTts.unit.test.ts`、`tests/kamisabiRoomApi.test.ts`（追加）

**Interfaces:**
- `lib/karutaTts.ts`：`buildKarutaSsml(lyrics: string): string`、`ttsFileUrl(songId: string): string`（`/kamisabi/tts/<songId>.mp3`）、`KARUTA_TTS_VOICE = 'ja-JP-Neural2-B'`、`KARUTA_TTS_RATE = 0.95`。
- `scripts/karuta-lyrics.ts`：`export const KARUTA_LYRICS: Record<string, string>`（key 曲名、value 副歌歌詞，`\n` 分行）。
- `GET /api/kamisabi/room/[code]/lyrics?songId=`（帶 token）→ `{ text }`；非かるた或不是當前題 → 403；沒歌詞 → 404 `NO_LYRICS`。

- [ ] **Step 1: 寫失敗測試 `tests/karutaTts.unit.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import { buildKarutaSsml, ttsFileUrl } from '@/lib/karutaTts';

describe('buildKarutaSsml', () => {
  test('每行之間加 600ms 停頓、跳脫 XML、去掉空行', () => {
    expect(buildKarutaSsml('君と <未来>\n\n歩こう & 歌おう\n')).toBe(
      '<speak>君と &lt;未来&gt;<break time="600ms"/>歩こう &amp; 歌おう</speak>',
    );
  });
  test('也接受「／」當分行', () => {
    expect(buildKarutaSsml('ラララ／ルルル')).toBe('<speak>ラララ<break time="600ms"/>ルルル</speak>');
  });
});

test('ttsFileUrl', () => {
  expect(ttsFileUrl('abc-123')).toBe('/kamisabi/tts/abc-123.mp3');
});
```

- [ ] **Step 2: 在 `tests/kamisabiRoomApi.test.ts` 追加 lyrics route 測試**

```ts
vi.mock('@/scripts/karuta-lyrics', () => ({ KARUTA_LYRICS: { 'Song a': 'ラララ\nルルル' } }));
import { GET as getLyrics } from '@/app/api/kamisabi/room/[code]/lyrics/route';

describe('GET /api/kamisabi/room/[code]/lyrics', () => {
  test('只在かるた模式、只給當前題；沒歌詞 404', async () => {
    const host = await openRoom();
    const guest = await joinAs(host.code, 'guest');
    const code = host.code;
    const url = (songId: string) => `/api/kamisabi/room/${code}/lyrics?songId=${songId}`;
    await startRoom(post(`/api/kamisabi/room/${code}/start`, { mode: 'intro' }, host.token), ctx(code));
    await nextCard(post(`/api/kamisabi/room/${code}/next`, {}, host.token), ctx(code));
    expect((await getLyrics(get(url('a'), guest.token), ctx(code))).status).toBe(403);

    // 換成かるた
    const room = await fake.getRoomByCode(code);
    await fake.updateRoom(room!.id, room!.version, { mode: 'karuta' });
    const s = (await fake.getRoomByCode(code))!.state as IntroState;
    const other = SONGS.find((x) => x.id !== s.currentSongId)!.id;
    expect((await getLyrics(get(url(other), guest.token), ctx(code))).status).toBe(403);
    const res = await getLyrics(get(url(s.currentSongId!), guest.token), ctx(code));
    if (s.currentSongId === 'a') {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ text: 'ラララ\nルルル' });
    } else {
      expect(res.status).toBe(404);
    }
    expect((await getLyrics(get(url(s.currentSongId!)), ctx(code))).status).toBe(401);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run tests/karutaTts.unit.test.ts tests/kamisabiRoomApi.test.ts`
Expected: FAIL

- [ ] **Step 4: 寫 `lib/karutaTts.ts`**

```ts
/**
 * かるたモード朗讀（Google Cloud TTS 離線產檔）相關的純函式。
 * 歌詞文字只存在 scripts/karuta-lyrics.ts，畫面上不顯示。
 */
export const KARUTA_TTS_VOICE = 'ja-JP-Neural2-B'; // 女聲；男聲用 ja-JP-Neural2-C
export const KARUTA_TTS_RATE = 0.95;
export const KARUTA_TTS_BREAK = '600ms';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 每行之間加停頓，讓朗讀有かるた「読み手」的節奏 */
export function buildKarutaSsml(lyrics: string): string {
  const lines = lyrics
    .split(/\r?\n|／/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(escapeXml);
  return `<speak>${lines.join(`<break time="${KARUTA_TTS_BREAK}"/>`)}</speak>`;
}

/** 朗讀檔放 public/kamisabi/tts/<songId>.mp3（songId 是 uuid，不列目錄就猜不到） */
export function ttsFileUrl(songId: string): string {
  return `/kamisabi/tts/${songId}.mp3`;
}
```

- [ ] **Step 5: 寫 `scripts/karuta-lyrics.ts`**

```ts
/**
 * かるたモード用：曲名 → 卡片上印的副歌片段（站長照實體「読み札」輸入）。
 * - key 用資料庫的 Song.title（與 scripts/seed-apple-ids.ts 同一份曲名）
 * - 分行用 \n 或「／」，產檔時每行之間會停 600ms
 * - 只放卡片上的片段，不放全曲歌詞；這個檔案不會被前端 bundle（只有 API route 與腳本 import）
 *
 * 範例：
 *   'READY!!': 'ラララ\nルルル',
 */
export const KARUTA_LYRICS: Record<string, string> = {};
```

- [ ] **Step 6: 寫 `scripts/gen-karuta-tts.ts`（`npm run gen:karuta-tts [--force]`）**

```ts
/**
 * 用 Google Cloud Text-to-Speech 把 scripts/karuta-lyrics.ts 的副歌片段產成 mp3，
 * 輸出 public/kamisabi/tts/<songId>.mp3（songId 由曲名查 Neon）。
 *
 * 認證二選一（只在本機跑，不放 Vercel）：
 *   GOOGLE_TTS_API_KEY=...                       → 用 API key
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json → 服務帳戶 JSON（自行簽 JWT 換 access token，不需要額外套件）
 * 可選：KARUTA_TTS_VOICE（預設 ja-JP-Neural2-B）
 * 已存在的檔案會跳過，加 --force 重新產生。
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createSign } from 'crypto';
import { prisma } from './lib/prisma';
import { KARUTA_LYRICS } from './karuta-lyrics';
import { buildKarutaSsml, KARUTA_TTS_RATE, KARUTA_TTS_VOICE } from '../lib/karutaTts';

const OUT_DIR = path.join(__dirname, '..', 'public', 'kamisabi', 'tts');
const force = process.argv.includes('--force');

async function serviceAccountToken(credsPath: string): Promise<string> {
  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8')) as { client_email: string; private_key: string; token_uri?: string };
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: creds.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(creds.private_key).toString('base64url');
  const res = await fetch(creds.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function main() {
  const entries = Object.entries(KARUTA_LYRICS);
  if (entries.length === 0) {
    console.log('scripts/karuta-lyrics.ts 是空的，先填副歌片段。');
    return;
  }
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!apiKey && !credsPath) throw new Error('請設定 GOOGLE_TTS_API_KEY 或 GOOGLE_APPLICATION_CREDENTIALS');
  const bearer = apiKey ? null : await serviceAccountToken(credsPath as string);
  const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize${apiKey ? `?key=${encodeURIComponent(apiKey)}` : ''}`;
  const voice = process.env.KARUTA_TTS_VOICE ?? KARUTA_TTS_VOICE;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let done = 0;
  for (const [title, lyrics] of entries) {
    const song = await prisma.song.findFirst({
      where: { title, appleTrackId: { not: null }, NOT: { appleTrackId: '' } },
      select: { id: true, title: true },
    });
    if (!song) {
      console.warn(`找不到有 Apple ID 的歌：${title}（先用 seed:apple-ids 補）`);
      continue;
    }
    const out = path.join(OUT_DIR, `${song.id}.mp3`);
    if (fs.existsSync(out) && !force) {
      console.log(`skip ${title}（已存在）`);
      continue;
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify({
        input: { ssml: buildKarutaSsml(lyrics) },
        voice: { languageCode: 'ja-JP', name: voice },
        audioConfig: { audioEncoding: 'MP3', speakingRate: KARUTA_TTS_RATE },
      }),
    });
    if (!res.ok) {
      console.error(`TTS 失敗 ${title}: ${res.status} ${await res.text()}`);
      continue;
    }
    const { audioContent } = (await res.json()) as { audioContent: string };
    fs.writeFileSync(out, Buffer.from(audioContent, 'base64'));
    console.log(`ok ${title} → ${path.relative(process.cwd(), out)}`);
    done++;
  }
  console.log(`完成 ${done} 首`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

先確認 `dotenv` 是否已在依賴裡：`grep -n dotenv package.json`；沒有的話把 `import 'dotenv/config';` 那行改成與 `scripts/seed-apple-ids.ts` 相同的環境載入方式（看該檔開頭怎麼做，照抄）。

在 `package.json` scripts 加：

```json
"gen:karuta-tts": "ts-node --project scripts/tsconfig.json scripts/gen-karuta-tts.ts",
```

- [ ] **Step 7: 寫 `app/api/kamisabi/room/[code]/lyrics/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { AppError, handleError } from '@/lib/errors';
import { authenticateRoomRequest } from '@/lib/kamisabiRoom/auth';
import { routeParams } from '@/lib/kamisabiRoom/http';
import { isIntroState } from '@/lib/kamisabiRoom/types';
import { KARUTA_LYRICS } from '@/scripts/karuta-lyrics';

/**
 * GET /api/kamisabi/room/[code]/lyrics?songId=（帶 token）
 * かるた朗讀檔不存在時的備援：只回「當前題」的副歌片段給房內玩家做 speechSynthesis。
 * 不列出、不給非當前題，把歌詞曝光壓到最低。
 */
export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await routeParams(ctx);
    const songId = new URL(request.url).searchParams.get('songId') ?? '';
    const { room } = await authenticateRoomRequest(request, code);
    if (room.mode !== 'karuta' || !isIntroState(room.state) || !songId || room.state.currentSongId !== songId) {
      throw new AppError('只能取得かるたモード當前題的朗讀文字。', 403, 'NOT_CURRENT_SONG');
    }
    const song = room.songs.find((s) => s.id === songId);
    const text = song ? KARUTA_LYRICS[song.title] : undefined;
    if (!text) throw new AppError('這首歌還沒有朗讀文字。', 404, 'NO_LYRICS');
    return NextResponse.json({ text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 8: 建目錄 + 跑測試**

```bash
mkdir -p public/kamisabi/tts && touch public/kamisabi/tts/.gitkeep
```

Run: `npx vitest run tests/karutaTts.unit.test.ts tests/kamisabiRoomApi.test.ts`
Expected: PASS

- [ ] **Step 9: 確認腳本能編譯（不真的打 Google）**

Run: `npx tsc --noEmit -p scripts/tsconfig.json 2>&1 | grep -i karuta || echo "no karuta type errors"`
Expected: `no karuta type errors`

- [ ] **Step 10: Commit**

```bash
git add lib/karutaTts.ts scripts/karuta-lyrics.ts scripts/gen-karuta-tts.ts "app/api/kamisabi/room/[code]/lyrics" public/kamisabi/tts/.gitkeep package.json tests/karutaTts.unit.test.ts tests/kamisabiRoomApi.test.ts
git commit -m "feat(kamisabi): かるた朗讀：SSML、歌詞對照表、Google TTS 產檔腳本、Web Speech 備援 API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: `IntroGame`（イントロ / かるた 搶牌畫面：同步播放、點牌、お手つき、房主控制）

**Files:**
- Create: `components/kamisabi/room/IntroGame.tsx`
- Create: `tests/helpers/mockRoomFetch.ts`
- Test: `tests/KamisabiIntroGame.test.tsx`

**Interfaces:**
- Consumes: Task 10 `KamisabiCard`、Task 11 `roomApi` / `useSyncedAudio` / `RoomSession`、Task 12 `ttsFileUrl`。
- Produces：`IntroGame` props `{ code: string; room: PublicRoom; players: PlayerRow[]; me: PlayerRow | null; session: RoomSession | null; refresh: () => Promise<void>; toLocalTime: (iso: string) => number }`。`me === null` = 觀戰。
- `tests/helpers/mockRoomFetch.ts`：`mockRoomFetch(routes)` 回傳呼叫紀錄陣列 `{ method, url, body }[]`；`routes: { method?: 'GET'|'POST'|'HEAD'; match: RegExp; handle: (body, url) => { status?: number; json?: unknown } }[]`。

- [ ] **Step 1: 寫 `tests/helpers/mockRoomFetch.ts`**

```ts
import { vi } from 'vitest';

export interface FetchRoute {
  method?: 'GET' | 'POST' | 'HEAD';
  match: RegExp;
  handle: (body: unknown, url: string) => { status?: number; json?: unknown };
}

export interface FetchCall { method: string; url: string; body: unknown }

/** 用路由表模擬 fetch；沒對到的請求回 500，讓測試一眼看出漏了哪支 */
export function mockRoomFetch(routes: FetchRoute[]): FetchCall[] {
  const calls: FetchCall[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const route = routes.find((r) => (r.method ?? 'GET') === method && r.match.test(url));
    if (!route) {
      return new Response(JSON.stringify({ error: `no mock route: ${method} ${url}` }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
    const out = route.handle(body, url);
    return new Response(out.json === undefined ? null : JSON.stringify(out.json), { status: out.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return calls;
}
```

- [ ] **Step 2: 寫失敗測試 `tests/KamisabiIntroGame.test.tsx`**

```tsx
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { mockRoomFetch } from './helpers/mockRoomFetch';
import IntroGame from '../components/kamisabi/room/IntroGame';
import type { IntroState, PlayerRow, RoomSong } from '@/lib/kamisabiRoom/types';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';

const song = (id: string, points: 1 | 2 = 1): RoomSong => ({ id, title: `Song ${id}`, brand: 'music_ml', trackId: `t${id}`, artworkUrl: null, releaseDate: null, points });
const SONGS = [song('a'), song('b', 2), song('c')];
const host: PlayerRow = { id: 'p1', room_id: 'r1', name: '房主', seat: 0, is_host: true, joined_at: '' };
const guest: PlayerRow = { id: 'p2', room_id: 'r1', name: '未来', seat: 1, is_host: false, joined_at: '' };
const players = [host, guest];

function roomWith(state: Partial<IntroState>, mode: 'intro' | 'karuta' = 'intro'): PublicRoom {
  return {
    id: 'r1', code: 'ABCDE', mode, status: 'playing', brand: 'music_ml', songs: SONGS, version: 3,
    state: { kind: 'intro', round: 1, currentSongId: 'a', startsAt: new Date(Date.now() + 50).toISOString(), resolved: false, taken: {}, scores: {}, pendingDiscards: {}, lastResult: null, ...state },
  };
}
const session = { playerId: 'p2', token: 'tok', name: '未来' };
const toLocalTime = (iso: string) => Date.parse(iso);

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

describe('IntroGame', () => {
  test('顯示所有歌牌、載入試聽並排程播放、點對牌 → claim → 綠框與訊息', async () => {
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview\?trackId=ta/, handle: () => ({ json: { trackId: 'ta', previewUrl: 'https://cdn/a.m4a', artworkUrl: null, trackViewUrl: null, trackName: null, artistName: null, collectionName: null } }) },
      { method: 'POST', match: /\/claim$/, handle: () => ({ json: { result: 'correct', cards: [], finished: false } }) },
    ]);
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<IntroGame code="ABCDE" room={roomWith({})} players={players} me={guest} session={session} refresh={refresh} toLocalTime={toLocalTime} />);

    expect(screen.getByText('Song a')).toBeDefined();
    expect(screen.getByText('Song b')).toBeDefined();
    expect(screen.getByText('★2pt')).toBeDefined();
    await waitFor(() => expect((screen.getByTestId('room-audio') as HTMLAudioElement).src).toBe('https://cdn/a.m4a'));

    fireEvent.click(screen.getByText('🔊 準備完成'));
    await waitFor(() => expect(screen.queryByText('🔊 準備完成')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Song a/ }));
    await waitFor(() => expect(screen.getByText(/取得『Song a』/)).toBeDefined());
    const claim = calls.find((c) => c.method === 'POST' && /\/claim$/.test(c.url))!;
    expect(claim.body).toEqual({ songId: 'a' });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Song a/ }).className).toContain('is-correct');
  });

  test('點錯 → お手つき 對話框列出自己的牌 → 丟牌', async () => {
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: { trackId: 'tb', previewUrl: 'https://cdn/b.m4a', artworkUrl: null, trackViewUrl: null, trackName: null, artistName: null, collectionName: null } }) },
      { method: 'POST', match: /\/claim$/, handle: () => ({ json: { result: 'otetsuki', cards: [song('c')], finished: false } }) },
      { method: 'POST', match: /\/discard$/, handle: () => ({ json: { state: {} } }) },
    ]);
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<IntroGame code="ABCDE" room={roomWith({ currentSongId: 'b', taken: { c: 'p2' }, scores: { p2: 1 } })} players={players} me={guest} session={session} refresh={refresh} toLocalTime={toLocalTime} />);

    fireEvent.click(screen.getByRole('button', { name: /Song a/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Song c')).toBeDefined();
    expect(screen.getByRole('button', { name: /Song a/ }).className).toContain('is-wrong');
    fireEvent.click(within(dialog).getByRole('button', { name: /Song c/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.find((c) => /\/discard$/.test(c.url))!.body).toEqual({ songId: 'c' });
  });

  test('已被取走的牌灰化並顯示名牌、不能點；慢了一步顯示伺服器訊息', async () => {
    mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: { trackId: 'ta', previewUrl: 'https://cdn/a.m4a', artworkUrl: null, trackViewUrl: null, trackName: null, artistName: null, collectionName: null } }) },
      { method: 'POST', match: /\/claim$/, handle: () => ({ status: 409, json: { error: '慢了一步，這張已經被取走了。', code: 'ROUND_RESOLVED' } }) },
    ]);
    render(<IntroGame code="ABCDE" room={roomWith({ taken: { c: 'p1' }, scores: { p1: 1 } })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    const takenCard = screen.getByRole('button', { name: /Song c/ }) as HTMLButtonElement;
    expect(takenCard.disabled).toBe(true);
    expect(takenCard.className).toContain('is-taken');
    expect(within(takenCard).getByText('房主')).toBeDefined();
    expect(screen.getByText(/房主：1 分/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Song a/ }));
    await waitFor(() => expect(screen.getByText('慢了一步，這張已經被取走了。')).toBeDefined());
  });

  test('房主看得到「下一張」與「結束遊戲」；觀戰者不能點牌', async () => {
    const calls = mockRoomFetch([
      { match: /\/api\/apple\/preview/, handle: () => ({ json: { trackId: 'ta', previewUrl: 'https://cdn/a.m4a', artworkUrl: null, trackViewUrl: null, trackName: null, artistName: null, collectionName: null } }) },
      { method: 'POST', match: /\/next$/, handle: () => ({ json: { state: {}, finished: false } }) },
    ]);
    const { unmount } = render(<IntroGame code="ABCDE" room={roomWith({ currentSongId: null, startsAt: null })} players={players} me={host} session={{ playerId: 'p1', token: 'htok', name: '房主' }} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    fireEvent.click(screen.getByText('▶ 下一張'));
    await waitFor(() => expect(calls.some((c) => /\/next$/.test(c.url))).toBe(true));
    expect(screen.getByText('結束遊戲')).toBeDefined();
    unmount();

    render(<IntroGame code="ABCDE" room={roomWith({})} players={players} me={null} session={null} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    expect(screen.getByText(/觀戰模式/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Song a/ })).toBeNull();
    expect(screen.queryByText('▶ 下一張')).toBeNull();
  });

  test('かるた：沒有 mp3（HEAD 404）→ 抓歌詞 → jsdom 沒有 speechSynthesis → 顯示提示', async () => {
    const calls = mockRoomFetch([
      { method: 'HEAD', match: /\/kamisabi\/tts\/a\.mp3$/, handle: () => ({ status: 404 }) },
      { match: /\/lyrics\?songId=a$/, handle: () => ({ json: { text: 'ラララ' } }) },
    ]);
    render(<IntroGame code="ABCDE" room={roomWith({}, 'karuta')} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    await waitFor(() => expect(screen.getByText(/此裝置無法朗讀/)).toBeDefined());
    expect(calls.some((c) => c.method === 'HEAD')).toBe(true);
    expect(calls.some((c) => /\/api\/apple\/preview/.test(c.url))).toBe(false);
  });

  test('重新整理後若仍有待丟的牌，自動打開丟牌對話框', async () => {
    mockRoomFetch([{ match: /\/api\/apple\/preview/, handle: () => ({ json: { trackId: 'ta', previewUrl: 'https://cdn/a.m4a', artworkUrl: null, trackViewUrl: null, trackName: null, artistName: null, collectionName: null } }) }]);
    render(<IntroGame code="ABCDE" room={roomWith({ taken: { c: 'p2' }, pendingDiscards: { p2: 1 } })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} toLocalTime={toLocalTime} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Song c')).toBeDefined();
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run tests/KamisabiIntroGame.test.tsx`
Expected: FAIL（模組不存在）

- [ ] **Step 4: 寫 `components/kamisabi/room/IntroGame.tsx`**

```tsx
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
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run tests/KamisabiIntroGame.test.tsx`
Expected: PASS（6 tests）

- [ ] **Step 6: Commit**

```bash
git add components/kamisabi/room/IntroGame.tsx tests/helpers/mockRoomFetch.ts tests/KamisabiIntroGame.test.tsx
git commit -m "feat(kamisabi): イントロ / かるた 搶牌畫面：同步播放、點牌、お手つき、房主控制

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: `TimelineGame`（リリースタイムライン 畫面：手牌、時間軸、放牌）

**Files:**
- Create: `components/kamisabi/room/TimelineGame.tsx`
- Test: `tests/KamisabiTimelineGame.test.tsx`

**Interfaces:**
- Produces：`TimelineGame` props `{ code: string; room: PublicRoom; players: PlayerRow[]; me: PlayerRow | null; session: RoomSession | null; refresh: () => Promise<void> }`。

- [ ] **Step 1: 寫失敗測試 `tests/KamisabiTimelineGame.test.tsx`**

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { mockRoomFetch } from './helpers/mockRoomFetch';
import TimelineGame from '../components/kamisabi/room/TimelineGame';
import type { PlayerRow, RoomSong, TimelineState } from '@/lib/kamisabiRoom/types';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';

const song = (id: string, date: string): RoomSong => ({ id, title: `Song ${id}`, brand: 'music_ml', trackId: `t${id}`, artworkUrl: null, releaseDate: date, points: 1 });
const SONGS = [song('d02', '2012-01-01'), song('d04', '2014-01-01'), song('d11', '2021-01-01'), song('d12', '2022-01-01')];
const host: PlayerRow = { id: 'p1', room_id: 'r1', name: '房主', seat: 0, is_host: true, joined_at: '' };
const guest: PlayerRow = { id: 'p2', room_id: 'r1', name: '未来', seat: 1, is_host: false, joined_at: '' };
const players = [host, guest];
const session = { playerId: 'p2', token: 'tok', name: '未来' };

function roomWith(state: Partial<TimelineState>): PublicRoom {
  return {
    id: 'r1', code: 'ABCDE', mode: 'timeline', status: 'playing', brand: 'music_ml', songs: SONGS, version: 5,
    state: { kind: 'timeline', order: ['p1', 'p2'], turnSeat: 1, deckCount: 1, line: ['d11'], handCounts: { p1: 5, p2: 2 }, winnerId: null, lastResult: null, ...state },
  };
}

describe('TimelineGame', () => {
  test('抓手牌、顯示時間軸（含日期）、選牌後點位置 → place → 顯示結果並更新手牌', async () => {
    const calls = mockRoomFetch([
      { match: /\/hand$/, handle: () => ({ json: { hand: ['d02', 'd04'] } }) },
      { method: 'POST', match: /\/place$/, handle: () => ({ json: { correct: true, releaseDate: '2012-01-01', hand: ['d04'], state: {}, finished: false } }) },
    ]);
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<TimelineGame code="ABCDE" room={roomWith({})} players={players} me={guest} session={session} refresh={refresh} />);

    expect(screen.getByText('Song d11')).toBeDefined();
    expect(screen.getByText('2021-01-01')).toBeDefined();
    expect(screen.getByText(/輪到你了/)).toBeDefined();
    await waitFor(() => expect(screen.getByRole('button', { name: /Song d02/ })).toBeDefined());
    expect(screen.getByText(/山札 1 張/)).toBeDefined();

    // 還沒選牌 → 位置按鈕停用
    const slot0 = screen.getByRole('button', { name: '放在第 1 個位置' }) as HTMLButtonElement;
    expect(slot0.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Song d02/ }));
    expect(slot0.disabled).toBe(false);
    fireEvent.click(slot0);

    await waitFor(() => expect(screen.getByText(/正確！/)).toBeDefined());
    expect(calls.find((c) => /\/place$/.test(c.url))!.body).toEqual({ songId: 'd02', slot: 0 });
    expect(screen.queryByRole('button', { name: /Song d02/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Song d04/ })).toBeDefined();
    expect(refresh).toHaveBeenCalled();
  });

  test('不是我的回合 → 位置按鈕停用並顯示輪到誰；放錯顯示日期與罰抽', async () => {
    mockRoomFetch([
      { match: /\/hand$/, handle: () => ({ json: { hand: ['d02'] } }) },
      { method: 'POST', match: /\/place$/, handle: () => ({ json: { correct: false, releaseDate: '2012-01-01', hand: ['d02', 'd12'], state: {}, finished: false } }) },
    ]);
    const { rerender } = render(<TimelineGame code="ABCDE" room={roomWith({ turnSeat: 0 })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByText(/輪到 房主/)).toBeDefined();
    await waitFor(() => expect(screen.getByRole('button', { name: /Song d02/ })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Song d02/ }));
    expect((screen.getByRole('button', { name: '放在第 2 個位置' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<TimelineGame code="ABCDE" room={roomWith({ turnSeat: 1 })} players={players} me={guest} session={session} refresh={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: /Song d02/ }));
    fireEvent.click(screen.getByRole('button', { name: '放在第 2 個位置' }));
    await waitFor(() => expect(screen.getByText(/錯了/)).toBeDefined());
    expect(screen.getByText(/2012-01-01/)).toBeDefined();
    expect(screen.getByText(/罰抽一張/)).toBeDefined();
    expect(screen.getByRole('button', { name: /Song d12/ })).toBeDefined();
  });

  test('顯示上一手結果與各人手牌數；觀戰者沒有手牌區', async () => {
    mockRoomFetch([]);
    render(
      <TimelineGame
        code="ABCDE"
        room={roomWith({ lastResult: { type: 'placed', playerId: 'p1', songId: 'd12', slot: 1, correct: false, drew: true, releaseDate: '2022-01-01' } })}
        players={players}
        me={null}
        session={null}
        refresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText(/房主 把『Song d12』放在第 2 個位置 → 錯了/)).toBeDefined();
    expect(screen.getByText(/房主：5 張/)).toBeDefined();
    expect(screen.getByText(/未来：2 張/)).toBeDefined();
    expect(screen.queryByText(/你的手牌/)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/KamisabiTimelineGame.test.tsx`
Expected: FAIL

- [ ] **Step 3: 寫 `components/kamisabi/room/TimelineGame.tsx`**

```tsx
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/KamisabiTimelineGame.test.tsx`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add components/kamisabi/room/TimelineGame.tsx tests/KamisabiTimelineGame.test.tsx
git commit -m "feat(kamisabi): リリースタイムライン 畫面：手牌、時間軸、放牌與罰抽提示

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: `RoomClient`、`JoinForm`、`Lobby`、`Results`、頁面 `/kamisabi/room/[code]`

**Files:**
- Create: `components/kamisabi/room/JoinForm.tsx`
- Create: `components/kamisabi/room/Lobby.tsx`
- Create: `components/kamisabi/room/Results.tsx`
- Create: `components/kamisabi/room/RoomClient.tsx`
- Create: `app/kamisabi/room/[code]/page.tsx`
- Test: `tests/KamisabiRoomClient.test.tsx`

**Interfaces:**
- `JoinForm` props `{ code: string; onJoined: (s: RoomSession) => void }`。
- `Lobby` props `{ code: string; room: PublicRoom; players: PlayerRow[]; me: PlayerRow; session: RoomSession; refresh: () => Promise<void> }`。
- `Results` props `{ room: PublicRoom; players: PlayerRow[] }`。
- `RoomClient` props `{ code: string }`；依 `useRoom` 狀態分派：loading → spinner；error → 錯誤卡 + 回 `/kamisabi` 連結；lobby 且沒 session → JoinForm；lobby → Lobby；finished → Results；playing → IntroGame / TimelineGame（`me` 可為 null = 觀戰）。

- [ ] **Step 1: 寫失敗測試 `tests/KamisabiRoomClient.test.tsx`**

```tsx
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { mockRoomFetch } from './helpers/mockRoomFetch';
import type { PlayerRow, RoomSong } from '@/lib/kamisabiRoom/types';
import type { PublicRoom } from '@/lib/kamisabiRoom/http';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('@/lib/supabase/browser', () => ({ getSupabaseBrowser: () => null }));

import RoomClient from '../components/kamisabi/room/RoomClient';

const song = (id: string): RoomSong => ({ id, title: `Song ${id}`, brand: 'music_ml', trackId: `t${id}`, artworkUrl: null, releaseDate: null, points: 1 });
const host: PlayerRow = { id: 'p1', room_id: 'r1', name: '房主', seat: 0, is_host: true, joined_at: '' };

function makeDoc() {
  const doc = {
    room: { id: 'r1', code: 'ABCDE', mode: null, status: 'lobby', brand: 'music_ml', songs: [song('a'), song('b')], state: {}, version: 0 } as PublicRoom,
    players: [host] as PlayerRow[],
  };
  const calls = mockRoomFetch([
    { match: /\/api\/kamisabi\/room\/ABCDE$/, handle: () => ({ json: { room: doc.room, players: doc.players, serverNow: Date.now() } }) },
    {
      method: 'POST', match: /\/join$/, handle: (body) => {
        const b = body as { name: string };
        doc.players = [...doc.players, { id: 'p2', room_id: 'r1', name: b.name, seat: 1, is_host: false, joined_at: '' }];
        return { status: 201, json: { playerId: 'p2', token: 'tok2', seat: 1 } };
      },
    },
    {
      method: 'POST', match: /\/start$/, handle: (body) => {
        const b = body as { mode: 'intro' | 'karuta' | 'timeline' };
        doc.room = { ...doc.room, mode: b.mode, status: 'playing', version: 1, state: { kind: 'intro', round: 0, currentSongId: null, startsAt: null, resolved: false, taken: {}, scores: {}, pendingDiscards: {}, lastResult: null } };
        return { json: { state: doc.room.state } };
      },
    },
  ]);
  return { doc, calls };
}

beforeEach(() => localStorage.clear());

describe('RoomClient', () => {
  test('沒有 session → 加入表單 → 加入後進大廳（非房主看到等待訊息），session 存進 localStorage', async () => {
    const { calls } = makeDoc();
    render(<RoomClient code="ABCDE" />);
    const input = await screen.findByLabelText('你的名字');
    fireEvent.change(input, { target: { value: '未来' } });
    fireEvent.click(screen.getByText('加入房間'));
    await waitFor(() => expect(screen.getByText(/等待房主開始/)).toBeDefined());
    expect(screen.getByText(/未来/)).toBeDefined();
    expect(calls.find((c) => /\/join$/.test(c.url))!.body).toEqual({ name: '未来' });
    expect(JSON.parse(localStorage.getItem('kamisabi:room:ABCDE')!)).toMatchObject({ playerId: 'p2', token: 'tok2' });
    expect(screen.queryByText('開始遊戲')).toBeNull();
  });

  test('房主：大廳顯示房號、玩法選單；人數不足時不能開始；加入第二人後開始 → 進遊戲畫面', async () => {
    const { doc, calls } = makeDoc();
    localStorage.setItem('kamisabi:room:ABCDE', JSON.stringify({ playerId: 'p1', token: 'tok1', name: '房主' }));
    render(<RoomClient code="ABCDE" />);
    await screen.findByText('ABCDE');
    const startBtn = screen.getByText('開始遊戲') as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);
    expect(screen.getByText(/至少需要 2 位玩家/)).toBeDefined();

    // 模擬另一個人加入（輪詢會抓到；這裡直接改資料再觸發 visibilitychange 讓它重抓）
    doc.players = [host, { id: 'p2', room_id: 'r1', name: '未来', seat: 1, is_host: false, joined_at: '' }];
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect((screen.getByText('開始遊戲') as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(screen.getByLabelText(/かるたモード/));
    fireEvent.click(screen.getByText('開始遊戲'));
    await waitFor(() => expect(screen.getByText(/かるたモード · 房間 ABCDE/)).toBeDefined());
    expect(calls.find((c) => /\/start$/.test(c.url))!.body).toEqual({ mode: 'karuta' });
  });

  test('遊戲已開始且沒有 session → 觀戰模式，不會白屏', async () => {
    const { doc } = makeDoc();
    doc.room = { ...doc.room, mode: 'intro', status: 'playing', state: { kind: 'intro', round: 0, currentSongId: null, startsAt: null, resolved: false, taken: {}, scores: {}, pendingDiscards: {}, lastResult: null } };
    render(<RoomClient code="ABCDE" />);
    await waitFor(() => expect(screen.getByText(/觀戰模式/)).toBeDefined());
    expect(screen.queryByLabelText('你的名字')).toBeNull();
  });

  test('結束 → 結算排名；找不到房間 → 錯誤訊息與回首頁連結', async () => {
    const { doc } = makeDoc();
    doc.room = { ...doc.room, mode: 'intro', status: 'finished', state: { kind: 'intro', round: 2, currentSongId: null, startsAt: null, resolved: true, taken: { a: 'p1', b: 'p2' }, scores: { p1: 1, p2: 1 }, pendingDiscards: {}, lastResult: null } };
    doc.players = [host, { id: 'p2', room_id: 'r1', name: '未来', seat: 1, is_host: false, joined_at: '' }];
    const { unmount } = render(<RoomClient code="ABCDE" />);
    await waitFor(() => expect(screen.getByText(/遊戲結束/)).toBeDefined());
    expect(screen.getByText(/房主/)).toBeDefined();
    expect(screen.getAllByText(/1 分/).length).toBe(2);
    unmount();

    mockRoomFetch([{ match: /\/api\/kamisabi\/room\/ZZZZZ$/, handle: () => ({ status: 404, json: { error: '找不到這個房間。', code: 'ROOM_NOT_FOUND' } }) }]);
    render(<RoomClient code="ZZZZZ" />);
    await waitFor(() => expect(screen.getByText('找不到這個房間。')).toBeDefined());
    expect(screen.getByText(/回到 KAMISABI/).getAttribute('href')).toBe('/kamisabi');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/KamisabiRoomClient.test.tsx`
Expected: FAIL

- [ ] **Step 3: 寫 `components/kamisabi/room/JoinForm.tsx`**

```tsx
'use client';

import React, { useState } from 'react';
import { RoomApiError, roomApi } from './roomApi';
import type { RoomSession } from './roomStorage';
import { PLAYER_NAME_MAX } from '@/lib/kamisabiRoom/types';

interface JoinFormProps {
  code: string;
  onJoined: (session: RoomSession) => void;
}

/** 沒有這個房間的 session 時：輸入名字加入 */
export default function JoinForm({ code, onJoined }: JoinFormProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await roomApi.join(code, trimmed);
      onJoined({ playerId: r.playerId, token: r.token, name: trimmed });
    } catch (err) {
      setError(err instanceof RoomApiError ? err.message : '加入失敗，請再試一次。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '0 16px' }}>
      <form onSubmit={submit} className="card-el" style={{ padding: '32px', borderRadius: '24px', maxWidth: '420px', width: '100%', backgroundColor: 'rgba(255,255,255,0.85)' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 4px' }}>加入房間 {code}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 20px' }}>輸入大家認得出你的名字。</p>
        <label htmlFor="join-name" style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>你的名字</label>
        <input
          id="join-name"
          value={name}
          maxLength={PLAYER_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          autoComplete="nickname"
          style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '16px' }}
        />
        {error && <div className="kamisabi-banner is-bad" style={{ marginBottom: '12px' }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()} style={{ width: '100%', padding: '14px', fontSize: '18px', borderRadius: '14px' }}>
          加入房間
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: 寫 `components/kamisabi/room/Lobby.tsx`**

```tsx
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
```

- [ ] **Step 5: 寫 `components/kamisabi/room/Results.tsx`**

```tsx
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
```

- [ ] **Step 6: 寫 `components/kamisabi/room/RoomClient.tsx`**

```tsx
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
```

- [ ] **Step 7: 寫 `app/kamisabi/room/[code]/page.tsx`**

```tsx
import React from 'react';
import RoomClient from '@/components/kamisabi/room/RoomClient';
import GuessWrapper from '@/app/guess/GuessWrapper';

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params) {
  const { code } = await params;
  return {
    title: `KAMISABI 房間 ${code.toUpperCase()} | imas song familiarity`,
    description: '線上一起玩 KAMISABI 歌牌：イントロ、かるた、リリースタイムライン',
  };
}

export default async function KamisabiRoomPage({ params }: Params) {
  const { code } = await params;
  return (
    <GuessWrapper>
      <RoomClient code={code.toUpperCase()} />
    </GuessWrapper>
  );
}
```

- [ ] **Step 8: 跑測試確認通過**

Run: `npx vitest run tests/KamisabiRoomClient.test.tsx`
Expected: PASS（4 tests）

- [ ] **Step 9: Commit**

```bash
git add components/kamisabi/room/JoinForm.tsx components/kamisabi/room/Lobby.tsx components/kamisabi/room/Results.tsx components/kamisabi/room/RoomClient.tsx "app/kamisabi/room/[code]/page.tsx" tests/KamisabiRoomClient.test.tsx
git commit -m "feat(kamisabi): 房間頁面：加入、大廳、結算、依狀態分派遊戲畫面

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: `/kamisabi` 設定頁加「線上房間」開房 / 加入入口

**Files:**
- Create: `components/kamisabi/room/RoomEntry.tsx`
- Modify: `components/kamisabi/KamisabiClient.tsx`（setup 畫面下方加 `<RoomEntry>`）
- Modify: `tests/KamisabiClient.test.tsx`（加 `next/navigation` mock）
- Test: `tests/KamisabiRoomEntry.test.tsx`

**Interfaces:**
- `RoomEntry` props `{ allSongs: KamisabiSong[]; brandCounts: Record<string, number> }`（都來自 `useKamisabi()`）。開房成功 → `saveSession` → `router.push('/kamisabi/room/<CODE>')`。

- [ ] **Step 1: 寫失敗測試 `tests/KamisabiRoomEntry.test.tsx`**

```tsx
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { mockRoomFetch } from './helpers/mockRoomFetch';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import RoomEntry from '../components/kamisabi/room/RoomEntry';

const songs = [
  { id: 's1', title: 'Song A', brand: 'music_ml', appleTrackId: '1', members: [], units: [] },
  { id: 's2', title: 'Song B', brand: 'music_ml', appleTrackId: '2', members: [], units: [] },
  { id: 's3', title: 'Song C', brand: 'music_shiny', appleTrackId: '3', members: [], units: [] },
];
const brandCounts = { music_ml: 2, music_shiny: 1 };

beforeEach(() => { push.mockReset(); localStorage.clear(); });

describe('RoomEntry', () => {
  test('開房：選品牌、勾シングル → POST create → 存 session → 導向房間', async () => {
    const calls = mockRoomFetch([{ method: 'POST', match: /\/api\/kamisabi\/room$/, handle: () => ({ status: 201, json: { code: 'QWERT', roomId: 'r', playerId: 'p1', token: 't1' } }) }]);
    render(<RoomEntry allSongs={songs} brandCounts={brandCounts} />);
    fireEvent.change(screen.getByLabelText('你的名字'), { target: { value: '房主' } });
    fireEvent.click(screen.getByLabelText(/ミリオンライブ/));
    fireEvent.click(screen.getByText(/標記シングル/));
    fireEvent.click(screen.getByLabelText('Song B'));
    fireEvent.click(screen.getByText('開房'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/kamisabi/room/QWERT'));
    expect(calls[0].body).toEqual({ name: '房主', brand: 'music_ml', singles: ['s2'] });
    expect(JSON.parse(localStorage.getItem('kamisabi:room:QWERT')!)).toMatchObject({ playerId: 'p1', token: 't1', name: '房主' });
  });

  test('加入：輸入房號（自動大寫）→ POST join → 導向；錯誤顯示訊息', async () => {
    mockRoomFetch([
      { method: 'POST', match: /\/api\/kamisabi\/room\/ABCDE\/join$/, handle: () => ({ status: 201, json: { playerId: 'p2', token: 't2', seat: 1 } }) },
      { method: 'POST', match: /\/api\/kamisabi\/room\/ZZZZZ\/join$/, handle: () => ({ status: 404, json: { error: '找不到這個房間。', code: 'ROOM_NOT_FOUND' } }) },
    ]);
    render(<RoomEntry allSongs={songs} brandCounts={brandCounts} />);
    fireEvent.click(screen.getByText('加入房間'));
    fireEvent.change(screen.getByLabelText('你的名字'), { target: { value: '未来' } });
    fireEvent.change(screen.getByLabelText('房間代碼'), { target: { value: 'zzzzz' } });
    fireEvent.click(screen.getByText('加入'));
    await waitFor(() => expect(screen.getByText('找不到這個房間。')).toBeDefined());
    fireEvent.change(screen.getByLabelText('房間代碼'), { target: { value: 'abcde' } });
    fireEvent.click(screen.getByText('加入'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/kamisabi/room/ABCDE'));
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/KamisabiRoomEntry.test.tsx`
Expected: FAIL

- [ ] **Step 3: 寫 `components/kamisabi/room/RoomEntry.tsx`**

```tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RoomApiError, roomApi } from './roomApi';
import { saveSession } from './roomStorage';
import type { KamisabiSong } from '../types';
import { BRAND_VALUES } from '@/lib/brandMap';
import { getBrandColor, getBrandDisplayName } from '@/lib/themeUtils';
import { BrandIcon } from '@/components/BrandIcon';
import { PLAYER_NAME_MAX, ROOM_CODE_LENGTH } from '@/lib/kamisabiRoom/types';

interface RoomEntryProps {
  allSongs: KamisabiSong[];
  brandCounts: Record<string, number>;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '12px', fontSize: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' };

/** /kamisabi 設定頁下方的「線上房間」入口：開房（品牌 + 標記シングル）或輸入房號加入 */
export default function RoomEntry({ allSongs, brandCounts }: RoomEntryProps) {
  const router = useRouter();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [singles, setSingles] = useState<string[]>([]);
  const [showSingles, setShowSingles] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brands = BRAND_VALUES.filter((b) => (brandCounts[b] ?? 0) > 0);
  const brandSongs = allSongs.filter((s) => s.brand === brand);

  const toggleSingle = (id: string) => setSingles((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = async () => {
    if (busy || !name.trim() || !brand) return;
    setBusy(true);
    setError(null);
    try {
      const r = await roomApi.create({ name: name.trim(), brand, singles });
      saveSession(r.code, { playerId: r.playerId, token: r.token, name: name.trim() });
      router.push(`/kamisabi/room/${r.code}`);
    } catch (e) {
      setError(e instanceof RoomApiError ? e.message : '開房失敗，請再試一次。');
      setBusy(false);
    }
  };

  const join = async () => {
    const c = code.trim().toUpperCase();
    if (busy || !name.trim() || c.length !== ROOM_CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const r = await roomApi.join(c, name.trim());
      saveSession(c, { playerId: r.playerId, token: r.token, name: name.trim() });
      router.push(`/kamisabi/room/${c}`);
    } catch (e) {
      setError(e instanceof RoomApiError ? e.message : '加入失敗，請再試一次。');
      setBusy(false);
    }
  };

  return (
    <div className="card-el" style={{ padding: '28px 32px', borderRadius: '24px', maxWidth: '640px', width: '100%', backgroundColor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)', textAlign: 'left', marginTop: '24px' }}>
      <h3 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 4px' }}>🌐 線上房間</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 16px', lineHeight: 1.6 }}>
        不在同一個房間也能玩：開房後把連結傳給朋友，大家在自己的手機上同時聽、同時搶虛擬歌牌。
      </p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button type="button" className={`btn ${tab === 'create' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('create'); setError(null); }}>開新房間</button>
        <button type="button" className={`btn ${tab === 'join' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('join'); setError(null); }}>加入房間</button>
      </div>

      <label htmlFor="room-name" style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>你的名字</label>
      <input id="room-name" value={name} maxLength={PLAYER_NAME_MAX} onChange={(e) => setName(e.target.value)} autoComplete="nickname" style={{ ...inputStyle, marginBottom: '16px' }} />

      {tab === 'create' ? (
        <>
          <p style={{ fontWeight: 700, margin: '0 0 8px' }}>歌牌品牌（一房一套）</p>
          <div className="brand-picker-grid" style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
            {brands.map((b) => {
              const checked = brand === b;
              const color = getBrandColor(b);
              return (
                <label key={b} className={`brand-card ${checked ? 'is-checked' : ''}`} style={checked ? { borderColor: color, backgroundColor: `${color}10`, cursor: 'pointer' } : { cursor: 'pointer' }}>
                  <input type="radio" name="room-brand" value={b} checked={checked} onChange={() => { setBrand(b); setSingles([]); }} className="sr-only" />
                  <span className="brand-card-icon"><BrandIcon brand={b} className="brand-card-svg" /></span>
                  <span className="brand-card-name" style={{ fontSize: '12px' }}>{getBrandDisplayName(b)}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted, #9ca3af)', whiteSpace: 'nowrap' }}>{brandCounts[b]} 首</span>
                </label>
              );
            })}
          </div>
          {brand && (
            <div style={{ marginBottom: '16px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowSingles((v) => !v)} style={{ fontSize: '13px' }}>
                {showSingles ? '▾' : '▸'} 標記シングル（2 分）{singles.length > 0 ? `：已選 ${singles.length} 首` : ''}
              </button>
              {showSingles && (
                <div style={{ maxHeight: '220px', overflowY: 'auto', marginTop: '8px', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'grid', gap: '4px' }}>
                  {brandSongs.map((s) => (
                    <label key={s.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={singles.includes(s.id)} onChange={() => toggleSingle(s.id)} />
                      {s.title}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {error && <div className="kamisabi-banner is-bad" style={{ marginBottom: '12px' }}>{error}</div>}
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim() || !brand} onClick={create} style={{ width: '100%', padding: '14px', fontSize: '18px', borderRadius: '14px' }}>
            開房
          </button>
        </>
      ) : (
        <>
          <label htmlFor="room-code" style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>房間代碼</label>
          <input
            id="room-code"
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="5 碼"
            style={{ ...inputStyle, letterSpacing: '0.2em', fontWeight: 900, marginBottom: '16px' }}
          />
          {error && <div className="kamisabi-banner is-bad" style={{ marginBottom: '12px' }}>{error}</div>}
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim() || code.trim().length !== ROOM_CODE_LENGTH} onClick={join} style={{ width: '100%', padding: '14px', fontSize: '18px', borderRadius: '14px' }}>
            加入
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 修改 `components/kamisabi/KamisabiClient.tsx`**

在 import 區加 `import RoomEntry from './room/RoomEntry';`；從 `useKamisabi()` 解構多拿 `allSongs`；setup 畫面最外層 `<div style={{ display:'flex', flexDirection:'column', alignItems:'center', ... }}>` 裡，在單機設定的 `</div>`（`card-el`）之後加：

```tsx
        <RoomEntry allSongs={allSongs} brandCounts={brandCounts} />
```

- [ ] **Step 5: 修改 `tests/KamisabiClient.test.tsx`**

在 `vi.mock('next-auth/react', …)` 後加：

```ts
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run tests/KamisabiRoomEntry.test.tsx tests/KamisabiClient.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add components/kamisabi/room/RoomEntry.tsx components/kamisabi/KamisabiClient.tsx tests/KamisabiRoomEntry.test.tsx tests/KamisabiClient.test.tsx
git commit -m "feat(kamisabi): /kamisabi 加線上房間入口：開房（品牌、標記シングル）與輸入房號加入

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: 文件、全量驗證

**Files:**
- Modify: `docs/research-streaming-intro-quiz-mode.md`（§18 之後加 §19 線上房間實作紀錄與上線步驟）

- [ ] **Step 1: 在研究文件尾端加 §19**

```markdown

---

## 19. 線上房間模式實作紀錄

| 檔案 | 說明 |
|---|---|
| `supabase/schema.sql` | §13 資料表、RLS、Realtime publication；在 Supabase SQL editor 執行一次 |
| `lib/supabase/server.ts`、`lib/supabase/browser.ts` | service role（只給 API route）/ anon（瀏覽器讀 + 訂閱）client |
| `lib/kamisabiRoom/types.ts` | Room / Player / Secret / IntroState / TimelineState |
| `lib/kamisabiRoom/logic.ts` | 純函式：房號、搶牌、お手つき、計分、時間軸發牌 / 放牌 / 罰抽 |
| `lib/kamisabiRoom/store.ts`、`auth.ts`、`mutate.ts`、`snapshot.ts`、`http.ts` | Supabase 讀寫、token 驗證、樂觀鎖重試、開房快照（Neon + 批次 iTunes 封面） |
| `app/api/kamisabi/room/**` | §15 的 API（另加 `end`、`lyrics`） |
| `app/api/kamisabi/ping/route.ts` + `vercel.json` | 每 3 天喚醒 Supabase、清 24 小時前的房 |
| `components/kamisabi/room/*` | RoomEntry（/kamisabi 入口）、RoomClient、JoinForm、Lobby、IntroGame、TimelineGame、Results、useRoom、useSyncedAudio |
| `app/kamisabi/room/[code]/page.tsx` | 房間頁 |
| `lib/karutaTts.ts`、`scripts/karuta-lyrics.ts`、`scripts/gen-karuta-tts.ts` | かるた朗讀 SSML、歌詞對照表、Google TTS 產檔（`npm run gen:karuta-tts`） |
| `public/kamisabi/tts/` | 朗讀檔 `<songId>.mp3` |

與 §14 的差異：
- `rooms.mode` 改為可為 null（開始時才選玩法）；多一支 `POST /end`（房主提前結束）與 `GET /lyrics`（Web Speech 備援只回當前題）。
- 時間軸的山札不另外存：山札 = 有發行日的歌 − 時間軸 − 所有手牌，抽牌時隨機。
- お手つき後未丟牌前不能再搶；全部取完且沒有待丟才結束。

上線步驟：
1. Supabase Dashboard → SQL editor 執行 `supabase/schema.sql`。
2. Vercel 與本機 `.env` 設 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`（可選 `CRON_SECRET`）。
3. `scripts/seed-apple-ids.ts` 補歌牌收錄曲的 Apple Music 連結 → `npm run seed:apple-ids`；時間軸模式另需 `releaseDate`（`npm run seed:dates`）。
4. かるた：`scripts/karuta-lyrics.ts` 填副歌片段 → `GOOGLE_TTS_API_KEY=… npm run gen:karuta-tts` → commit `public/kamisabi/tts/*.mp3`。
5. 開 `/kamisabi` → 線上房間 → 開房。
```

- [ ] **Step 2: 全量測試**

Run: `npm test`
Expected: 全部 PASS（既有測試含連 Neon 的 `auth.test.ts` 等，若本機 DB 不可用會失敗，那是環境問題，記錄下來但不算本 plan 的回歸）

- [ ] **Step 3: 型別與 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 無錯誤

- [ ] **Step 4: Build**

Run: `npx next build`
Expected: 成功；`/kamisabi/room/[code]` 出現在 Dynamic routes；`/api/kamisabi/room/*` 為 Dynamic。

- [ ] **Step 5: Commit**

```bash
git add docs/research-streaming-intro-quiz-mode.md
git commit -m "docs(kamisabi): 線上房間模式實作紀錄與上線步驟

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（§10–§17 → Task）**

| 需求 | Task |
|---|---|
| §10 路徑 `/kamisabi/room/[code]`、Apple 30 秒整段、Supabase 房間 DB、三個環境變數 | 1、15 |
| §10 只做 ①③，不做 ②④ | 2、3（`ROOM_MODES` 只有三種） |
| §10 語音：不做多人語音，Google TTS 預產檔 | 12 |
| §10 虛擬歌牌仿實體卡 | 10 |
| §11 かるた規則：読み手朗讀 → 取牌 → 50 張取完計分、アルバム 1 / シングル 2、お手つき自選丟一張 | 2、7、13 |
| §11 イントロ：シャッフル再生，讀み手なしでも可（房主按下一張） | 2、7、13 |
| §11 時間軸：5 張手牌、初期札、左右中間、翻面確認、放錯罰抽（山札 0 不抽）、先出完勝、2–8 人 | 3、8、14 |
| §12 開房快照 Neon → `rooms.songs`，之後不碰 Neon | 5、6 |
| §12 寫入走 API route + service role；瀏覽器 anon 只讀 + 訂閱；試聽直連 Apple | 4、6–8、11 |
| §13 三張表、RLS、publication、`rooms.state` 內容、手牌只在 `room_secrets` | 1、4、8 |
| §14 玩家身分：token 存 localStorage、房主 = 第一位加入者 | 4、6、11 |
| §14 下一張：隨機未取走、`startsAt = now+3s`；預載、同時播放；iOS 需點一次準備完成 | 2、7、11、13 |
| §14 樂觀鎖第一個 UPDATE 得卡 | 4、7 |
| §14 お手つき：API 回可丟的牌、前端選單、丟回場上 | 2、7、13 |
| §14 30 秒無人取得留在場上稍後重出 | 2（`pickNextSong` 不立刻重出） |
| §14 全部取完計分、シングル由房主開房時標記 | 2、7、16 |
| §14 時間軸：發牌、`place` 驗證同日皆可、放錯留手牌罰抽並顯示日期、輪下一位、手牌歸零勝 | 3、8、14 |
| §14 TTS：Neural2-B、0.95、SSML 600ms、`gen-karuta-tts.ts`、`karuta-lyrics.ts`、Web Speech 備援、歌詞不顯示 | 12、13 |
| §14.5 卡片狀態：取走灰化 + 名牌、點錯紅框抖動、得卡綠框、★2pt、時間軸日期 | 10 |
| §15 API 一覽（含 hand、既有 preview） | 6、7、8 |
| §16 ping cron、Realtime 額度、24 小時清房 | 9 |

**Type consistency 檢查點**：`RoomSong` 欄位（`trackId` 不是 `appleTrackId`）在 Task 5 快照、Task 13/14 畫面一致；`runRoomMutation` 回 `outcome.result` 且 `hands` 走 `setHands`；`PublicRoom` 來自 `lib/kamisabiRoom/http.ts`，前端 `roomApi.ts` / `useRoom.ts` 皆從那裡 import；`RoomApiError.code` 與後端 `AppError.code` 同名。

**已知取捨**（執行者不用再問）：
- 一房一品牌（spec `brand text not null`）。
- 觀戰模式是「沒有 session 且房間已開始」的自然結果，不另做 API。
- 沒有「離開房間」功能；房間 24 小時後由 Cron 清掉。
- Realtime UPDATE 事件只在 `rooms` 列的 `version` 變大時套用，避免舊事件蓋新狀態。
