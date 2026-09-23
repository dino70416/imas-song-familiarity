import { describe, expect, test } from 'vitest';
import { parseAppleTrackId, isValidAppleTrackId, buildItunesLookupUrl, pickApplePreview, ItunesTrack } from '../lib/apple';

describe('parseAppleTrackId', () => {
  test('純數字直接回傳', () => {
    expect(parseAppleTrackId('1659358253')).toBe('1659358253');
    expect(parseAppleTrackId('  1659358253 ')).toBe('1659358253');
  });

  test('Apple Music 分享連結取 ?i= 的曲目 ID（不是路徑上的專輯 ID）', () => {
    expect(
      parseAppleTrackId('https://music.apple.com/jp/album/ready-m-ster-version/1659357818?i=1659358253&uo=4'),
    ).toBe('1659358253');
    expect(parseAppleTrackId('https://music.apple.com/jp/album/fighting-my-way/1744084121?i=1744084126')).toBe('1744084126');
  });

  test('舊 iTunes 連結也能解析', () => {
    expect(parseAppleTrackId('https://itunes.apple.com/jp/album/id558731418?i=558731424')).toBe('558731424');
  });

  test('只有專輯連結（沒有 i=）或亂七八糟的輸入回 null', () => {
    expect(parseAppleTrackId('https://music.apple.com/jp/album/ready-m-ster-version/1659357818')).toBeNull();
    expect(parseAppleTrackId('abc')).toBeNull();
    expect(parseAppleTrackId('')).toBeNull();
    expect(parseAppleTrackId(null)).toBeNull();
  });
});

describe('isValidAppleTrackId / buildItunesLookupUrl', () => {
  test('只接受純數字', () => {
    expect(isValidAppleTrackId('123')).toBe(true);
    expect(isValidAppleTrackId('12a')).toBe(false);
    expect(isValidAppleTrackId('')).toBe(false);
  });

  test('lookup URL 用日本商店', () => {
    const url = new URL(buildItunesLookupUrl('1659358253'));
    expect(url.origin + url.pathname).toBe('https://itunes.apple.com/lookup');
    expect(url.searchParams.get('id')).toBe('1659358253');
    expect(url.searchParams.get('country')).toBe('jp');
  });
});

describe('pickApplePreview', () => {
  const results: ItunesTrack[] = [
    { wrapperType: 'collection', trackId: undefined, previewUrl: undefined },
    {
      wrapperType: 'track',
      kind: 'song',
      trackId: 1659358253,
      trackName: 'READY!! (M@STER VERSION)',
      artistName: '765PRO ALLSTARS',
      collectionName: 'GRE@TEST BEST!',
      trackViewUrl: 'https://music.apple.com/jp/album/x/1659357818?i=1659358253&uo=4',
      previewUrl: 'https://audio-ssl.itunes.apple.com/x/mzaf_1.plus.aac.p.m4a',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/a/COCX-38070.jpg/100x100bb.jpg',
      isStreamable: true,
    },
  ];

  test('挑出對應 trackId 的曲目並放大封面', () => {
    const preview = pickApplePreview(results, '1659358253');
    expect(preview).not.toBeNull();
    expect(preview!.previewUrl).toBe('https://audio-ssl.itunes.apple.com/x/mzaf_1.plus.aac.p.m4a');
    expect(preview!.artworkUrl).toBe('https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/a/COCX-38070.jpg/600x600bb.jpg');
    expect(preview!.trackName).toBe('READY!! (M@STER VERSION)');
    expect(preview!.artistName).toBe('765PRO ALLSTARS');
  });

  test('trackId 不符或沒有 previewUrl 回 null', () => {
    expect(pickApplePreview(results, '999')).toBeNull();
    expect(pickApplePreview([{ wrapperType: 'track', trackId: 1, previewUrl: undefined }], '1')).toBeNull();
  });
});
