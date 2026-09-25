import { expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import KamisabiClient from '../components/kamisabi/KamisabiClient';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const mockSongs = [
  { id: '1', title: 'Song A', brand: 'music_ml', appleTrackId: '111', hasLyrics: true, members: [{ name: '春日未来' }], units: [] },
  { id: '2', title: 'Song B', brand: 'music_ml', appleTrackId: '222', hasLyrics: true, members: [], units: [{ name: '765PRO ALLSTARS' }] },
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

  global.fetch = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
    if (input === '/api/songs/kamisabi') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSongs) });
    }
    // かるた朗讀檔：HEAD 確認存在（兩首都有）
    if (init?.method === 'HEAD') {
      const ok = /^\/kamisabi\/tts\/[12]\.mp3$/.test(input);
      return Promise.resolve({ ok, status: ok ? 200 : 404 });
    }
    const m = input.match(/trackId=(\d+)/);
    if (m && previews[m[1]]) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(previews[m[1]]) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'nf' }) });
  });
});

test('KAMISABI 出題機流程：設定 → 播放（不露歌名）→ 公佈答案 → 下一題 → 出題完畢', async () => {
  render(<KamisabiClient />);

  await waitFor(() => expect(screen.getByText('開始出題')).toBeDefined());
  expect(screen.getByText(/共有 2 首歌曲可出題/)).toBeDefined();
  // 只顯示有歌的品牌：題庫只有 ML，其他品牌不出現
  expect(screen.getAllByText(/ミリオンライブ！/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/シンデレラガールズ/)).toBeNull();
  expect(screen.getAllByText('2 首').length).toBeGreaterThan(0);

  // 關掉隨機順序，讓題目依題庫順序（Song A → Song B）出現
  fireEvent.click(screen.getByLabelText('隨機出題順序'));
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
  expect(screen.getAllByText('Song A').length).toBeGreaterThan(0);
  expect(screen.getByText('春日未来')).toBeDefined();
  expect(screen.getByText(/在 Apple Music 聆聽/)).toBeDefined();

  fireEvent.click(screen.getByText('下一題'));
  await waitFor(() => expect(screen.getByTestId('preview-audio')).toBeDefined());
  expect(screen.queryByText('Song B')).toBeNull();

  fireEvent.click(screen.getByText('👀 公佈答案'));
  await waitFor(() => expect(screen.getAllByText('Song B').length).toBeGreaterThan(0));

  // 最後一題的「下一題」按鈕會變成「結束出題」（上方狀態列也有同名按鈕，取最後一個）
  const endButtons = screen.getAllByText('結束出題');
  fireEvent.click(endButtons[endButtons.length - 1]);
  await waitFor(() => expect(screen.getByText('出題完畢！')).toBeDefined());
});

