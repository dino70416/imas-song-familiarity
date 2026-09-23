# 研究：「串流試聽 × 實體卡牌」猜歌模式可行性評估

> **狀態：計畫已確認。單機出題機 `/kamisabi` 已實作於本分支（§18）；線上房間模式（Supabase）待做，見 §10 起**
> 日期：2026-09-23
> 起因：想新增一個模式：在後台建立播放清單 → 頁面播放 Apple Music 等串流的試聽版 → 現場玩家用 KAMISABI 之類的實體卡牌搶答，**不給選項**。
> 參考：Lantis「KAMISABIとは」 <https://lantis.jp/topics/news/5907/>

---

## 0. 結論（TL;DR）

- **可以做，而且比現有猜歌模式更簡單**：不需要出選項、不需要防作弊，頁面只是一台「會遮住歌名的出題播放器」。
- **音源建議用 iTunes Search API 的 30 秒試聽（`previewUrl`）**：免帳號、免金鑰、免費、直接給 `.m4a` 檔，用 `<audio>` 就能播，可精確控制「只播 5 秒 / 10 秒」、重播、倒數。
- **兩個要先知道的限制**：
  1. Apple 的 30 秒試聽**不一定從前奏開始**（通常是副歌前後），所以它本質上是「猜歌」而非嚴格的「猜前奏」。
  2. Apple 的使用條款要求試聽用途為「推廣 iTunes/Apple Music 內容」、需附 Apple Music 連結/徽章、不得存檔快取音檔。公佈答案時附上「在 Apple Music 聆聽」按鈕即可大致滿足。
- **Spotify 不可行**：2024-11-27 之後新建立的 App 拿不到 `preview_url`（永遠 `null`），官方已確認不會開回。
- **「後台」目前不存在**：專案沒有 admin 角色。建議直接讓「每位登入使用者都能建立自己的題組」，用既有 `User` + `shareCode` 的模式分享，省掉做權限系統。
- 沙箱環境擋住了 `itunes.apple.com` 與日本網站，**下面第 3 節的測試 URL 請你在瀏覽器親自打一次**確認 Lantis 曲目的 `previewUrl` 有回來。

---

## 1. KAMISABI 是什麼、我們的模式要對應哪一段

依 Lantis / アイマス官網公告與體驗會報導彙整（原文網頁在本次環境無法直接讀取）：

- Bandai Namco Music Live 推出的「音楽をKAMIしめるカードゲーム」，2026 年 5 月起發售，
  分 **ミリオンライブ！ / SideM / シャイニーカラーズ** 三套「アルバムセット」（50 張卡 + 規則書，3,800 円），另有單包（1 張 / 100 種）。
- 卡片上印有曲名、歌詞片段、樂曲資訊等；規則書內含 **4 種玩法**，其中：
  - **イントロモード（イントロクイズ × かるた）**：用「音樂播放器」播歌，玩家聽到後**搶對應的卡**。
  - **歌詞モード**：讀歌詞，搶對應的卡（歌留多）。
  - 其餘兩種利用樂曲資訊（資料不足，未確認細節）。
- 關鍵點：**官方並沒有提供播歌的 App**，イントロモード是要玩家自己用手機/串流放歌。

→ 也就是說，這個新模式的定位是「**KAMISABI イントロモード的出題機**」：
主持人開頁面、按播放、大家搶卡、主持人按「公佈答案」。得分計算在桌上（卡牌數）就好，網頁不必管誰答對。

---

## 2. 音源方案比較

| 方案 | 可行性 | 需要什麼 | 優點 | 缺點 / 風險 |
|---|---|---|---|---|
| **A. iTunes Search API `previewUrl`**（推薦 MVP） | ✅ | 無（公開 API，無金鑰） | 免費、回傳 30 秒 `.m4a` 直鏈；`<audio>` 可精確 seek/停止；`country=jp` 涵蓋 Lantis 全曲；一併拿到 `trackId`、封面、`trackViewUrl` | 條款要求「推廣用途 + 附商店連結 + 不得快取音檔」；試聽段落不一定是前奏；約 **20 次/分鐘** 的 rate limit（需 server 端代理 + 快取結果）；`previewUrl` 可能會過期，要靠 `trackId` 重新 lookup |
| **B. MusicKit JS v3 + Apple Music API** | ✅（進階） | Apple Developer Program（US$99/年）、MusicKit 私鑰、server 端簽 developer token JWT | 正式授權路徑；同樣可拿 `previews[0].url` 30 秒（無 DRM，可用 `<audio>`）；訂閱者登入後還能聽**完整曲**（真正的「從前奏開始」） | 成本與設定較高；MusicKit 播放器 API 在 Chromium 上只給 30 秒（需登入 Safari 才完整）；`previewOnly` 行為有已知怪癖 |
| **C. Apple Music 內嵌 iframe（`embed.music.apple.com`）** | ⚠️ 不建議 | 無 | 未登入即播 30 秒 | iframe 會**直接顯示歌名與封面**，且沒有可程式化的 play/pause，遮起來就按不到，等於不能用 |
| **D. Spotify Web API `preview_url`** | ❌ | — | — | 2024-11-27 後新 App 一律回 `null`，Spotify 已確認為刻意且永久 |
| **E. Spotify iFrame API（EmbedController）** | ⚠️ 勉強 | Spotify 帳號建立歌單 | 有 `play()/seek()` 等 JS 控制；未登入聽眾可聽 30 秒 | 一樣會顯示歌名要另外遮；預覽段落不可控；歌單資料在 Spotify 不在我們 DB |
| **F. YouTube（現有 `Song.youtubeIds`）** | ✅ 已有 | 無 | 已經有 `YoutubePlayer` + 遮罩；官方影片多數從前奏開始（真正的イントロ） | 只有部分曲目有官方 MV/試聽；行動裝置自動播放與載入延遲較差；不能精準「只播 3 秒」（可用 `start`+`pauseVideo` 近似） |
| **G. 自行上傳音檔** | ❌ | — | — | 著作權問題，不做 |

