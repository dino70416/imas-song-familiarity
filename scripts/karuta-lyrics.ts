/**
 * かるたモード用：曲名 → 卡片上印的副歌片段（站長照實體「読み札」輸入）。
 * - key 用資料庫的 Song.title（與 scripts/seed-apple-ids.ts 同一份曲名）
 * - 分行用 \n 或「／」，產檔時每行之間會停 600ms
 * - 只放卡片上的片段，不放全曲歌詞；這個檔案不會被前端 bundle（只有 API route 與腳本 import）
 *
 * 範例：
 *   'READY!!': 'ラララ\nルルル',
 *
 * 下面先列出目前有 Apple ID（會出現在房間）的歌，把引號裡填上讀み札的片段即可；
 * 空字串代表還沒填，產檔腳本會跳過、前端會顯示「還沒有朗讀檔」。
 */
export const KARUTA_LYRICS: Record<string, string> = {
  'Raise the FLAG': '',
  'アライブファクター': '',
  'ハルカナミライ': '',
  '深層マーメイド': '',
};
