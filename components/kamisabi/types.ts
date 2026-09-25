import type { ApplePreview } from '@/lib/apple';

/** /api/songs/kamisabi 回傳的題庫歌曲 */
export type KamisabiSong = {
  id: string;
  title: string;
  brand: string;
  appleTrackId: string;
  /** 有かるた朗讀檔（public/kamisabi/tts/<id>.mp3） */
  hasLyrics: boolean;
  members: { name: string }[];
  units: { name: string }[];
};

export type KamisabiPhase = 'loading' | 'setup' | 'playing' | 'finished';

/** 單機出題方式：イントロ（Apple 30 秒試聽）／かるた（歌詞朗讀檔） */
export type KamisabiSoloMode = 'intro' | 'karuta';

export type PreviewStatus = 'loading' | 'ready' | 'error';

export type { ApplePreview };
