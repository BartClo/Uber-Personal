'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPhotonGeocoder } from '@/data/geocoder';
import { ConfigError } from '@/client/ConfigError';
import { RequestForm } from '@/client/RequestForm';
import { useClientRepo } from '@/client/useClientRepo';

/** Browser-only (loaded with ssr: false). */
export default function PedirApp() {
  const state = useClientRepo();
  const router = useRouter();
  const [geocoder] = useState(() => createPhotonGeocoder());
  if (!state.ok) return <ConfigError message={state.message} />;
  return (
    <RequestForm repo={state.repo} geocoder={geocoder} onSuccess={(token) => router.push(`/pedir/${token}`)} />
  );
}
