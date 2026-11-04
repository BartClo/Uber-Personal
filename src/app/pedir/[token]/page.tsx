'use client';

import dynamic from 'next/dynamic';

const TrackingApp = dynamic(() => import('./TrackingApp'), {
  ssr: false,
  loading: () => <p role="status">Cargando…</p>,
});

export default function TrackingPage() {
  return <TrackingApp />;
}
