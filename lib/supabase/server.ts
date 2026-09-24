import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors';

/**
 * 只給 Route Handler 用的 Supabase client（service role，繞過 RLS）。
 * 絕對不要從 client component import 這個檔案。
 */
const globalForSupabase = global as unknown as { _supabaseAdmin?: SupabaseClient; _supabaseAdminKey?: string };

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new AppError('房間功能尚未設定 Supabase 環境變數。', 503, 'SUPABASE_NOT_CONFIGURED');
  }
  const cacheKey = `${url}|${key}`;
  if (!globalForSupabase._supabaseAdmin || globalForSupabase._supabaseAdminKey !== cacheKey) {
    globalForSupabase._supabaseAdmin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    globalForSupabase._supabaseAdminKey = cacheKey;
  }
  return globalForSupabase._supabaseAdmin;
}
