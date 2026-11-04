'use client';

import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthGate } from '@/auth/AuthGate';
import { createSupabaseDriverRepo } from '@/data/supabaseDriverRepo';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { DriverApp } from '@/ui/DriverApp';

type ClientState = { ok: true; client: SupabaseClient } | { ok: false; message: string };

function initClient(): ClientState {
  try {
    return { ok: true, client: getSupabaseClient() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Solo navegador (se carga con ssr: false desde page.tsx). */
export default function TaxistaApp() {
  const [state] = useState(initClient);
  if (!state.ok) {
    return (
      <main>
        <h1>Despacho</h1>
        <p role="alert">Error de configuración: no se puede conectar con Supabase. {state.message}.</p>
      </main>
    );
  }
  return (
    <AuthGate client={state.client} role="driver">
      <ConnectedDriverApp client={state.client} />
    </AuthGate>
  );
}

function ConnectedDriverApp({ client }: { client: SupabaseClient }) {
  const repo = useMemo(() => createSupabaseDriverRepo(client), [client]);
  // Los navegadores sin soporte no definen estas propiedades, aunque los tipos digan lo contrario.
  const geolocation = (navigator.geolocation as Geolocation | undefined) ?? null;
  const wakeLock = (navigator.wakeLock as WakeLock | undefined) ?? null;
  return (
    <DriverApp
      repo={repo}
      geolocation={geolocation}
      wakeLock={wakeLock}
      onSignOut={() => void client.auth.signOut()}
    />
  );
}
