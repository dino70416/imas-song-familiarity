import { PrismaClient } from '@prisma/client';
import { parseAppleTrackId } from '../lib/apple';

const prisma = new PrismaClient();

/**
 * 歌曲 Apple Music 曲目 ID 對照表（KAMISABI 出題機用）
 *
 * 只補「歌牌（KAMISABI 等）有收錄」的歌。格式同 seed-youtube-ids.ts：
 *   key   = 曲名（與 DB 的 Song.title 完全相同）
 *           也可以用 slug（例如 "ml/12087"）避免同名歌曲撞到
 *   value = Apple Music 分享連結 或 純數字 trackId 或 ''（確認 Apple Music 沒有這首）
 *
 * Apple Music 連結範例：
 *   https://music.apple.com/jp/album/ready-m-ster-version/1659357818?i=1659358253
 *   → 路徑上的 1659357818 是專輯 ID，?i= 後面的 1659358253 才是曲目 ID（script 會自動取 i=）
 *
 * 同一首歌通常會出現在多張專輯（單曲 / BEST 盤），挑哪個版本都可以，
 * 但請優先挑 Apple Music 上「可串流」的那張（能在 App 內完整播放的即是）。
 */
const appleTrackIdMap: Record<string, string> = {
  // "READY!!": "https://music.apple.com/jp/album/ready-m-ster-version/1659357818?i=1659358253",
};

async function main() {
  console.log('--- 開始更新歌曲 Apple Music 曲目 ID ---');
  let updateCount = 0;

  const entries = Object.entries(appleTrackIdMap);
  console.log(`對照表共 ${entries.length} 筆，開始寫入資料庫...\n`);

  for (const [key, raw] of entries) {
    const value = raw.trim();
    // '' = 明確標記「Apple Music 沒有」；否則要能解析出 trackId
    const appleTrackId = value === '' ? '' : parseAppleTrackId(value);

    if (appleTrackId === null) {
      console.warn(`[跳過] 「${key}」 的值無法解析成 Apple 曲目 ID：${raw}`);
      continue;
    }

    const where = key.includes('/') ? { slug: key } : { title: key };

    try {
      const result = await prisma.song.updateMany({ where, data: { appleTrackId } });

      if (result.count > 0) {
        console.log(`[更新成功] 「${key}」 -> appleTrackId: ${appleTrackId || '(無)'} (${result.count} 首)`);
        updateCount += result.count;
      } else {
        console.warn(`[找不到歌曲] 資料庫中找不到 「${key}」。`);
      }
    } catch (error: unknown) {
      console.error(`[更新失敗] 「${key}」 寫入錯誤: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n--- Apple Music 曲目 ID 更新完畢！共更新了 ${updateCount} 筆記錄 ---`);
}

main()
  .catch((e) => {
    console.error('執行 Seed 腳本時發生錯誤:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
