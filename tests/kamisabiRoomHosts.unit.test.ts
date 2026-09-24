import { describe, expect, test } from 'vitest';
import { canHostRoom, parseRoomHosts } from '@/lib/kamisabiRoom/hosts';

describe('KAMISABI_ROOM_HOSTS 開房白名單', () => {
  test('parseRoomHosts：逗號分隔、去空白、忽略空字串', () => {
    expect(parseRoomHosts(undefined)).toEqual([]);
    expect(parseRoomHosts('')).toEqual([]);
    expect(parseRoomHosts(' dino , alice,,')).toEqual(['dino', 'alice']);
  });

  test('canHostRoom：只有已登入且帳號在名單才 true；名單為空一律 false', () => {
    expect(canHostRoom('dino', 'dino,alice')).toBe(true);
    expect(canHostRoom('alice', 'dino, alice')).toBe(true);
    expect(canHostRoom('bob', 'dino,alice')).toBe(false);
    expect(canHostRoom(null, 'dino')).toBe(false);
    expect(canHostRoom(undefined, 'dino')).toBe(false);
    expect(canHostRoom('dino', '')).toBe(false);
    expect(canHostRoom('dino', undefined)).toBe(false);
  });
});
