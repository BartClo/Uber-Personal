'use client';

import { useEffect, useRef, useState } from 'react';
import type { CancelError, CancelResult } from '@/data/repo';
import { formatLastSeen } from '@/domain/freshness';
import { tripSourceLabel, tripStatusLabel } from '@/domain/labels';
import type { Driver, Trip } from '@/domain/types';
import { wazeUrl } from '@/domain/waze';
import styles from './TripQueue.module.css';

const ACTIVE = ['assigned', 'en_route', 'on_board'];
/** A partir de aquí el pedido se destaca en la cola: lleva demasiado esperando. */
const URGENT_AFTER_MS = 5 * 60_000;

const CANCEL_ERRORS: Record<CancelError, string> = {
  trip_not_found: 'Este pedido ya no existe',
  not_cancellable: 'Este pedido ya no se puede cancelar',
};
const CANCEL_NETWORK_ERROR = 'No se pudo cancelar. Intenta de nuevo.';

/** Cancelar es irreversible y el cliente lo ve: siempre pide confirmación en la misma fila. */
function CancelControl({
  trip,
  onCancel,
}: {
  trip: Trip;
  onCancel: (tripId: string) => Promise<CancelResult>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // El botón pulsado desaparece al confirmar o descartar: el foco no debe perderse con él.
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) openRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const result = await onCancel(trip.id);
      if (!result.ok) setError(CANCEL_ERRORS[result.error]);
    } catch {
      setError(CANCEL_NETWORK_ERROR);
    }
    setPending(false);
    setConfirming(false);
  }

  return (
    <div className={styles.cancel}>
      {error && (
        <p role="alert" className={styles.cancelError}>
          {error}
        </p>
      )}
      {confirming ? (
        <div
          role="group"
          aria-label="Confirmar cancelación"
          className={styles.cancelConfirm}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !pending) setConfirming(false);
          }}
        >
          <span>¿Cancelar este pedido?</span>
          <button
            type="button"
            className={styles.cancelYes}
            disabled={pending}
            onClick={() => void confirm()}
          >
            Sí, cancelar
          </button>
          <button
            ref={keepRef}
            type="button"
            className={styles.cancelButton}
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            No, mantener
          </button>
        </div>
      ) : (
        <button
          ref={openRef}
          type="button"
          className={styles.cancelButton}
          aria-label={`Cancelar el pedido de ${trip.customerName}`}
          onClick={() => setConfirming(true)}
        >
          Cancelar
        </button>
      )}
    </div>
  );
}

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
  onCancel,
}: {
  trips: Trip[];
  drivers: Driver[];
  now: Date;
  onAssignClick: (trip: Trip) => void;
  onCancel: (tripId: string) => Promise<CancelResult>;
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
              <CancelControl trip={t} onCancel={onCancel} />
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
              <CancelControl trip={t} onCancel={onCancel} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
