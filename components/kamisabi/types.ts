import type { ApplePreview } from '@/lib/apple';

/** /api/songs/kamisabi 回傳的題庫歌曲 */
export type KamisabiSong = {
  id: string;
  title: string;
  brand: string;
  appleTrackId: string;
  members: { name: string }[];
  units: { name: string }[];
};

export type KamisabiPhase = 'loading' | 'setup' | 'playing' | 'finished';

export type PreviewStatus = 'loading' | 'ready' | 'error';

export type { ApplePreview };