**建議**：先用 **A** 做 MVP，並在資料表預留 `appleTrackId`，之後若想升級到 **B**（讓訂閱者聽完整前奏），資料不用重灌。
同時可讓題組的每一首歌**可選音源**（Apple 試聽 / YouTube），YouTube 剛好補上「想從前奏開始」的需求。

### 2.1 官方「試聴ページ」列的五個平台，哪些能拿來嵌在我們頁面裡？

Lantis 曲目的試聴ページ（smart link）通常列 Amazon Music / Apple Music / LINE MUSIC / Spotify / YouTube Music 五個「播放」按鈕。
那種頁面只是**跳轉到各平台 App / 網頁的深連結**，本身不提供音檔，所以真正的問題是「各平台有沒有辦法讓我們的網頁**遮住歌名**播試聽、並用程式控制播放」：

| 平台 | 能在我們頁面播試聽？ | 能用 JS 控制（播/停/秒數）？ | 能遮住歌名？ | 評語 |
|---|---|---|---|---|
| **Apple Music** | ✅ iTunes `previewUrl`（30 秒 m4a）/ MusicKit | ✅ `<audio>` 完全控制 | ✅ 我們自己畫 UI | **首選**，見方案 A / B |
| **YouTube Music** | ✅ 等同 YouTube，Lantis 幾乎全曲目都有自動產生的「〇〇 - Topic」Art Track（**完整曲、從前奏開始**） | ✅ 既有 `react-youtube` IFrame API（`seekTo`/`pauseVideo`） | ✅ 既有遮罩 | **真前奏的最佳來源**；但需確認 Lantis 的 Art Track 是否允許嵌入（部分日本唱片公司關閉 embed 或鎖區域），本專案現有 `youtubeIds` 多為官方 MV/試聽，尚未收 Topic 版 |
| **Spotify** | ⚠️ 只剩 iFrame 內嵌播放器（未登入 30 秒） | ⚠️ iFrame API 有 `play()/seek()`，但為「Embed」設計，行為受平台調整 | ⚠️ 需自行蓋遮罩 | 備援；`preview_url` 對新 App 已停 |
| **Amazon Music** | ⚠️ 只有官方 embed 小工具（iframe，未登入 30 秒） | ❌ 無公開 API / 無 JS 控制 | ❌ iframe 內直接顯示曲名封面 | 不可用 |
| **LINE MUSIC** | ⚠️ 只有官方 embed 小工具（iframe，30 秒） | ❌ 無公開 API / 無 JS 控制 | ❌ 同上 | 不可用（且僅限日本 IP） |

結論不變：**Apple（試聽段）+ YouTube（完整曲/前奏）雙音源**就涵蓋了所有需求；Spotify 留作備援；Amazon 與 LINE MUSIC 只能放在「公佈答案」畫面當外部連結（順便滿足「推廣用途」）。

補充：如果你想在公佈答案時提供「到各平台聆聽」的按鈕，可以直接存該曲的試聴ページ網址（`QuizItem.smartLinkUrl`），不必自己維護五個平台的 ID。

### 2.2 iTunes Search API 條款要點（Apple Services Performance Partners）

- 試聽（Promo Content）只能用於「推廣該內容」本身，不得作為獨立娛樂用途。
- 必須**鄰近**「Download on iTunes / Apple Music」徽章或連結（`trackViewUrl`）。
- 僅可**串流**，不得下載、儲存、快取音檔。
- 建議附上 "provided courtesy of iTunes" / "Music previews via Apple Music" 之類的字樣。

實務對應：
- 我們**只存 `trackId` 與 metadata**，不存音檔；播放時 `<audio src={previewUrl}>` 直接串 Apple CDN。
- 公佈答案畫面放封面 + 「在 Apple Music 聆聽」按鈕（連到 `trackViewUrl`）+ courtesy 字樣。
- 猜歌明顯帶娛樂性，屬灰色地帶；但這種做法與市面上大量 "guess the song" 網站相同，風險是 Apple 可要求停用，不會有法律訴訟層級的問題。若想完全乾淨，走方案 B。

---

## 3. 需要你本機驗證的兩個 URL

沙箱擋住 `itunes.apple.com`，以下無法在此環境實測，請在瀏覽器開：

```
https://itunes.apple.com/search?term=アイドルマスター%20READY!!&country=jp&media=music&entity=song&limit=5
https://itunes.apple.com/lookup?id=<上面回傳的 trackId>&country=jp
```

確認：
1. `results[].previewUrl` 存在且是 `https://audio-ssl.itunes.apple.com/.../...m4a`。
2. `artistName` 是 765 MILLION ALLSTARS / 各偶像 CV 名等（可用來對回 `Song.members`）。
3. 直接開 `previewUrl` 能在瀏覽器播放（Safari / Chrome / iOS 都試一下）。

若 1 成立，本文件其餘設計都成立。

---

## 3.5 簡化版設計 v2（2026-09-23 決定）

