import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppError } from '@/lib/errors';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getSupabaseAdmin', () => {
  test('缺環境變數時丟 503 AppError，而不是讓 createClient 炸掉', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { getSupabaseAdmin } = await import('@/lib/supabase/server');
    expect(() => getSupabaseAdmin()).toThrowError(AppError);
    try {
      getSupabaseAdmin();
    } catch (e) {
      expect((e as AppError).statusCode).toBe(503);
      expect((e as AppError).code).toBe('SUPABASE_NOT_CONFIGURED');
    }
  });

  test('有環境變數時回傳同一個 client 實例', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_test');
    const { getSupabaseAdmin } = await import('@/lib/supabase/server');
    expect(getSupabaseAdmin()).toBe(getSupabaseAdmin());
  });
});

describe('getSupabaseBrowser', () => {
  test('缺環境變數回 null（前端改用輪詢）', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const { getSupabaseBrowser } = await import('@/lib/supabase/browser');
    expect(getSupabaseBrowser()).toBeNull();
  });
});
