'use client';

import { useState } from 'react';
import { createSupabaseClientRepo, type ClientRepo } from '@/data/clientRepo';
import { getSupabaseClient } from '@/lib/supabaseClient';

export type ClientRepoState = { ok: true; repo: ClientRepo } | { ok: false; message: string };

function init(): ClientRepoState {
  try {
    return { ok: true, repo: createSupabaseClientRepo(getSupabaseClient()) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Browser-only: call from components loaded with ssr: false. */
export function useClientRepo(): ClientRepoState {
  const [state] = useState(init);
  return state;
}