決定事項：
1. **Apple Music 試聽 OK**：這個遊戲本來就是「聽副歌猜歌」，Apple 選段在副歌附近反而剛好。YouTube 不需要當第二音源。
2. **連結由站長自己補進資料庫**：不做站內 iTunes 搜尋 UI，改成像 `youtubeIds` 一樣的資料欄位 + seed script。

### 資料欄位：直接加在 `Song` 上

```prisma
model Song {
  // ...既有欄位
  appleTrackId String?   // iTunes/Apple Music 曲目 ID；null = 未處理，'' = 確認 Apple Music 沒有
}
```

- 從 Apple Music 分享連結 `https://music.apple.com/jp/album/ready/1440851727?i=1440851730` 取 **`i=` 後面的數字** 就是 `trackId`。
- 貼連結或貼 ID 都可以，script 用 regex 抓 `[?&]i=(\d+)` 或純數字。

### 補資料的三條路（可並用）

| 方式 | 做法 | 適合 |
|---|---|---|
| a. 手動對照表 | `scripts/seed-apple-ids.ts`，格式同 `seed-youtube-ids.ts`：`{ "曲名": "1440851730" }` | 少量、精確 |
| b. 自動比對 | 同一支 script 加 `--auto`：對每首 `appleTrackId === null` 的歌打 `itunes.apple.com/search?term=<title>&country=jp&entity=song`，用 `scripts/lib/normalize.ts` 正規化曲名後完全相符且 `artistName` 含任一 `members`/`units` 名才寫入；否則列在報告留給人工 | 一次把大宗鋪掉（受 20 次/分限制，2,600 首約 2.5 小時，可分批跑） |
| c. 站內編輯 | 若之後想在網頁上補，登入者在 `SongDetailModal` 加一格「Apple Music 連結」貼上即存（可限定 `ADMIN_USERNAMES`） | 零星補漏 |

建議先做 a + b，c 之後看需求。

### 播放清單：MVP 不需要新資料表

既然連結掛在 `Song` 上，「清單」就只是一組 `songId`：
- **MVP**：主持人頁 `/kamisabi` 沿用現有品牌 / 偶像 / 組合 / 熟悉度篩選器選歌（只列 `appleTrackId` 非空者），按「開始」即可；順序亂數或依原順序。
- **v2（若要存清單）**：再加第 4 節的 `QuizSet`，但 `QuizItem` 只剩 `songId` + `order`（Apple 資料都在 `Song`）。

### 播放流程

1. 主持人頁載入題目清單（只有 `songId`，**不含曲名**）。
2. 每題：`GET /api/apple/preview?trackId=` → server 打 `itunes.apple.com/lookup`（`revalidate` 6 小時）→ 回 `previewUrl` + 封面 + `trackViewUrl`。
3. `<audio>` 播放，UI 只顯示進度條；固定播整段 30 秒，可停止 / 繼續 / 重播（定案：不提供秒數選項）。
4. 公佈答案：翻牌顯示曲名 / 演唱者 / 品牌 / 封面 + 「在 Apple Music 聆聽」+ courtesy 字樣；可直接開既有 `SongDetailModal`。
5. 下一題。

### 工時（簡化版）

| 項目 | 估計 |
|---|---|
| migration + `seed-apple-ids.ts`（含 `--auto`） | 0.5 天 |
| `/api/apple/preview` route + 測試 | 0.25 天 |
| 主持人頁（選歌 → 播放 → 公佈 → 下一題） | 1 天 |
| Header 入口、SW 排除、收尾 | 0.25 天 |

合計約 **2 個工作天**，比原估的 3.5 天少。

---

## 4. 資料模型草案（Prisma）

```prisma
model QuizSet {                       // 一個「題組 / 播放清單」
  id          String   @id @default(uuid()) @db.Uuid
  ownerId     String   @db.Uuid
  title       String
  description String?
  shareCode   String   @unique        // 用來開主持人頁 /quiz/[shareCode]
  isPublic    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  owner       User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  items       QuizItem[]
}

model QuizItem {
  id            String   @id @default(uuid()) @db.Uuid
  quizSetId     String   @db.Uuid
  order         Int
  songId        String?  @db.Uuid     // 可選：對回站內 Song，公佈答案時顯示演唱者/品牌/熟悉度
  source        String   @default("apple")   // apple | youtube
  appleTrackId  String?               // iTunes trackId（穩定，用來 re-lookup previewUrl）
  appleTitle    String?               // 快取 metadata（非音檔）：曲名 / 演唱者 / 封面 / 商店連結
  appleArtist   String?
  appleArtwork  String?
  appleStoreUrl String?
  youtubeId     String?
  smartLinkUrl  String?               // 官方試聴ページ（lnk.to 等），公佈答案時顯示「到各平台聆聽」
  clipStart     Int      @default(0)  // 從試聽的第幾秒開始播（0-29）
  clipLength    Int      @default(10) // 一次播幾秒；0 = 整段 30 秒
  note          String?               // 主持人備註（例如「這題只放前 3 秒」）
  quizSet       QuizSet  @relation(fields: [quizSetId], references: [id], onDelete: Cascade)
  song          Song?    @relation(fields: [songId], references: [id])

  @@unique([quizSetId, order])
  @@index([quizSetId])
}
```

- `Song` 加一個反向關聯 `quizItems QuizItem[]`；`User` 加 `quizSets QuizSet[]`。
- **不存 `previewUrl`**（會過期、且違反不得快取的精神）；播放前由 server 用 `appleTrackId` 打 `/lookup` 取得最新 `previewUrl`，server 端以 `revalidate` 快取幾小時即可，避開 20 次/分限制。

