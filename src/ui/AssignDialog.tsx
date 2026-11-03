'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssignError, AssignResult } from '@/data/repo';
import { formatDistanceKm } from '@/domain/distance';
import { formatLastSeen } from '@/domain/freshness';
import { driverStatusLabel } from '@/domain/labels';
import { rankDrivers } from '@/domain/rankDrivers';
import type { Driver, Trip } from '@/domain/types';
import styles from './AssignDialog.module.css';

const ERROR_MESSAGES: Record<AssignError, string> = {
  already_assigned: 'Este viaje ya fue asignado por otra persona',
  driver_unavailable: 'Ese taxista ya no está disponible',
  trip_not_found: 'Este pedido ya no existe',
};
const NETWORK_ERROR = 'No se pudo asignar. Intenta de nuevo.';

interface Props {
  trip: Trip;
  drivers: Driver[];
  now: Date;
  onAssign: (driverId: string) => Promise<AssignResult>;
  onClose: () => void;
}

export function AssignDialog({ trip, drivers, now, onAssign, onClose }: Props) {
  const ranked = useMemo(() => rankDrivers(drivers, trip, now), [drivers, trip, now]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  async function assign(driverId: string) {
    setPending(true);
    setError(null);
    setConfirmId(null);
    try {
      const result = await onAssign(driverId);
      if (result.ok) {
        onClose();
        return;
      }
      setError(ERROR_MESSAGES[result.error]);
      if (result.error === 'already_assigned') setLocked(true);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-title"
        className={styles.dialog}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <header className={styles.header}>
          <div>
            <h2 id="assign-title">Asignar a</h2>
            <p>Más cerca primero</p>
            <p>
              <strong>{trip.customerName}</strong> · {trip.pickupAddress}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={`${styles.btn} ${styles.secondary}`}
            onClick={onClose}
          >
            Cerrar
          </button>
        </header>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <ul className={styles.list}>
          {ranked.map(({ driver: d, distanceKm, stale, assignable }) => {
            const label = `Asignar a ${d.name}`;
            return (
              <li key={d.id} className={styles.row} data-stale={stale ? 'true' : undefined}>
                <strong className={styles.taxi}>{d.taxiNumber}</strong>
                <span>{d.name}</span>
                <button
                  type="button"
                  aria-label={label}
                  className={styles.btn}
                  disabled={!assignable || pending || locked}
                  onClick={() => (stale ? setConfirmId(d.id) : void assign(d.id))}
                >
                  Asignar
                </button>
                <span className={styles.meta}>
                  {stale ? 'Sin señal' : driverStatusLabel(d.status)} · {formatDistanceKm(distanceKm)}
                </span>
                {confirmId === d.id && (
                  <div className={styles.confirm}>
                    <span>
                      {d.lastSeenAt === null
                        ? 'Sin señal. ¿Asignar igual?'
                        : `Sin señal ${formatLastSeen(d.lastSeenAt, now)}. ¿Asignar igual?`}
                    </span>
                    <button
                      type="button"
                      className={styles.btn}
                      disabled={pending || locked}
                      onClick={() => void assign(d.id)}
                    >
                      Asignar igual
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.secondary}`}
                      onClick={() => setConfirmId(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
