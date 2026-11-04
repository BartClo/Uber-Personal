'use client';

import { formatLastSeen } from '@/domain/freshness';
import { tripSourceLabel, tripStatusLabel } from '@/domain/labels';
import type { Driver, Trip } from '@/domain/types';
import { wazeUrl } from '@/domain/waze';
import styles from './TripQueue.module.css';

const ACTIVE = ['assigned', 'en_route', 'on_board'];
/** A partir de aquí el pedido se destaca en la cola: lleva demasiado esperando. */
const URGENT_AFTER_MS = 5 * 60_000;

function WazeLink({ trip }: { trip: Trip }) {
  return (
    <a
      className={styles.waze}
      href={wazeUrl(trip)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir en Waze el viaje de ${trip.customerName}`}
    >
      Waze
    </a>
  );
}

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
    <section aria-label="Cola de pedidos" className={styles.panel}>
      <header className={styles.header}>
        <h3 className={styles.sub}>Cola</h3>
        <span className={styles.badge}>{pending.length} en espera</span>
      </header>
      {pending.length === 0 && <p className={styles.empty}>No hay pedidos en espera</p>}
      <ul className={styles.list} aria-label="Pedidos en espera">
        {pending.map((t) => {
          const urgent = now.getTime() - Date.parse(t.createdAt) >= URGENT_AFTER_MS;
          return (
            <li key={t.id} className={styles.card} data-urgent={urgent ? 'true' : undefined}>
              <div className={styles.top}>
                <strong data-testid="pending-name" className={styles.name}>
                  {t.customerName}
                </strong>
                <span className={styles.wait}>En espera · {formatLastSeen(t.createdAt, now)}</span>
              </div>
              <a className={styles.phone} href={`tel:${t.customerPhone.replace(/\s/g, '')}`}>
                {t.customerPhone}
              </a>
              <ul className={styles.route}>
                <li className={styles.stop}>
                  <span className="visually-hidden">Origen: </span>
                  {t.pickupAddress}
                </li>
                <li className={styles.stop}>
                  <span className="visually-hidden">Destino: </span>
                  {t.dropoffAddress}
                </li>
              </ul>
              <div className={styles.footer}>
                <div className={styles.tags}>
                  <span className={styles.tag}>{tripSourceLabel(t.source)}</span>
                  {(t.pickupLat === null || t.pickupLng === null) && (
                    <span className={`${styles.tag} ${styles.tagWarn}`}>
                      Sin ubicación en el mapa
                    </span>
                  )}
                </div>
                <WazeLink trip={t} />
                <button
                  type="button"
                  className={styles.button}
                  aria-label={`Asignar a ${t.customerName}`}
                  onClick={() => onAssignClick(t)}
                >
                  Asignar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <header className={styles.header}>
        <h3 className={styles.sub}>En curso</h3>
        <span className={styles.badge}>{active.length} viajes</span>
      </header>
      {active.length === 0 && <p className={styles.empty}>Ningún viaje en curso</p>}
      <ul className={styles.list} aria-label="Pedidos en curso">
        {active.map((t) => {
          const d = drivers.find((x) => x.id === t.driverId);
          return (
            <li key={t.id} className={styles.activeRow}>
              <div className={styles.activeInfo}>
                <strong>{t.customerName}</strong>
                <span>{d ? `${d.name} · taxi ${d.taxiNumber}` : 'Taxista desconocido'}</span>
              </div>
              <div className={styles.activeActions}>
                <span className={styles.state}>{tripStatusLabel(t.status)}</span>
                <WazeLink trip={t} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
