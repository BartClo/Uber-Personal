'use client';

import dynamic from 'next/dynamic';

// ssr: false so the Supabase client is never created during prerender/build.
const AdminApp = dynamic(() => import('./AdminApp'), {
  ssr: false,
  loading: () => <p role="status">Cargando…</p>,
});

export default function Home() {
  return <AdminApp />;
}
