import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL?.trim();
const key = env.VITE_SUPABASE_ANON_KEY?.trim();

function make(): SupabaseClient | null {
  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch (e) {
    console.warn('Supabase не инициализирован, работаем как гость', e);
    return null;
  }
}

/** null = переменные окружения не заданы: игра работает в гостевом режиме (localStorage). */
export const supabase: SupabaseClient | null = make();
export const hasSupabase = supabase !== null;
