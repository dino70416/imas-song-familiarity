import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import type { FakeStore } from './helpers/fakeRoomStore';

// vi.mock 會被提升到最上面，工廠內不能碰頂層變數 → 在工廠裡動態 import 假 store
vi.mock('@/lib/kamisabiRoom/store', async () => {
  const { createFakeStore } = await import('./helpers/fakeRoomStore');
  return createFakeStore();
});

import { authenticateRoomRequest, generateToken, readBearer } from '@/lib/kamisabiRoom/auth';
import { runRoomMutation } from '@/lib/kamisabiRoom/mutate';
import * as store from '@/lib/kamisabiRoom/store';

const fake = store as unknown as FakeStore;

const req = (token?: string) => new Request('http://localhost/api/x', { headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function seedRoom() {
  const room = await store.createRoom({ code: 'ABCDE', brand: 'music_ml', songs: [] });
  const host = await store.addPlayer({ roomId: room.id, name: 'host', seat: 0, isHost: true });
  const guest = await store.addPlayer({ roomId: room.id, name: 'guest', seat: 1, isHost: false });
  await store.createSecret({ roomId: room.id, playerId: host.id, token: 'tok-host' });
  await store.createSecret({ roomId: room.id, playerId: guest.id, token: 'tok-guest' });
  return { room, host, guest };
}

beforeEach(() => fake.reset());

describe('token 工具', () => {
  test('generateToken 每次不同且夠長', () => {
    const a = generateToken();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(generateToken()).not.toBe(a);
  });
  test('readBearer', () => {
    expect(readBearer(req('abc'))).toBe('abc');
    expect(readBearer(req())).toBeNull();
    expect(readBearer(new Request('http://x', { headers: { Authorization: 'Basic zzz' } }))).toBeNull();
  });
});

describe('authenticateRoomRequest', () => {
  test('找不到房間 → 404；沒 token → 401；token 錯 → 401；非房主但要求 hostOnly → 403', async () => {
    await seedRoom();
    await expect(authenticateRoomRequest(req('tok-host'), 'ZZZZZ')).rejects.toMatchObject({ statusCode: 404 });
    await expect(authenticateRoomRequest(req(), 'ABCDE')).rejects.toMatchObject({ statusCode: 401 });
    await expect(authenticateRoomRequest(req('nope'), 'ABCDE')).rejects.toMatchObject({ statusCode: 401 });
    await expect(authenticateRoomRequest(req('tok-guest'), 'ABCDE', { hostOnly: true })).rejects.toMatchObject({ statusCode: 403 });
  });
  test('成功回 room / player / secret / players，房號不分大小寫', async () => {
    const { host } = await seedRoom();
    const ctx = await authenticateRoomRequest(req('tok-host'), 'abcde', { hostOnly: true });
    expect(ctx.player.id).toBe(host.id);
    expect(ctx.players.map((p) => p.name)).toEqual(['host', 'guest']);
    expect(ctx.secret.token).toBe('tok-host');
  });
});

describe('runRoomMutation', () => {
  test('寫回 patch、version+1、回傳 result', async () => {
    await seedRoom();
    const result = await runRoomMutation(req('tok-host'), 'ABCDE', {}, (ctx) => ({
      patch: { status: 'playing' as const },
      result: { was: ctx.room.status },
    }));
    expect(result).toEqual({ was: 'lobby' });
    const room = await store.getRoomByCode('ABCDE');
    expect(room?.status).toBe('playing');
    expect(room?.version).toBe(1);
  });

  test('版本衝突時重讀再跑一次 fn（fn 看到最新 room）', async () => {
    const { room } = await seedRoom();
    let calls = 0;
    const result = await runRoomMutation(req('tok-host'), 'ABCDE', {}, async (ctx) => {
      calls++;
      if (calls === 1) {
        // 模擬別人在我們讀完之後先寫入
        await store.updateRoom(room.id, 0, { status: 'playing' });
      }
      return { patch: { mode: 'intro' as const }, result: ctx.room.version };
    });
    expect(calls).toBe(2);
    expect(result).toBe(1);
    expect((await store.getRoomByCode('ABCDE'))?.version).toBe(2);
  });

  test('連續衝突 3 次後放棄 → 409 VERSION_CONFLICT', async () => {
    const { room } = await seedRoom();
    let v = 0;
    await expect(
      runRoomMutation(req('tok-host'), 'ABCDE', {}, async () => {
        await store.updateRoom(room.id, v++, { status: 'lobby' });
        return { patch: { status: 'playing' as const }, result: null };
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  test('fn 丟 AppError 直接往外丟，不重試、不寫入', async () => {
    await seedRoom();
    let calls = 0;
    await expect(
      runRoomMutation(req('tok-host'), 'ABCDE', {}, () => { calls++; throw new AppError('x', 400, 'X'); }),
    ).rejects.toMatchObject({ code: 'X' });
    expect(calls).toBe(1);
    expect((await store.getRoomByCode('ABCDE'))?.version).toBe(0);
  });

  test('hands 有給時寫進 room_secrets', async () => {
    const { host } = await seedRoom();
    await runRoomMutation(req('tok-host'), 'ABCDE', {}, () => ({ patch: {}, result: null, hands: { [host.id]: ['s1', 's2'] } }));
    expect((await store.findSecretByToken((await store.getRoomByCode('ABCDE'))!.id, 'tok-host'))?.hand).toEqual(['s1', 's2']);
  });
});
