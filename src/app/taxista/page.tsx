'use client';

import dynamic from 'next/dynamic';

// ssr: false: el cliente de Supabase, el GPS y Wake Lock solo existen en el navegador.
const TaxistaApp = dynamic(() => import('./TaxistaApp'), {
  ssr: false,
  loading: () => <p role="status">Cargando…</p>,
});

export default function TaxistaPage() {
  return <TaxistaApp />;
}
