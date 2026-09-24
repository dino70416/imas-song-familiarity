/**
 * 線上房間「開房」白名單：環境變數 KAMISABI_ROOM_HOSTS（username，逗號分隔）。
 * 沒設＝全站關閉開房（/kamisabi 不顯示房間區塊、POST /api/kamisabi/room 回 403）。
 * 加入房間不需登入，房間頁維持公開。
 */
export function parseRoomHosts(env: string | undefined): string[] {
  return (env ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function canHostRoom(username: string | null | undefined, env: string | undefined = process.env.KAMISABI_ROOM_HOSTS): boolean {
  if (!username) return false;
  return parseRoomHosts(env).includes(username);
}
