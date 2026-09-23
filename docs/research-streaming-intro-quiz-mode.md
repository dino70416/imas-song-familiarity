# 研究：「串流試聽 × 實體卡牌」猜歌模式可行性評估

> **狀態：研究 / 提案（尚未實作）** — 最新決定見 §3.5 簡化版設計 v2
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
- **MVP**：主持人頁 `/intro-quiz` 沿用現有品牌 / 偶像 / 組合 / 熟悉度篩選器選歌（只列 `appleTrackId` 非空者），按「開始」即可；順序亂數或依原順序。
- **v2（若要存清單）**：再加第 4 節的 `QuizSet`，但 `QuizItem` 只剩 `songId` + `order`（Apple 資料都在 `Song`）。

### 播放流程

1. 主持人頁載入題目清單（只有 `songId`，**不含曲名**）。
2. 每題：`GET /api/apple/preview?trackId=` → server 打 `itunes.apple.com/lookup`（`revalidate` 6 小時）→ 回 `previewUrl` + 封面 + `trackViewUrl`。
3. `<audio>` 播放，UI 只顯示進度條；主持人可設「一次播 5 / 10 / 30 秒」、重播。
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
