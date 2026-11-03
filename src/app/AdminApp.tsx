'use client';

import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthGate } from '@/auth/AuthGate';
import { createSupabaseRepo } from '@/data/supabaseRepo';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { Dashboard } from '@/ui/Dashboard';
import styles from './AdminApp.module.css';

type ClientState = { ok: true; client: SupabaseClient } | { ok: false; message: string };

function initClient(): ClientState {
  try {
    return { ok: true, client: getSupabaseClient() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Browser-only (loaded with ssr: false from page.tsx). */
export default function AdminApp() {
  const [state] = useState(initClient);
  if (!state.ok) {
    return (
      <main className={styles.configError}>
        <h1>Despacho</h1>
        <p role="alert">
          Error de configuración: no se puede conectar con Supabase. {state.message}. Copia
          .env.example a .env.local y completa los valores.
        </p>
      </main>
    );
  }
  return (
    <AuthGate client={state.client}>
      <RepoDashboard client={state.client} />
    </AuthGate>
  );
}

function RepoDashboard({ client }: { client: SupabaseClient }) {
  const repo = useMemo(() => createSupabaseRepo(client), [client]);
  return <Dashboard repo={repo} />;
}
