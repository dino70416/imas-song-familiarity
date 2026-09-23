import { AppError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { buildItunesLookupUrl, pickArtworkMap, type ItunesTrack } from '@/lib/apple';
import type { RoomSong } from './types';

const LOOKUP_CHUNK = 100;
const LOOKUP_REVALIDATE_SECONDS = 6 * 60 * 60;

/** 一次抓多個 trackId 的封面；任何失敗都只回空 map，不阻擋開房 */
export async function fetchArtworkMap(trackIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < trackIds.length; i += LOOKUP_CHUNK) {
    const chunk = trackIds.slice(i, i + LOOKUP_CHUNK);
    try {
      const res = await fetch(buildItunesLookupUrl(chunk), {
        next: { revalidate: LOOKUP_REVALIDATE_SECONDS },
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { results?: ItunesTrack[] };
      for (const [k, v] of pickArtworkMap(data.results ?? [])) map.set(k, v);
    } catch (err) {
      console.error('[kamisabi room] artwork lookup failed', err);
    }
  }
  return map;
}

/**
 * 開房快照：該品牌所有有 Apple 曲目 ID 的歌（歌牌收錄曲）。
 * 之後整場遊戲只讀 rooms.songs，不再碰 Neon。
 */
export async function buildRoomSongs(brand: string, singleIds: string[]): Promise<RoomSong[]> {
  const rows = await prisma.song.findMany({
    where: { brand, appleTrackId: { not: null }, NOT: { appleTrackId: '' } },
    select: { id: true, title: true, brand: true, appleTrackId: true, releaseDate: true },
    orderBy: { title: 'asc' },
  });
  if (rows.length < 2) {
    throw new AppError('這個品牌可出題的歌不足 2 首（需先補 Apple Music 曲目 ID）。', 400, 'NOT_ENOUGH_SONGS');
  }
  const artwork = await fetchArtworkMap(rows.map((r) => r.appleTrackId as string));
  const singles = new Set(singleIds);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    brand: r.brand,
    trackId: r.appleTrackId as string,
    artworkUrl: artwork.get(r.appleTrackId as string) ?? null,
    releaseDate: r.releaseDate ?? null,
    points: singles.has(r.id) ? 2 : 1,
  }));
}
