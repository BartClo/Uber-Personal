'use client';

import { useState } from 'react';
import { formatLastSeen, isStale } from '@/domain/freshness';
import { driverStatusLabel } from '@/domain/labels';
import type { Driver } from '@/domain/types';
import styles from './DriverList.module.css';

type Filter = 'all' | 'free' | 'busy';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'free', label: 'Libres' },
  { key: 'busy', label: 'En viaje' },
];

export function DriverList({ drivers, now }: { drivers: Driver[]; now: Date }) {
  const [filter, setFilter] = useState<Filter>('all');
  const rows = drivers
    .filter((d) => filter === 'all' || d.status === filter)
    .sort((a, b) => a.taxiNumber.localeCompare(b.taxiNumber, 'es', { numeric: true }));

  return (
    <section aria-labelledby="drivers-heading" className={styles.panel}>
      <header className={styles.header}>
        <h2 id="drivers-heading">Taxistas</h2>
        <span>{drivers.length} en la flota</span>
      </header>
      <div className={styles.filters} role="group" aria-label="Filtrar taxistas">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            className={styles.filter}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className={styles.list}>
        {rows.map((d) => {
          const stale = isStale(d.lastSeenAt, now);
          const status = stale ? 'Sin señal' : driverStatusLabel(d.status);
          return (
            <li key={d.id} className={styles.row} data-stale={stale ? 'true' : undefined}>
              <strong className={styles.taxi}>{d.taxiNumber}</strong>
              <span className={styles.name}>{d.name}</span>
              <span className={styles.status}>
                {d.lastSeenAt === null
                  ? status
                  : `${status} · ${formatLastSeen(d.lastSeenAt, now)}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
