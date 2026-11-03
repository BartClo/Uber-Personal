import type { ConnectionState } from '@/data/repo';
import { isStale } from '@/domain/freshness';
import type { Driver } from '@/domain/types';
import styles from './Dashboard.module.css';

export function Header({
  drivers,
  now,
  connection,
}: {
  drivers: Driver[];
  now: Date;
  connection: ConnectionState;
}) {
  let free = 0;
  let busy = 0;
  let stale = 0;
  for (const d of drivers) {
    const s = isStale(d.lastSeenAt, now);
    if (d.status === 'free' && !s) free++;
    if (d.status === 'busy') busy++;
    if (s && d.status !== 'offline') stale++;
  }
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Despacho</h1>
      <ul className={styles.counters} aria-label="Resumen de la flota" aria-live="polite">
        <li>{free} libres</li>
        <li>{busy} en viaje</li>
        <li>{stale} sin señal</li>
      </ul>
      {connection === 'connected' && (
        <span className={styles.live}>
          <span aria-hidden="true" className={styles.liveDot} />
          En vivo
        </span>
      )}
    </header>
  );
}
