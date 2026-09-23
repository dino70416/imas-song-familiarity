import type { ApplePreview } from '@/lib/apple';

/** /api/songs/intro-quiz 回傳的題庫歌曲 */
export type IntroQuizSong = {
  id: string;
  title: string;
  brand: string;
  appleTrackId: string;
  members: { name: string }[];
  units: { name: string }[];
};

export type IntroQuizPhase = 'loading' | 'setup' | 'playing' | 'finished';

export type PreviewStatus = 'loading' | 'ready' | 'error';

export type { ApplePreview };

/** 一次播放的秒數選項；0 = 整段 30 秒試聽 */
export const CLIP_LENGTH_OPTIONS = [3, 5, 10, 15, 0] as const;
export type ClipLength = (typeof CLIP_LENGTH_OPTIONS)[number];
