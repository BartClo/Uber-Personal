'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clientStatusMessage } from '@/domain/clientTrip';
import type { ClientRepo, ClientTripView } from '@/data/clientRepo';
import type { TripStatus } from '@/domain/types';
import styles from './Client.module.css';

interface Props {
  repo: ClientRepo;
  token: string;
  /** Polling interval in ms (injectable for tests). */
  pollMs?: number;
}

const STEPS: { status: TripStatus; label: string }[] = [
  { status: 'pending', label: 'Pedido recibido' },
  { status: 'assigned', label: 'Taxi asignado' },
  { status: 'en_route', label: 'En camino' },
  { status: 'on_board', label: 'En viaje' },
  { status: 'completed', label: 'Finalizado' },
];

const FINAL: TripStatus[] = ['completed', 'cancelled'];

export function TrackingScreen({ repo, token, pollMs = 5000 }: Props) {
  const [trip, setTrip] = useState<ClientTripView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    async function poll() {
      try {
        const r = await repo.getStatus(token);
        if (!active) return;
        setReconnecting(false);
        if (!r.ok) {
          setNotFound(true);
          stop();
          return;
        }
        setTrip(r.trip);
        if (FINAL.includes(r.trip.status)) stop();
      } catch {
        if (active) setReconnecting(true);
      }
    }
    void poll();
    timer = setInterval(() => void poll(), pollMs);
    return () => {
      active = false;
      stop();
    };
  }, [repo, token, pollMs]);

  if (notFound) {
    return (
      <main className={styles.page}>
        <h1 className={styles.brand}>Despacho</h1>
        <p role="alert" className={styles.formError}>
          No encontramos este viaje. Revisa el enlace o pide un taxi de nuevo.
        </p>
        <Link className={styles.link} href="/pedir">
          Pedir taxi
        </Link>
      </main>
    );
  }

  const currentIndex = trip ? STEPS.findIndex((s) => s.status === trip.status) : -1;

  return (
    <main className={styles.page}>
      <h1 className={styles.brand}>Despacho</h1>
      <h2 className={styles.title}>Tu viaje</h2>
      <div role="status" aria-live="polite" className={styles.statusBox}>
        {trip ? clientStatusMessage(trip.status) : 'Cargando…'}
      </div>
      {reconnecting ? (
        <p role="status" className={styles.notice}>
          Reconectando…
        </p>
      ) : null}
      {trip?.driver ? (
        <p className={styles.driver}>{`Taxi ${trip.driver.taxiNumber} · ${trip.driver.firstName}`}</p>
      ) : null}
      {trip && trip.status !== 'cancelled' ? (
        <ol className={styles.steps} aria-label="Progreso del viaje">
          {STEPS.map((s, i) => {
            const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo';
            return (
              <li
                key={s.status}
                className={`${styles.step} ${styles[state]}`}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <span aria-hidden="true" className={styles.mark}>
                  {state === 'done' ? '✓' : state === 'current' ? '●' : '○'}
                </span>
                {s.label}
                <span className="visually-hidden">
                  {state === 'done' ? ' (completado)' : state === 'current' ? ' (actual)' : ' (pendiente)'}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {trip ? (
        <dl className={styles.addresses}>
          <dt>Recogida</dt>
          <dd>{trip.pickupAddress}</dd>
          <dt>Destino</dt>
          <dd>{trip.dropoffAddress}</dd>
        </dl>
      ) : null}
    </main>
  );
}
