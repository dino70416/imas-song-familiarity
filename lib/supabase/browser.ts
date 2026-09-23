'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 瀏覽器用的 Supabase client（anon / publishable key）：只讀 + Realtime 訂閱。
 * 沒設環境變數時回 null，useRoom 會改用輪詢。
 */
let browserClient: SupabaseClient | null | undefined;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  browserClient = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return browserClient;
}
