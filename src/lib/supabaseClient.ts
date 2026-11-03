import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class MissingSupabaseConfigError extends Error {
  constructor(missing: string[]) {
    super(`Faltan variables de entorno: ${missing.join(', ')}`);
    this.name = 'MissingSupabaseConfigError';
  }
}

let cached: SupabaseClient | null = null;

/** Lazily creates (once) the browser Supabase client. Throws if env vars are missing. */
export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  // Literal access so Next.js inlines NEXT_PUBLIC_* at build time.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing: string[] = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!key) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) throw new MissingSupabaseConfigError(missing);
  cached = createClient(url, key);
  return cached;
}