---

## 5. 「後台」怎麼做：兩個選項

專案目前是 NextAuth Credentials，`User` 沒有 `role`/`isAdmin`。

| | 選項 A：真的做 admin | 選項 B：每位登入使用者都能建題組（**推薦**） |
|---|---|---|
| 做法 | `User.isAdmin Boolean` 或 `ADMIN_USERNAMES` env；`/admin/quiz` 頁 + API 檢查 | 題組屬於 `ownerId`；`/user/[username]` 個人頁多一個「我的題組」分頁 |
| 分享 | 全站公開題組列表 | 沿用 `shareCode` 的模式：`/quiz/[shareCode]` 任何人可開主持人頁 |
| 工作量 | 多一層權限與 UI | 幾乎全部重用既有模式（個人頁、shareCode、`AppError`） |
| 適用 | 只想由站長維護官方題組 | 各位 P 可自建「今晚 KAMISABI 用歌單」 |

兩者不衝突：先做 B，之後若要「官方精選」再加 `isFeatured` 由 admin 設。

---

## 6. 頁面流程草案

### 6.1 編輯頁 `/quiz/[shareCode]/edit`（擁有者）

1. 搜尋框 → 打站內 API `/api/apple/search?term=…`（server 代理 iTunes Search API，`country=jp`，結果快取 1 小時）。
2. 搜尋結果列出曲名 / 演唱者 / 專輯 / 封面，每筆有 ▶ 試聽（用 `<audio>`），按「加入」。
3. 加入時嘗試以標題模糊比對 `Song.title` 自動掛 `songId`（可手動改）。
4. 清單可拖曳排序、設定 `clipStart` / `clipLength`、切換音源（Apple / YouTube）。
5. 另一個快捷：從既有歌單（熟悉度 1–2 的歌）或品牌批次匯入，系統對每首去 iTunes 搜一次（受 rate limit 影響，需排隊 + 進度條，或改成背景 script）。

### 6.2 主持人頁 `/quiz/[shareCode]`（現場投影 / 手機）

```
[ 題組名稱 ]                        第 3 / 20 題
┌──────────────────────────────┐
│   🔊  請仔細聽…   ▮▮▮▮▮▯▯▯▯▯  │  ← 進度條，不顯示任何文字
└──────────────────────────────┘
[ ▶ 播放 (10s) ] [ 🔁 重播 ] [ +5s 延長 ]
[ 👀 公佈答案 ]                 [ 下一題 → ]
```

- 公佈答案：翻牌動畫顯示封面、曲名、演唱者、品牌 icon、（若有 `songId`）站內詳細 + 熟悉度按鈕 + 「在 Apple Music 聆聽」。
- 可選：簡易計分板（輸入隊名，+1/-1），純前端 `localStorage`，不進 DB。
- 可選：「亂序播放」「隱藏題數」開關。
- 全部播放操作都由主持人點擊觸發 → 不會踩到 iOS/Chrome 的自動播放限制。

