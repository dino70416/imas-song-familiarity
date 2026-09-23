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
 *   - 「分享歌曲」連結："https://music.apple.com/jp/song/raise-the-flag/1718726516"
 *     → 曲目 ID 在路徑最後一段
 *   - 舊 iTunes 連結："https://itunes.apple.com/jp/album/id1659357818?i=1659358253"
 * 解析不到回傳 null。
 */
export function parseAppleTrackId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^\d{1,20}$/.test(trimmed)) return trimmed;

  const query = trimmed.match(/[?&]i=(\d{1,20})(?:[&#]|$)/);
  if (query) return query[1];

  const songPath = trimmed.match(/\/song\/(?:[^/?#]+\/)?(\d{1,20})(?:[/?#]|$)/);
  if (songPath) return songPath[1];

  return null;
}

/** 合法的 trackId 才會被拿去打 iTunes lookup */
export function isValidAppleTrackId(value: string): boolean {
  return /^\d{1,20}$/.test(value);
}

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
    artworkUrl: track.artworkUrl100 ? toLargeArtwork(track.artworkUrl100) : null,
    trackViewUrl: track.trackViewUrl ?? null,
    trackName: track.trackName ?? null,
    artistName: track.artistName ?? null,
    collectionName: track.collectionName ?? null,
  };
}
