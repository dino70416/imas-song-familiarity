/**
 * Apple Music / iTunes 相關的純函式（不依賴 Next / Prisma，script 與 app 共用）
 */

/** iTunes Search API 的 country 參數：Lantis 曲目都在日本商店 */
export const ITUNES_COUNTRY = 'jp';

/**
 * 從各種輸入解析出 Apple 曲目 ID：
 *   - 純數字："1659358253"
 *   - Apple Music 分享連結："https://music.apple.com/jp/album/ready-m-ster-version/1659357818?i=1659358253&uo=4"
 *     → 取 query 的 i= 參數（專輯 ID 在路徑上，曲目 ID 在 i=）
 *   - 舊 iTunes 連結："https://itunes.apple.com/jp/album/id1659357818?i=1659358253"
 * 解析不到回傳 null。
 */
export function parseAppleTrackId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^\d{1,20}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/[?&]i=(\d{1,20})(?:[&#]|$)/);
  if (match) return match[1];

  return null;
}

/** 合法的 trackId 才會被拿去打 iTunes lookup */
export function isValidAppleTrackId(value: string): boolean {
  return /^\d{1,20}$/.test(value);
}

export function buildItunesLookupUrl(trackId: string): string {
  const params = new URLSearchParams({
    id: trackId,
    country: ITUNES_COUNTRY,
    entity: 'song',
  });
  return `https://itunes.apple.com/lookup?${params.toString()}`;
}

/** iTunes lookup / search 回傳的單筆曲目（只列我們會用到的欄位） */
export interface ItunesTrack {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  trackViewUrl?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  isStreamable?: boolean;
}

/** 回給前端的試聽資訊 */
export interface ApplePreview {
  trackId: string;
  previewUrl: string;
  artworkUrl: string | null;
  trackViewUrl: string | null;
  trackName: string | null;
  artistName: string | null;
  collectionName: string | null;
}

/**
 * 從 lookup 結果挑出對應 trackId 的曲目並整理成 ApplePreview。
 * 沒有 previewUrl（少數曲目 Apple 不提供試聽）視為找不到。
 */
export function pickApplePreview(results: ItunesTrack[], trackId: string): ApplePreview | null {
  const track = results.find(
    (r) => (r.wrapperType === 'track' || r.kind === 'song') && String(r.trackId) === trackId,
  );
  if (!track || !track.previewUrl) return null;

  return {
    trackId,
    previewUrl: track.previewUrl,
    // artworkUrl100 的路徑尾巴是 "100x100bb.jpg"，換成 600x600 可拿高解析封面
    artworkUrl: track.artworkUrl100 ? track.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null,
    trackViewUrl: track.trackViewUrl ?? null,
    trackName: track.trackName ?? null,
    artistName: track.artistName ?? null,
    collectionName: track.collectionName ?? null,
  };
}
