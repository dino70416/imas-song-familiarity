import { expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import IntroQuizClient from '../components/intro-quiz/IntroQuizClient';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

const mockSongs = [
  { id: '1', title: 'Song A', brand: 'music_ml', appleTrackId: '111', members: [{ name: '春日未来' }], units: [] },
  { id: '2', title: 'Song B', brand: 'music_ml', appleTrackId: '222', members: [], units: [{ name: '765PRO ALLSTARS' }] },
];

const previews: Record<string, unknown> = {
  '111': { trackId: '111', previewUrl: 'https://example.com/a.m4a', artworkUrl: 'https://example.com/a.jpg', trackViewUrl: 'https://music.apple.com/jp/a', trackName: 'Song A', artistName: 'x', collectionName: 'y' },
  '222': { trackId: '222', previewUrl: 'https://example.com/b.m4a', artworkUrl: null, trackViewUrl: null, trackName: 'Song B', artistName: 'x', collectionName: 'y' },
};

beforeEach(() => {
  // 固定順序（shuffle 用 Math.random）
  vi.spyOn(Math, 'random').mockReturnValue(0);
  // jsdom 沒有實作 media playback
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

  global.fetch = vi.fn().mockImplementation((input: string) => {
    if (input === '/api/songs/intro-quiz') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSongs) });
    }
    const m = input.match(/trackId=(\d+)/);
    if (m && previews[m[1]]) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(previews[m[1]]) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'nf' }) });
  });
});

test('出題機流程：設定 → 播放（不露歌名）→ 公佈答案 → 下一題 → 出題完畢', async () => {
  render(<IntroQuizClient />);

  await waitFor(() => expect(screen.getByText('開始出題')).toBeDefined());
  expect(screen.getByText(/共有 2 首歌曲可出題/)).toBeDefined();

  fireEvent.click(screen.getByText('開始出題'));

  // 試聽載入完成 → 出現播放器，但畫面上不能出現任何曲名
  await waitFor(() => expect(screen.getByTestId('preview-audio')).toBeDefined());
  expect(screen.queryByText('Song A')).toBeNull();
  expect(screen.queryByText('Song B')).toBeNull();
  expect(screen.getByText(/第/)).toBeDefined();

  fireEvent.click(screen.getByText(/▶ 播放/));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

  fireEvent.click(screen.getByText('👀 公佈答案'));
  await waitFor(() => expect(screen.getByTestId('answer-card')).toBeDefined());
  expect(screen.getByText('Song A')).toBeDefined();
  expect(screen.getByText('春日未来')).toBeDefined();
  expect(screen.getByText(/在 Apple Music 聆聽/)).toBeDefined();

  fireEvent.click(screen.getByText('下一題'));
  await waitFor(() => expect(screen.getByTestId('preview-audio')).toBeDefined());
  expect(screen.queryByText('Song B')).toBeNull();

  fireEvent.click(screen.getByText('👀 公佈答案'));
  await waitFor(() => expect(screen.getByText('Song B')).toBeDefined());

  fireEvent.click(screen.getByText('結束出題'));
  await waitFor(() => expect(screen.getByText('出題完畢！')).toBeDefined());
});

test('試聽取不到時可以跳到下一題', async () => {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((input: string) => {
    if (input === '/api/songs/intro-quiz') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([mockSongs[0]]) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'nf' }) });
  });

  render(<IntroQuizClient />);
  await waitFor(() => expect(screen.getByText('開始出題')).toBeDefined());
  fireEvent.click(screen.getByText('開始出題'));

  await waitFor(() => expect(screen.getByText(/試聽暫時無法取得/)).toBeDefined());
  fireEvent.click(screen.getByText('結束'));
  await waitFor(() => expect(screen.getByText('出題完畢！')).toBeDefined());
});
