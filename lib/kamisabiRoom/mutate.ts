import { AppError } from '@/lib/errors';
import { authenticateRoomRequest, type RoomContext } from './auth';
import * as store from './store';
import type { RoomMode, RoomState, RoomStatus } from './types';

export interface MutationOutcome<T> {
  patch: { mode?: RoomMode; status?: RoomStatus; state?: RoomState };
  result: T;
  /** 時間軸模式：要寫回 room_secrets 的手牌（playerId → songIds） */
  hands?: Record<string, string[]>;
}

const MAX_ATTEMPTS = 3;

/**
 * 所有會改房間狀態的 API 都走這裡：
 * auth → 讀最新 room → 純函式算 patch → 樂觀鎖寫回；
 * 撞到 VERSION_CONFLICT 就重讀再算一次（最多 3 次），讓「兩人同時點牌」由第一個成功者得卡。
 * 純函式丟的 AppError（規則錯誤）直接往外丟，不重試。
 * 手牌（room_secrets）在 rooms.version 更新「之前」先寫：version 一變 Realtime 就會推給所有人，
 * 此時 /hand 必須已經讀得到新手牌。衝突重試時會用新算出的手牌再覆寫一次。
 */
export async function runRoomMutation<T>(
  request: Request,
  code: string,
  opts: { hostOnly?: boolean },
  fn: (ctx: RoomContext) => MutationOutcome<T> | Promise<MutationOutcome<T>>,
): Promise<T> {
  let lastConflict: AppError | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ctx = await authenticateRoomRequest(request, code, opts);
    const outcome = await fn(ctx);
    if (outcome.hands) await store.setHands(ctx.room.id, outcome.hands);
    try {
      await store.updateRoom(ctx.room.id, ctx.room.version, outcome.patch);
    } catch (e) {
      if (e instanceof AppError && e.code === 'VERSION_CONFLICT') {
        lastConflict = e;
        continue;
      }
      throw e;
    }
    return outcome.result;
  }
  throw lastConflict ?? new AppError('房間狀態已被其他人更新，請重試。', 409, 'VERSION_CONFLICT');
}
