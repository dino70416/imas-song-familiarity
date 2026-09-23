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
