'use client';

import { useParams } from 'next/navigation';
import { ConfigError } from '@/client/ConfigError';
import { TrackingScreen } from '@/client/TrackingScreen';
import { useClientRepo } from '@/client/useClientRepo';

/** Browser-only (loaded with ssr: false). The token lives in the URL. */
export default function TrackingApp() {
  const state = useClientRepo();
  const params = useParams<{ token: string }>();
  if (!state.ok) return <ConfigError message={state.message} />;
  return <TrackingScreen repo={state.repo} token={params.token} />;
}
