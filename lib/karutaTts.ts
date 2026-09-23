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
