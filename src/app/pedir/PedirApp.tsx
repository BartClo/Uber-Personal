'use client';

import { useRouter } from 'next/navigation';
import { ConfigError } from '@/client/ConfigError';
import { RequestForm } from '@/client/RequestForm';
import { useClientRepo } from '@/client/useClientRepo';

/** Browser-only (loaded with ssr: false). */
export default function PedirApp() {
  const state = useClientRepo();
  const router = useRouter();
  if (!state.ok) return <ConfigError message={state.message} />;
  return (
    <RequestForm repo={state.repo} onSuccess={(token) => router.push(`/pedir/${token}`)} />
  );
}