### 6.3 API

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/apple/search?term=&limit=` | server 代理 iTunes Search，`revalidate: 3600`，套用既有 `lib/rateLimit.ts` |
| GET | `/api/apple/preview?trackId=` | `/lookup` 取最新 `previewUrl`，`revalidate: 21600` |
| GET/POST | `/api/quiz` | 我的題組列表 / 建立 |
| GET/PATCH/DELETE | `/api/quiz/[id]` | 題組 CRUD（擁有者） |
| PUT | `/api/quiz/[id]/items` | 整批覆寫 items（含順序） |
| GET | `/api/quiz/share/[shareCode]` | 主持人頁用，公開讀取（`isPublic` 或擁有者） |

---

## 7. 技術注意事項

1. **試聽不是前奏**：Apple 選段通常在副歌附近。想要「真前奏」請該題改用 YouTube 音源，或未來升級 MusicKit 讓訂閱者聽完整曲。
2. **Rate limit**：iTunes Search API 約 20 次/分/IP。所有呼叫走 server route + Next.js fetch cache；批次匯入要排隊。
3. **`previewUrl` 會變**：只存 `trackId`，播放前 lookup；遇 403/404 顯示「此曲試聽暫時無法播放」並允許跳題（同現有 `handleVideoError` 的精神）。
4. **音檔跨域**：`<audio src>` 播放不受 CORS 限制；但若要做波形/音量分析（`AudioContext`）會被 CORS 擋，別做。
5. **精準切段**：`audio.currentTime = clipStart; play(); setTimeout(pause, clipLength*1000)`，或監聽 `timeupdate`。iOS Safari 對 `currentTime` 設定需在 `loadedmetadata` 之後。
6. **防洩題**：`<audio>` 不顯示 metadata，但 `previewUrl` 檔名含 trackId 不含歌名；Network 面板看得到 `/api/apple/preview?trackId=` → 主持人頁本來就是主持人看的，不需防。
7. **PWA / 離線**：條款不允許快取音檔，`public/sw.js` 記得排除 `audio-ssl.itunes.apple.com`。
8. **Next.js 版本**：本專案是 Next 16，寫 route handler / `revalidate` 前先看 `node_modules/next/dist/docs/`（依 AGENTS.md）。

---

## 8. 實作階段與工時估計

| 階段 | 內容 | 估計 |
|---|---|---|
| P0 驗證 | 你在瀏覽器確認第 3 節 URL；決定「後台」走選項 B | 0.5 h |
| P1 資料層 | Prisma migration（`QuizSet` / `QuizItem`）、`/api/quiz*` CRUD、zod 驗證、測試 | 0.5 天 |
| P2 Apple 代理 | `/api/apple/search`、`/api/apple/preview`、快取與 rate limit、測試 | 0.5 天 |
| P3 編輯頁 | 搜尋 + 加入 + 排序 + clip 設定 + 對回 `Song` | 1 天 |
| P4 主持人頁 | 播放器（遮罩 / 進度條 / 重播 / 延長）、公佈答案卡、下一題、計分板 | 1 天 |
| P5 收尾 | Header 入口、個人頁「我的題組」、Apple 徽章與 courtesy 文字、SW 排除、e2e | 0.5 天 |

合計約 **3.5 個工作天**。可重用：`Header`、`buildThemeVars`、`shareCode` 模式、`AppError/handleError`、`rateLimit`、`BrandIcon`、`SongDetailModal`（公佈答案時直接開）。

---

## 9. 待你決定的事

1. **後台範圍**：選項 B（所有登入使用者可建題組）可以嗎？還是只想自己維護？
2. **音源**：先只做 Apple 試聽，還是一開始就允許每題切換 Apple / YouTube？
3. **要不要計分板**：KAMISABI 是搶卡計分，網頁計分板做不做？
4. **是否願意之後花 US$99/年走 MusicKit**，讓訂閱者聽完整曲（真前奏）？這會影響現在要不要多留欄位（目前草案已預留 `appleTrackId`，成本為零）。

---

## 參考來源

- Lantis「KAMISABIとは」 <https://lantis.jp/topics/news/5907/>（環境內無法直讀）
- アイマス官網 KAMISABI 發售公告 <https://idolmaster-official.jp/news/01_17694>
- Lantis「KAMISABI」始動 <https://lantis.jp/topics/news/5914/>、在庫販売 <https://lantis.jp/topics/news/6056/>
- ASOBI STORE 商品頁（SideM アルバムセット）<https://shop.asobistore.jp/products/detail/235400-00-00-00>
- iTunes Search API 官方文件 <https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html>
- Apple Services Performance Partners – Search API 條款 <https://performance-partners.apple.com/search-api>
- Apple Developer Forums：MusicKit previews / previewOnly <https://developer.apple.com/forums/thread/709713>、<https://developer.apple.com/forums/thread/685311>、<https://developer.apple.com/forums/thread/683958>
- Spotify preview_url 停止提供 <https://community.spotify.com/t5/Spotify-for-Developers/Kind-request-regarding-the-Spotify-Web-API-preview-url/td-p/6909407>、<https://developers.brizm.dev/blog/spotify-api-changes-2026/>
- Apple Music embed 行為 <https://discussions.apple.com/thread/251052819>

---

# Part B：線上房間模式（Supabase）

## 10. 目前已定案的事項（2026-09-23）

| 項目 | 決定 |
|---|---|
| 模式名稱 / 路徑 | **KAMISABI**，單機出題機 `/kamisabi`，線上房間 `/kamisabi/room/[code]` |
| 主視覺 | 官方海報中央的 KAMISABI 卡片 logo，已去背成透明 webp（放 `public/kamisabi-logo.webp`），放在黑色面板上 |
| 音源 | Apple Music 30 秒試聽，**固定播整段 30 秒**，不提供秒數選項 |
| 曲目資料 | 只補歌牌收錄的歌，由站長手動貼 Apple Music 連結到 `scripts/seed-apple-ids.ts` |
| 主資料庫 | Neon（Prisma），維持不動 |
| 房間資料庫 | **另建 Supabase 專案**（Tokyo），用 Realtime 推送房間狀態；三個環境變數已填好 |
| 線上要做的玩法 | ①イントロクイズ×かるた（兩個模式）、③リリースタイムライン |
| 線上不做的玩法 | ②あなたの○○ベスト5（靠口頭討論）、④フレーズパズル（需歌詞全文） |
| 語音 | 不做多人語音；かるたモード的歌詞朗讀用 **Google Cloud TTS** 預先產檔（見 §14） |
| 虛擬歌牌外觀 | 仿實體卡：淡彩全像底、專輯封面、曲名、品牌名、分隔線、⏮ ▶ ⏭ 純裝飾圖示（見 §14.5） |
| 模擬頁 | 單機出題機 <https://claude.ai/artifact/SeVQgsHJqBQVRnpaB2RaTG>；房間模式 <https://claude.ai/artifact/JDgqDqF2nxBDDvixW4DmeX> |

## 11. 官方規則（規則書全文節錄，線上版以此為準）

### ①イントロクイズ×かるた
- 用意：取り札 50 枚；イントロモード另需音樂播放器。人數 3 人以上（イントロモードは 2 人以上）。
- **かるたモード**：1. 読み手 1 人と取り手 2 人以上に分かれる。2. 50 枚を表向きで並べる。3. 読み手が歌詞を読み、取り手は該当する楽曲の札を取る。4. 50 枚すべて取り終わったらポイント集計、最多が勝利。
- ＊アルバムカード 1 枚 1 ポイント、シングルカード 2 ポイント。＊**お手つき：自分が取った札から 1 枚選んで捨てる**（そのカードのポイントは得られない）。
- **イントロモード**：取り札と同じ楽曲のプレイリストを用意し、読み手が歌詞を読むかわりにシャッフル再生。読み手なしでも可（取り手の 1 人が画面を見ずに操作）。

### ③リリースタイムライン（2〜8 人）
1. 山札をシャッフルし、各 5 枚を手札に。**プレイ中は手札の裏面（リリース日）を見てはいけない**。
2. 山札の 1 番上を裏向きで「初期札」として置く（＝初期札の日付は見える）。
3. スタートプレイヤーを決める。
4. 手札から 1 枚を選び、初期札より古いと思ったら左、新しいと思ったら右に表向きで置く。
5. 裏返して確認。合っていればそのまま。**間違っていたら手札に戻し、ペナルティとして山札から 1 枚引く**（山札 0 なら引かない）。
6. 時計回りで次へ。以後は右・左・中間に置ける。
7. **最初に手札のなくなったプレイヤーが勝利**。

（②ベスト 5、④フレーズパズルは線上化しないため省略。）

## 12. 架構

```
瀏覽器 ──(1) POST /api/kamisabi/room/...──▶ Next.js API route (Vercel)
   ▲                                        │ 驗證規則、寫入
   │ (3) Realtime postgres_changes           ▼
   └────────────────────────────── Supabase Postgres (rooms / room_players / room_secrets)
                                            ▲
              Neon (Song.appleTrackId, releaseDate) ──(0) 開房時快照 50 首──┘
