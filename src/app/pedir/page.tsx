'use client';

import dynamic from 'next/dynamic';

// ssr: false so the Supabase client is never created during prerender/build.
const PedirApp = dynamic(() => import('./PedirApp'), {
  ssr: false,
  loading: () => <p role="status">Cargando…</p>,
});

export default function PedirPage() {
  return <PedirApp />;
}
