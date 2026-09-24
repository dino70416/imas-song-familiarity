/**
 * かるたモード朗讀（Google Cloud TTS 離線產檔）相關的純函式。
 * 歌詞文字只存在 scripts/karuta-lyrics.ts，畫面上不顯示。
 */
export const KARUTA_TTS_VOICE = 'ja-JP-Neural2-C'; // 男聲；女聲用 ja-JP-Neural2-B
export const KARUTA_TTS_RATE = 0.9;
export const KARUTA_TTS_BREAK = '600ms';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 読み札的振假名：漢字（或 ∞）後面接「｛よみ｝」→ SSML <sub alias="よみ">漢字</sub> */
const RUBY = /([一-鿿々〆ヶ∞]+)｛([^｝]+)｝/g;

function toSsmlLine(line: string): string {
  // 先跳脫再套 <sub>；讀音只會是假名，不含需要跳脫的字元
  return escapeXml(line).replace(RUBY, (_m, base: string, yomi: string) => `<sub alias="${yomi}">${base}</sub>`);
}

/** 每行之間加停頓，讓朗讀有かるた「読み手」的節奏 */
export function buildKarutaSsml(lyrics: string): string {
  const lines = lyrics
    .split(/\r?\n|／/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(toSsmlLine);
  return `<speak>${lines.join(`<break time="${KARUTA_TTS_BREAK}"/>`)}</speak>`;
}

/** 朗讀檔放 public/kamisabi/tts/<songId>.mp3（songId 是 uuid，不列目錄就猜不到） */
export function ttsFileUrl(songId: string): string {
  return `/kamisabi/tts/${songId}.mp3`;
}