```

- **(0)** 開房時從 Neon 讀該品牌所有 `appleTrackId` 非空的歌（曲名、封面用的 trackId、`releaseDate`、是否 2 分），寫進 `rooms.songs` JSON。之後整場遊戲不再碰 Neon，兩個資料庫不需互查。
- **(1)** 所有會改變狀態的動作（開房、加入、開始、出下一張、點牌、放牌）都走 API route，用 **service role key** 寫 Supabase，並在伺服器端驗證規則。
- **(3)** 瀏覽器用 **publishable / anon key** 只做「讀 + 訂閱」。`rooms` 一列更新，房內所有人幾百毫秒內收到。
- 試聽音檔仍由各瀏覽器直接向 Apple CDN 串流；伺服器只發「開始時間」。

## 13. Supabase 資料表與權限

```sql
create table rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,              -- 5 碼房間代碼
  mode        text not null,                     -- intro | karuta | timeline
  status      text not null default 'lobby',     -- lobby | playing | finished
  brand       text not null,                     -- music_ml | music_sidem | music_shiny
  songs       jsonb not null,                    -- 開房快照：[{id,title,trackId,releaseDate,points}]
  state       jsonb not null default '{}',       -- 公開狀態（見下）
  version     int  not null default 0,           -- 樂觀鎖
  updated_at  timestamptz default now()
);

create table room_players (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid references rooms(id) on delete cascade,
  name      text not null,
  seat      int  not null,
  is_host   boolean not null default false,
  joined_at timestamptz default now(),
  unique (room_id, seat)
);

-- 只有 service role 能讀：玩家 token、房主 token、時間軸模式的手牌
create table room_secrets (
  room_id    uuid references rooms(id) on delete cascade,
  player_id  uuid references room_players(id) on delete cascade,
  token      text not null,
  hand       jsonb not null default '[]',
  primary key (room_id, player_id)
);

alter table rooms         enable row level security;
alter table room_players  enable row level security;
alter table room_secrets  enable row level security;
create policy "anon read rooms"   on rooms        for select using (true);
create policy "anon read players" on room_players for select using (true);
-- room_secrets 不開任何 policy；anon 完全讀不到
-- 不開任何 insert/update/delete 給 anon，寫入一律經過 API route

alter publication supabase_realtime add table rooms, room_players;
```

`rooms.state` 內容（公開，所有人可讀）：

| 模式 | 欄位 |
|---|---|
| intro / karuta | `round`（第幾張）、`currentSongId`（開始前為 null；かるた也不放歌詞）、`startsAt`（ISO 時間）、`taken: {songId: playerId}`、`scores: {playerId: points}`、`lastResult` |
| timeline | `turnSeat`、`deckCount`、`line: [songId...]`（已翻開，含日期）、`handCounts: {playerId: n}`、`lastResult` |

手牌內容（曲目 id）只在 `room_secrets.hand`，API 只回給該玩家本人。

**專案設定**：Enable Data API ✔、Automatically expose new tables ✔、Enable automatic RLS ✔（與上面 SQL 相容）。

**環境變數**（本機 `.env` 與 Vercel）：

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co     # 不含 /rest/v1/
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...                # 瀏覽器：讀 + 訂閱
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...                          # 只在 API route 使用，不加 NEXT_PUBLIC_
```

## 14. 玩法對應的伺服器邏輯

### 玩家身分
- 不需註冊。加入時 API 產生 `token` 存 `room_secrets`，回給瀏覽器存 `localStorage`；之後每個動作都帶 token。房主是第一位加入者。

### イントロ / かるた（共用一套搶牌邏輯）
1. 所有人按「準備完成」（解除 iOS 自動播放限制並 `POST /ready`）→ 全員到齊後房主按「遊戲開始」（`POST /next`）→ API 隨機挑一張未被取走的卡，寫 `currentSongId`、`startsAt = now + 3s`。之後**沒有「下一張」按鈕**：有人取得後 5 秒、沒人答對 35 秒，玩家的瀏覽器自動 `POST /next {round}`，伺服器自己驗證時間（房主優先、其他人晚 2 秒當備援）。
2. 各瀏覽器收到後預載試聽（イントロ）或朗讀檔（かるた），到 `startsAt` 同時播放。
3. 玩家點卡 → `POST /claim {songId}`。伺服器：
   - 若 `songId === currentSongId` 且尚未有人取得 → `update rooms set state=..., version=version+1 where id=? and version=?`；**第一個成功的 UPDATE 即得卡**（樂觀鎖保證同回合只有一人）。
   - 若點錯 → **お手つき**：依規則從該玩家已取得的牌中丟一張。實作：API 回 `{otetsuki: true, cards: [...]}`，前端跳選單讓玩家自選；沒有牌則無事。被丟的卡 `taken` 移除、回到場上。
