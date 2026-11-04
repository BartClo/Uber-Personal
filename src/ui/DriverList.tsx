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

/** "Libres" coincide con el contador del encabezado: sin señal no cuenta como disponible. */
function matches(d: Driver, f: Filter, now: Date): boolean {
  if (f === 'free') return d.status === 'free' && !isStale(d.lastSeenAt, now);
  return f === 'all' || d.status === f;
}

/** Desconectado es un estado propio: no se confunde con "sin señal". */
function presence(d: Driver, now: Date): { tone: string; text: string; stale: boolean } {
  const stale = isStale(d.lastSeenAt, now);
  if (d.status === 'offline') {
    return { tone: 'off', text: `${driverStatusLabel(d.status)} · —`, stale };
  }
  if (d.lastSeenAt === null) return { tone: 'stale', text: 'Sin señal', stale };
  const seen = formatLastSeen(d.lastSeenAt, now);
  if (stale) return { tone: 'stale', text: `Sin señal · ${seen}`, stale };
  return { tone: d.status, text: `${driverStatusLabel(d.status)} · ${seen}`, stale };
}

export function DriverList({
  drivers,
  now,
  selectedDriverId,
  onSelectDriver,
}: {
  drivers: Driver[];
  now: Date;
  selectedDriverId?: string | null;
  onSelectDriver?: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const rows = drivers
    .filter((d) => matches(d, filter, now))
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
            <span aria-hidden="true" className={styles.count}>
              {drivers.filter((d) => matches(d, f.key, now)).length}
            </span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>Ningún taxista en este filtro</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((d) => {
            const p = presence(d, now);
            return (
              <li
                key={d.id}
                className={styles.row}
                data-tone={p.tone}
                data-stale={p.stale ? 'true' : undefined}
              >
                <button
                  type="button"
                  className={styles.rowBtn}
                  aria-current={d.id === selectedDriverId ? 'true' : undefined}
                  onClick={() => onSelectDriver?.(d.id)}
                >
                  <strong className={styles.taxi}>{d.taxiNumber}</strong>
                  <span className={styles.body}>
                    <span className={styles.name}>{d.name}</span>
                    <span className={styles.status}>{p.text}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
