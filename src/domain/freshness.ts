export const STALE_AFTER_MS = 60_000;

export function isStale(lastSeenAt: string | null, now: Date): boolean {
  if (lastSeenAt === null) return true;
  return now.getTime() - new Date(lastSeenAt).getTime() > STALE_AFTER_MS;
}

export function formatLastSeen(lastSeenAt: string | null, now: Date): string {
  if (lastSeenAt === null) return 'sin señal';
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(lastSeenAt).getTime()) / 1000),
  );
  if (seconds < 60) return `hace ${seconds} s`;
  return `hace ${Math.floor(seconds / 60)} min`;
}