4. 30 秒內無人取得 → 該卡留在場上，稍後重出。
5. 全部取完 → 計分（アルバム 1 分；房主可在開房時標記哪些曲是シングル 2 分）→ `status = finished`。

### リリースタイムライン
1. 開始：洗牌，每人 5 張寫入 `room_secrets.hand`，山札頂一張為初期札寫入 `line`，`deckCount` 更新。
2. 輪到的人 `POST /place {songId, slot}`。伺服器驗證：`line[slot-1].date <= song.date <= line[slot].date`（同日視為皆可）。
   - 正確：從手牌移除、插入 `line`（前端翻出日期）。
   - 錯誤：卡留在手牌，**山札 > 0 時罰抽一張**進手牌；前端顯示該卡日期作為提示（規則書上「翻面確認」本來就會看到）。
3. 順位輪到下一位；某人手牌歸零 → 勝利、`status = finished`。

### かるたモード的朗讀（TTS，不做語音聊天）
- 每套 50 首的副歌歌詞由站長照卡片輸入（不顯示在畫面上），用免費層 TTS **一次產出 50 個 mp3** 放 Supabase Storage（私有 bucket，用簽名網址）或 `public/` 不可猜路徑。
- **採用 Google Cloud TTS**：語音用 `ja-JP-Neural2-B`（女聲）或 `ja-JP-Neural2-C`（男聲），Neural2 每月免費 100 萬字元，50 首約 2,000 字元，用不到 1%。
  - 產檔腳本 `scripts/gen-karuta-tts.ts`：讀 `scripts/karuta-lyrics.ts` 的對照表 `{ "曲名": "副歌歌詞…" }`，呼叫 `texttospeech.googleapis.com/v1/text:synthesize`（`audioEncoding: MP3`，`speakingRate: 0.95`），輸出 `kamisabi/tts/<songId>.mp3`。
  - 需要 GCP 專案啟用 Cloud Text-to-Speech API，並建立服務帳戶金鑰放 `GOOGLE_APPLICATION_CREDENTIALS`（只在本機跑腳本，不放 Vercel）。
  - 歌詞用 SSML 的 `<break time="600ms"/>` 分行，讓朗讀有かるた的節奏。
- 備援：沒有產檔的歌退回瀏覽器 Web Speech API（`speechSynthesis`，日文語音由裝置提供）。
- 著作權提醒：歌詞文字與朗讀檔都是歌詞重製。只存卡片上的副歌片段、不顯示文字、音檔不公開列出，把曝光壓到最低。

### 14.5 虛擬歌牌外觀（仿實體卡）

實體卡正面：淡彩全像（粉、藍、紫、薄荷）底、圓角；上方正方形專輯封面；曲名（粗體）；品牌名（小字，例：アイドルマスター ミリオンライブ！）；一條細分隔線；底部 ⏮ ▶ ⏭ 三個黑色圖示。線上版照此做成一個 `<KamisabiCard>` 元件：

- 比例 63:88，封面用 Apple `artworkUrl`（600×600），圖示為純 SVG 裝飾、不可點。
- 品牌名依 `Song.brand` 對照：ML → アイドルマスター ミリオンライブ！、SideM → アイドルマスター SideM、SC → アイドルマスター シャイニーカラーズ。
- 狀態樣式：被取走 → 灰化並蓋上取得者名牌；點錯 → 紅框抖動；得卡 → 綠框；シングル 2 分 → 右上角 ★2pt 標籤；時間軸上翻開後在卡下方顯示發行日標籤。
- 單機出題機的「公佈答案」也改用同一元件顯示。

## 15. API 一覽

| Method | Path | 說明 |
|---|---|---|
| POST | `/api/kamisabi/room` | 開房：`{name, brand}` → 快照 Neon 曲目、建 rooms / room_players / room_secrets，回 `{code, playerId, token}` |
| POST | `/api/kamisabi/room/[code]/join` | 加入：`{name}` → 回 `{playerId, token}` |
| POST | `/api/kamisabi/room/[code]/start` | 房主：`{mode}` → 依模式初始化 state |
| POST | `/api/kamisabi/room/[code]/ready` | 玩家：按「準備完成」（intro / karuta） |
| POST | `/api/kamisabi/room/[code]/next` | 第一張：房主「遊戲開始」（需全員 ready）；之後任何玩家到時間自動觸發，`{round}` 防重複（intro / karuta） |
| POST | `/api/kamisabi/room/[code]/claim` | 玩家：`{songId}` 搶牌；回正確 / お手つき |
| POST | `/api/kamisabi/room/[code]/discard` | 玩家：お手つき後選擇丟哪張 |
| POST | `/api/kamisabi/room/[code]/place` | 玩家：`{songId, slot}` 放進時間軸 |
| GET | `/api/kamisabi/room/[code]/hand` | 玩家：取自己的手牌（需 token） |
| GET | `/api/apple/preview?trackId=` | 既有：試聽網址（單機與房間共用） |

