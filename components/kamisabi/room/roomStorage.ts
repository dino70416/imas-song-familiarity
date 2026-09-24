/** 玩家在某個房間的身分：加入時由 API 發 token，存在 localStorage，之後每個動作都帶 */
export interface RoomSession {
  playerId: string;
  token: string;
  name: string;
}

const key = (code: string) => `kamisabi:room:${code.trim().toUpperCase()}`;

export function loadSession(code: string): RoomSession | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoomSession>;
    if (typeof parsed.playerId !== 'string' || typeof parsed.token !== 'string') return null;
    return { playerId: parsed.playerId, token: parsed.token, name: typeof parsed.name === 'string' ? parsed.name : '' };
  } catch {
    return null;
  }
}

export function saveSession(code: string, session: RoomSession): void {
  try {
    localStorage.setItem(key(code), JSON.stringify(session));
  } catch {
    /* 隱私模式等情況：忽略，這一頁還是能玩 */
  }
}

export function clearSession(code: string): void {
  try {
    localStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
}
