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
