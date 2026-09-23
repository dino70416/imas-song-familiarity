import { beforeEach, describe, expect, test, vi } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { song: { findMany } } }));

import { buildRoomSongs } from '@/lib/kamisabiRoom/snapshot';

const rows = [
  { id: 's1', title: 'A', brand: 'music_ml', appleTrackId: '11', releaseDate: '2020-01-01' },
  { id: 's2', title: 'B', brand: 'music_ml', appleTrackId: '22', releaseDate: null },
];

beforeEach(() => {
  findMany.mockReset();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results: [{ wrapperType: 'track', trackId: 11, artworkUrl100: 'https://x/a/100x100bb.jpg' }] }),
  }) as unknown as typeof fetch;
});

describe('buildRoomSongs', () => {
  test('只查該品牌有 appleTrackId 的歌、帶封面、依 singleIds 標 2 分', async () => {
    findMany.mockResolvedValue(rows);
    const songs = await buildRoomSongs('music_ml', ['s2']);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ brand: 'music_ml' }) }));
    expect(songs).toEqual([
      { id: 's1', title: 'A', brand: 'music_ml', trackId: '11', artworkUrl: 'https://x/a/600x600bb.jpg', releaseDate: '2020-01-01', points: 1 },
      { id: 's2', title: 'B', brand: 'music_ml', trackId: '22', artworkUrl: null, releaseDate: null, points: 2 },
    ]);
    // 一次 lookup 就好
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('id=11%2C22');
  });

  test('少於 2 首 → 400 NOT_ENOUGH_SONGS', async () => {
    findMany.mockResolvedValue([rows[0]]);
    await expect(buildRoomSongs('music_ml', [])).rejects.toMatchObject({ statusCode: 400, code: 'NOT_ENOUGH_SONGS' });
  });

  test('iTunes 掛了照樣開房，封面 null', async () => {
    findMany.mockResolvedValue(rows);
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'));
    const songs = await buildRoomSongs('music_ml', []);
    expect(songs.every((s) => s.artworkUrl === null)).toBe(true);
  });
});
