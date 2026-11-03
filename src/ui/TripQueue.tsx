'use client';

import { formatLastSeen } from '@/domain/freshness';
import { tripSourceLabel, tripStatusLabel } from '@/domain/labels';
import type { Driver, Trip } from '@/domain/types';
import styles from './TripQueue.module.css';

const ACTIVE = ['assigned', 'en_route', 'on_board'];

export function TripQueue({
  trips,
  drivers,
  now,
  onAssignClick,
}: {
  trips: Trip[];
  drivers: Driver[];
  now: Date;
  onAssignClick: (trip: Trip) => void;
}) {
  const pending = trips
    .filter((t) => t.status === 'pending')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const active = trips.filter((t) => ACTIVE.includes(t.status));

  return (
    <section aria-labelledby="trips-heading" className={styles.panel}>
      <header className={styles.header}>
        <h2 id="trips-heading">Pedidos</h2>
        <span>{pending.length} en espera</span>
      </header>
      <ul className={styles.list} aria-label="Pedidos en espera">
        {pending.map((t) => (
          <li key={t.id} className={styles.row}>
            <strong data-testid="pending-name">{t.customerName}</strong>
            <span>{t.customerPhone}</span>
            <span>Origen: {t.pickupAddress}</span>
            <span>Destino: {t.dropoffAddress}</span>
            <span>{tripSourceLabel(t.source)}</span>
            <span>En espera · {formatLastSeen(t.createdAt, now)}</span>
            {(t.pickupLat === null || t.pickupLng === null) && (
              <span>Sin ubicación en el mapa</span>
            )}
            <button
              type="button"
              className={styles.button}
              aria-label={`Asignar a ${t.customerName}`}
              onClick={() => onAssignClick(t)}
            >
              Asignar
            </button>
          </li>
        ))}
      </ul>
      <h3 className={styles.sub}>En curso</h3>
      <ul className={styles.list} aria-label="Pedidos en curso">
        {active.map((t) => {
          const d = drivers.find((x) => x.id === t.driverId);
          return (
            <li key={t.id} className={styles.row}>
              <strong>{t.customerName}</strong>
              <span>{d ? `${d.name} · taxi ${d.taxiNumber}` : 'Taxista desconocido'}</span>
              <span>{tripStatusLabel(t.status)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