所有 POST 都帶 `Authorization: Bearer <token>`，伺服器以 `room_secrets` 驗證身分與房主權限。

## 16. 維運

- **免費方案閒置 7 天會暫停專案**：加 Vercel Cron 每 3 天打一次 `/api/kamisabi/ping`（對 Supabase 做 `select 1`），或開房失敗時提示「資料庫喚醒中，請一分鐘後再試」。
- Realtime 免費額度：200 同時連線、每月 200 萬則訊息；一場 8 人遊戲用不到 1%。
- 房間 24 小時後由 Cron 清除（`delete from rooms where updated_at < now() - interval '1 day'`）。

## 17. 工時（線上房間模式）

| 項目 | 估計 |
|---|---|
| Supabase client、資料表、環境變數、ping cron | 0.5 天 |
| 開房 / 加入 / 大廳 / Realtime 訂閱 | 1 天 |
| イントロ / かるた搶牌（含お手つき、同步播放、計分） | 1.5 天 |
| リリースタイムライン | 1.5 天 |
| かるた TTS 產檔腳本 + Web Speech 備援 | 0.5 天 |
| 測試、手機版面、收尾 | 1 天 |

合計約 **6 個工作天**，建議在單機出題機（§3.5，約 2 天）上線後進行。

---

## 18. 單機出題機實作紀錄（已完成）

| 檔案 | 說明 |
|---|---|
| `prisma/schema.prisma`、`prisma/migrations/20260923000000_add_apple_track_id/` | `Song.appleTrackId String?`（null = 未處理，'' = 確認沒有） |
| `scripts/seed-apple-ids.ts`（`npm run seed:apple-ids`） | 手動對照表：key 為曲名或 slug，value 貼 Apple Music 連結、純數字 ID 或 `''` |
| `lib/apple.ts` | `parseAppleTrackId`（抓 `?i=`）、`buildItunesLookupUrl`、`pickApplePreview`（封面放大到 600×600） |
| `lib/kamisabi.ts` | 品牌 → 實體卡上的官方日文全名 |
| `app/api/apple/preview/route.ts` | `GET ?trackId=`：iTunes lookup，Next fetch cache 6 小時，每 IP 60 次 / 10 秒補 6 次 |
| `app/api/songs/kamisabi/route.ts` | 題庫：`appleTrackId` 非空的歌（快取 1 小時） |
| `app/kamisabi/page.tsx` | 頁面，沿用 `GuessWrapper` |
| `components/kamisabi/KamisabiClient.tsx` | 設定（品牌、隨機）→ 出題 → 公佈答案 → 下一題 → 出題完畢 |
| `components/kamisabi/useKamisabi.ts` | 狀態；預先載入下一題試聽；試聽失敗可重試 / 跳題 |
| `components/kamisabi/PreviewPlayer.tsx` | 遮住歌名的 30 秒播放器：播放 / 停止 / 繼續 / 重播 |
| `components/kamisabi/KamisabiCard.tsx` + `globals.css .kamisabi-card` | 仿實體歌牌元件（房間模式可直接重用） |
| `public/kamisabi-logo.webp` | 去背後的官方 logo |
| `components/Header.tsx` | 入口「🎤 KAMISABI」 |
| `tests/apple.unit.test.ts`、`tests/KamisabiClient.test.tsx` | 單元與 UI 測試 |

上線步驟：
1. 部署後 `prisma migrate deploy` 會套用新欄位（build script 已含）。
2. 在 `scripts/seed-apple-ids.ts` 填歌牌收錄曲的 Apple Music 連結，`npm run seed:apple-ids`。
3. 開 `/kamisabi`，選品牌、開始出題。

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
| `docs/superpowers/plans/2026-09-23-kamisabi-room-mode.md` | 實作計畫（含每個 Task 的測試） |

與 §13–§15 的差異：
- `rooms.mode` 改為可為 null（開始時才選玩法）；多一支 `POST /end`（房主提前結束）與 `GET /lyrics`（Web Speech 備援只回當前題）。
- 時間軸的山札不另外存：山札 = 有發行日的歌 − 時間軸 − 所有手牌，抽牌時隨機。
- お手つき後未丟牌前不能再搶；全部取完且沒有待丟才結束。
- 沒有 session 而房間已開始 → 觀戰模式（只能看，不能加入）。
- （2026-09-24）搶牌模式全自動換題：`IntroState` 多 `ready[]`、`resolvedAt`；`POST /ready` 記錄準備；`/next` 第一張限房主且需全員 ready，之後任何玩家到 `nextCardDueAt`（取得後 `AUTO_NEXT_DELAY_MS` 5 秒 / 沒人答對 `ROUND_TIMEOUT_MS` 35 秒）即可觸發，帶 `round` 不會跳張。大廳按鈕改名「進入遊戲」，遊戲畫面全員 ready 後房主才看到「遊戲開始」。

上線步驟：
1. Supabase Dashboard → SQL editor 執行 `supabase/schema.sql`。
2. Vercel 與本機 `.env` 設 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`（可選 `CRON_SECRET`）。
3. `scripts/seed-apple-ids.ts` 補歌牌收錄曲的 Apple Music 連結 → `npm run seed:apple-ids`；時間軸模式另需 `releaseDate`（`npm run seed:dates`）。
4. かるた：`scripts/karuta-lyrics.ts` 填副歌片段 → `GOOGLE_TTS_API_KEY=… npm run gen:karuta-tts` → commit `public/kamisabi/tts/*.mp3`。
5. 開 `/kamisabi` → 線上房間 → 開房。
