'use client';

import dynamic from 'next/dynamic';

export const FleetMap = dynamic(() => import('./FleetMapInner').then((m) => m.FleetMapInner), {
  ssr: false,
  loading: () => <p>Cargando mapa…</p>,
});