test('お手つき：從已取得的牌選一張丟回 → 收回答案、續播、該歌重新排進待播清單', async () => {
  render(<KamisabiClient />);
  await waitFor(() => expect(screen.getByText('開始出題')).toBeDefined());
  fireEvent.click(screen.getByLabelText('隨機出題順序'));
  fireEvent.click(screen.getByText('開始出題'));
  await waitFor(() => expect(screen.getByTestId('preview-audio')).toBeDefined());

  // 第 1 題 Song A 有人取得 → 下一題
  fireEvent.click(screen.getByText('👀 公佈答案'));
  await waitFor(() => expect(screen.getByTestId('answer-card')).toBeDefined());
  fireEvent.click(screen.getByText('下一題'));
  await waitFor(() => expect(screen.getByText('2')).toBeDefined());
  expect(screen.queryByText('Song B')).toBeNull();

  // 第 2 題 Song B：有人搶牌 → 停掉音樂 → 公佈答案 → 搶錯了
  fireEvent.click(screen.getByText(/▶ 播放/));
  await waitFor(() => expect(screen.getByText('⏹ 停止')).toBeDefined());
  fireEvent.click(screen.getByText('⏹ 停止'));
  fireEvent.click(screen.getByText('👀 公佈答案'));
  await waitFor(() => expect(screen.getAllByText('Song B').length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole('button', { name: /お手つき/ }));

  // 只能丟已經取得（播過）的牌：清單裡只有 Song A
  const dialog = screen.getByRole('dialog');
  expect(dialog).toBeDefined();
  expect(screen.getByRole('button', { name: /Song A/ })).toBeDefined();
  expect(screen.queryByRole('button', { name: /Song B/ })).toBeNull();

  // 丟回 Song A → 答案收回、續播、仍在第 2 題但總題數變 3（Song A 之後會重播）
  (HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockClear();
  fireEvent.click(screen.getByRole('button', { name: /Song A/ }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByTestId('answer-card')).toBeNull();
  expect(screen.queryByText('Song B')).toBeNull();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(screen.getByText('👀 公佈答案')).toBeDefined();
  expect(screen.getByText('2')).toBeDefined();
  expect(screen.getByText(/\/ 3 題/)).toBeDefined();
  expect(screen.getByText(/お手つき ×1/).textContent).toContain('Song A');

  // 再公佈仍是 Song B；取得後下一題 → 第 3 題重播 Song A（曲名不能先露出）
  fireEvent.click(screen.getByText('👀 公佈答案'));
  await waitFor(() => expect(screen.getAllByText('Song B').length).toBeGreaterThan(0));
  fireEvent.click(screen.getByText('下一題'));
  await waitFor(() => expect(screen.getByText('3')).toBeDefined());
  expect(screen.queryByText(/お手つき ×/)).toBeNull();
  expect(screen.queryByText('Song A')).toBeNull();
  fireEvent.click(screen.getByText('👀 公佈答案'));
  await waitFor(() => expect(screen.getAllByText('Song A').length).toBeGreaterThan(0));

  const endButtons = screen.getAllByText('結束出題');
  fireEvent.click(endButtons[endButtons.length - 1]);
  await waitFor(() => expect(screen.getByText('出題完畢！')).toBeDefined());
  expect(screen.getByText(/共出了 3 題/)).toBeDefined();
});

test('お手つき：還沒有人取得牌時沒牌可丟，只續播；也可以取消回到答案', async () => {
  render(<KamisabiClient />);
  await waitFor(() => expect(screen.getByText('開始出題')).toBeDefined());
  fireEvent.click(screen.getByLabelText('隨機出題順序'));
  fireEvent.click(screen.getByText('開始出題'));
  await waitFor(() => expect(screen.getByTestId('preview-audio')).toBeDefined());
  fireEvent.click(screen.getByText('👀 公佈答案'));
  await waitFor(() => expect(screen.getByTestId('answer-card')).toBeDefined());

  // 取消 → 對話框關掉、答案還在
  fireEvent.click(screen.getByRole('button', { name: /お手つき/ }));
  expect(screen.getByRole('dialog')).toBeDefined();
  fireEvent.click(screen.getByText('取消'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByTestId('answer-card')).toBeDefined();

  // 沒牌可丟 → 只能續播；題數不變
  fireEvent.click(screen.getByRole('button', { name: /お手つき/ }));
  expect(screen.getByText(/沒有牌可丟/)).toBeDefined();
  (HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockClear();
  fireEvent.click(screen.getByText('▶ 繼續播放'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByTestId('answer-card')).toBeNull();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/お手つき ×1/)).toBeDefined();
  expect(screen.getByText(/\/ 2 題/)).toBeDefined();
});

test('かるた出題方式：播歌詞朗讀檔（/kamisabi/tts/<songId>.mp3）而不是試聽，公佈答案照常', async () => {
  render(<KamisabiClient />);
  await waitFor(() => expect(screen.getByText('開始出題')).toBeDefined());
  fireEvent.click(screen.getByLabelText(/かるた/));
  expect(screen.getByText(/共有 2 首/)).toBeDefined();
  fireEvent.click(screen.getByLabelText('隨機出題順序'));
  fireEvent.click(screen.getByText('開始出題'));

  const audio = (await screen.findByTestId('preview-audio')) as HTMLAudioElement;
  expect(audio.src).toContain('/kamisabi/tts/1.mp3');
  expect(global.fetch).toHaveBeenCalledWith('/kamisabi/tts/1.mp3', expect.objectContaining({ method: 'HEAD' }));
  expect(screen.queryByText('Song A')).toBeNull();

  fireEvent.click(screen.getByText(/▶ 播放/));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  fireEvent.click(screen.getByText('👀 公佈答案'));
  await waitFor(() => expect(screen.getByTestId('answer-card')).toBeDefined());
  expect(screen.getAllByText('Song A').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByText('下一題'));
  await waitFor(() => expect((screen.getByTestId('preview-audio') as HTMLAudioElement).src).toContain('/kamisabi/tts/2.mp3'));
});

test('かるた只算有朗讀檔的歌；朗讀檔取不到時可以跳過', async () => {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((input: string, init?: RequestInit) => {
    if (input === '/api/songs/kamisabi') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([mockSongs[0], { ...mockSongs[1], hasLyrics: false }]) });
    }
    if (init?.method === 'HEAD') return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'nf' }) });
  });

  render(<KamisabiClient />);
  await waitFor(() => expect(screen.getByText('開始出題')).toBeDefined());
  expect(screen.getByText(/共有 2 首/)).toBeDefined();
  fireEvent.click(screen.getByLabelText(/かるた/));
  expect(screen.getByText(/共有 1 首/)).toBeDefined();
  fireEvent.click(screen.getByText('開始出題'));

  await waitFor(() => expect(screen.getByText(/還沒有朗讀檔/)).toBeDefined());
  fireEvent.click(screen.getByText('結束'));
  await waitFor(() => expect(screen.getByText('出題完畢！')).toBeDefined());
});

test('線上房間區塊只給白名單帳號看（canHostRoom）；預設隱藏', async () => {
  const { unmount } = render(<KamisabiClient />);
  await waitFor(() => expect(screen.getAllByText('2 首').length).toBeGreaterThan(0));
  expect(screen.queryByText('🌐 線上房間')).toBeNull();
  unmount();

  render(<KamisabiClient canHostRoom />);
  await waitFor(() => expect(screen.getByText('🌐 線上房間')).toBeDefined());
});

test('試聽取不到時可以跳到下一題', async () => {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((input: string) => {
    if (input === '/api/songs/kamisabi') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([mockSongs[0]]) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'nf' }) });
  });

  render(<KamisabiClient />);
  await waitFor(() => expect(screen.getByText('開始出題')).toBeDefined());
  fireEvent.click(screen.getByText('開始出題'));

  await waitFor(() => expect(screen.getByText(/試聽暫時無法取得/)).toBeDefined());
  fireEvent.click(screen.getByText('結束'));
  await waitFor(() => expect(screen.getByText('出題完畢！')).toBeDefined());
});
