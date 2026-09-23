import { describe, expect, test } from 'vitest';
import { AppError } from '@/lib/errors';
import type { RoomSong } from '@/lib/kamisabiRoom/types';
import {
  applyClaim,
  applyDiscard,
  computeScores,
  createIntroState,
  generateRoomCode,
  isIntroFinished,
  ownedSongs,
  pickNextSong,
} from '@/lib/kamisabiRoom/logic';

const song = (id: string, points: 1 | 2 = 1, releaseDate: string | null = null): RoomSong => ({
  id, title: `Song ${id}`, brand: 'music_ml', trackId: `t${id}`, artworkUrl: null, releaseDate, points,
});
const SONGS = [song('a'), song('b', 2), song('c')];
const NOW = Date.parse('2026-09-23T12:00:00Z');

function codeOf(e: unknown) { return (e as AppError).code; }

describe('generateRoomCode', () => {
  test('5 碼、只用不易混淆的大寫字母與數字', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
  });
  test('random 固定時結果可預測', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAAA');
  });
});

describe('イントロ / かるた', () => {
  test('pickNextSong：從未取走的牌隨機挑一張，round+1，startsAt = now + 3s，避免立刻重出同一張', () => {
    let s = createIntroState();
    s = pickNextSong(s, SONGS, NOW, () => 0)!;
    expect(s.round).toBe(1);
    expect(s.currentSongId).toBe('a');
    expect(s.startsAt).toBe(new Date(NOW + 3000).toISOString());
    expect(s.resolved).toBe(false);
    // 沒人搶到、再出下一張：random=0 本來又會挑到 a，但要避開剛剛那張
    const s2 = pickNextSong(s, SONGS, NOW, () => 0)!;
    expect(s2.currentSongId).not.toBe('a');
    expect(s2.round).toBe(2);
  });

  test('pickNextSong：全部取走時回 null', () => {
    const s = { ...createIntroState(), taken: { a: 'p1', b: 'p1', c: 'p2' } };
    expect(pickNextSong(s, SONGS, NOW)).toBeNull();
  });

  test('applyClaim 正確：taken / scores / resolved / lastResult 都更新', () => {
    const s0 = pickNextSong(createIntroState(), SONGS, NOW, () => 0.5)!; // → b
    const { state, result } = applyClaim(s0, SONGS, 'p1', s0.currentSongId!);
    expect(result).toBe('correct');
    expect(state.taken[s0.currentSongId!]).toBe('p1');
    expect(state.resolved).toBe(true);
    expect(state.scores).toEqual({ p1: 2 }); // b 是シングル 2 分
    expect(state.lastResult).toEqual({ type: 'correct', playerId: 'p1', songId: 'b', round: 1 });
  });

  test('applyClaim：已有人取得後再點 → ROUND_RESOLVED（慢了一步，不算お手つき）', () => {
    const s0 = pickNextSong(createIntroState(), SONGS, NOW, () => 0)!;
    const { state } = applyClaim(s0, SONGS, 'p1', 'a');
    expect(() => applyClaim(state, SONGS, 'p2', 'a')).toThrowError(AppError);
    try { applyClaim(state, SONGS, 'p2', 'b'); } catch (e) { expect(codeOf(e)).toBe('ROUND_RESOLVED'); }
  });

  test('applyClaim：沒有進行中的回合 → NO_ACTIVE_ROUND', () => {
    expect.assertions(1);
    try { applyClaim(createIntroState(), SONGS, 'p1', 'a'); } catch (e) { expect(codeOf(e)).toBe('NO_ACTIVE_ROUND'); }
  });

  test('applyClaim 點錯：有牌的人 pendingDiscards+1，沒牌的人只記錄 otetsuki', () => {
    let s = pickNextSong(createIntroState(), SONGS, NOW, () => 0)!; // a
    const r1 = applyClaim(s, SONGS, 'p1', 'b');
    expect(r1.result).toBe('otetsuki_no_cards');
    expect(r1.state.pendingDiscards).toEqual({});
    expect(r1.state.lastResult?.type).toBe('otetsuki');
    expect(r1.state.resolved).toBe(false);

    // p1 先拿到 a，再下一回合點錯
    s = applyClaim(r1.state, SONGS, 'p1', 'a').state;
    s = pickNextSong(s, SONGS, NOW, () => 0)!; // b
    const r2 = applyClaim(s, SONGS, 'p1', 'c');
    expect(r2.result).toBe('otetsuki');
    expect(r2.state.pendingDiscards).toEqual({ p1: 1 });
  });

  test('有待丟的牌時不能再搶 → DISCARD_PENDING', () => {
    expect.assertions(1);
    let s = pickNextSong(createIntroState(), SONGS, NOW, () => 0)!; // a
    s = applyClaim(s, SONGS, 'p1', 'a').state;
    s = pickNextSong(s, SONGS, NOW, () => 0)!; // b
    s = applyClaim(s, SONGS, 'p1', 'c').state; // お手つき
    try { applyClaim(s, SONGS, 'p1', 'b'); } catch (e) { expect(codeOf(e)).toBe('DISCARD_PENDING'); }
  });

  test('applyDiscard：把自己的牌丟回場上，分數重算，pending 歸零', () => {
    let s = pickNextSong(createIntroState(), SONGS, NOW, () => 0)!; // a
    s = applyClaim(s, SONGS, 'p1', 'a').state;
    s = pickNextSong(s, SONGS, NOW, () => 0)!; // b
    s = applyClaim(s, SONGS, 'p1', 'c').state; // お手つき
    expect(ownedSongs(s, SONGS, 'p1').map((x) => x.id)).toEqual(['a']);
    s = applyDiscard(s, SONGS, 'p1', 'a');
    expect(s.taken).toEqual({});
    expect(s.scores).toEqual({ p1: 0 });
    expect(s.pendingDiscards).toEqual({});
    expect(s.lastResult).toEqual({ type: 'discard', playerId: 'p1', songId: 'a', round: 2 });
    // 丟回去的牌可以再被出到
    const again = pickNextSong({ ...s, currentSongId: null }, SONGS, NOW, () => 0)!;
    expect(['a', 'b', 'c']).toContain(again.currentSongId);
  });

  test('applyDiscard：沒有待丟 / 不是自己的牌', () => {
    expect.assertions(2);
    const s = { ...createIntroState(), taken: { a: 'p2' } };
    try { applyDiscard(s, SONGS, 'p1', 'a'); } catch (e) { expect(codeOf(e)).toBe('NO_DISCARD_PENDING'); }
    try { applyDiscard({ ...s, pendingDiscards: { p1: 1 } }, SONGS, 'p1', 'a'); } catch (e) { expect(codeOf(e)).toBe('NOT_YOUR_CARD'); }
  });

  test('applyClaim：不存在的曲目 / 已被取走的曲目', () => {
    expect.assertions(2);
    const s = pickNextSong({ ...createIntroState(), taken: { c: 'p2' } }, SONGS, NOW, () => 0)!;
    try { applyClaim(s, SONGS, 'p1', 'zzz'); } catch (e) { expect(codeOf(e)).toBe('UNKNOWN_SONG'); }
    try { applyClaim(s, SONGS, 'p1', 'c'); } catch (e) { expect(codeOf(e)).toBe('ALREADY_TAKEN'); }
  });

  test('computeScores / isIntroFinished', () => {
    expect(computeScores({ a: 'p1', b: 'p2', c: 'p1' }, SONGS)).toEqual({ p1: 2, p2: 2 });
    const done = { ...createIntroState(), taken: { a: 'p1', b: 'p2', c: 'p1' } };
    expect(isIntroFinished(done, SONGS)).toBe(true);
    expect(isIntroFinished({ ...done, pendingDiscards: { p1: 1 } }, SONGS)).toBe(false);
    expect(isIntroFinished({ ...done, taken: { a: 'p1' } }, SONGS)).toBe(false);
  });
});
