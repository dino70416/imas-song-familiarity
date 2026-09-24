import { vi } from 'vitest';

export interface FetchRoute {
  method?: 'GET' | 'POST' | 'HEAD';
  match: RegExp;
  handle: (body: unknown, url: string) => { status?: number; json?: unknown; delayMs?: number };
}

export interface FetchCall { method: string; url: string; body: unknown }

/** 用路由表模擬 fetch；沒對到的請求回 500，讓測試一眼看出漏了哪支 */
export function mockRoomFetch(routes: FetchRoute[]): FetchCall[] {
  const calls: FetchCall[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const route = routes.find((r) => (r.method ?? 'GET') === method && r.match.test(url));
    if (!route) {
      return new Response(JSON.stringify({ error: `no mock route: ${method} ${url}` }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
    const out = route.handle(body, url);
    if (out.delayMs) await new Promise((r) => setTimeout(r, out.delayMs));
    return new Response(out.json === undefined ? null : JSON.stringify(out.json), { status: out.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return calls;
}
