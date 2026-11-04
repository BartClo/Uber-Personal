'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdvanceError, DriverRepo } from '@/data/driverRepo';
import type { ConnectionState } from '@/data/repo';
import { formatLastSeen } from '@/domain/freshness';
import { driverStatusLabel, tripStatusLabel } from '@/domain/labels';
import { driverActionLabel, TRIP_STEPS, tripStepIndex } from '@/domain/tripFlow';
import type { Driver, Trip } from '@/domain/types';
import { wazeUrl } from '@/domain/waze';
import { ConnectionBanner } from './ConnectionBanner';
import styles from './DriverApp.module.css';
import {
  LOCATION_LABELS,
  useDriverLocation,
  useWakeLock,
  type GeolocationLike,
  type LocationState,
  type WakeLockLike,
} from './useDriverLocation';

const ADVANCE_ERRORS: Record<AdvanceError, string> = {
  driver_not_found: 'Tu cuenta ya no está vinculada a un taxi.',
  trip_not_found: 'Este viaje ya no está asignado a ti.',
  not_advanceable: 'Este viaje cambió de estado. Revisa la información actualizada.',
};
const NETWORK_ERROR = 'No se pudo actualizar. Revisa tu conexión e intenta de nuevo.';
/**
 * El botón principal cambia de etiqueta en su sitio al avanzar: sin esta pausa, el segundo toque
 * de un doble toque contaría como la acción siguiente y se saltaría un estado del viaje.
 */
const ADVANCE_COOLDOWN_MS = 800;
/** RLS oculta el evento de un viaje que deja de estar en curso (p. ej. si el admin lo cancela). */
const REFRESH_EVERY_MS = 15_000;

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; me: Driver | null; trip: Trip | null };

export function DriverApp({
  repo,
  geolocation,
  wakeLock,
  onSignOut,
  advanceCooldownMs = ADVANCE_COOLDOWN_MS,
}: {
  repo: DriverRepo;
  geolocation: GeolocationLike | null;
  wakeLock: WakeLockLike | null;
  onSignOut: () => void;
  advanceCooldownMs?: number;
}) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [connection, setConnection] = useState<ConnectionState>('connected');
  const seq = useRef(0);

  // Las respuestas pueden llegar fuera de orden: solo vale la de la lectura más reciente.
  const refresh = useCallback(async (): Promise<void> => {
    const current = ++seq.current;
    try {
      const [me, trip] = await Promise.all([repo.getMe(), repo.getCurrentTrip()]);
      if (current === seq.current) setLoad({ kind: 'ready', me, trip });
    } catch (e) {
      console.error('[DriverApp] refresh', e);
      // Con datos en pantalla, mejor conservarlos: el banner informa de la conexión.
      if (current === seq.current) setLoad((l) => (l.kind === 'ready' ? l : { kind: 'error' }));
    }
  }, [repo]);

  useEffect(() => {
    const offChanges = repo.subscribe(() => void refresh());
    const offConnection = repo.subscribeConnection(setConnection);
    void Promise.resolve().then(refresh);
    const timer = setInterval(() => void refresh(), REFRESH_EVERY_MS);
    return () => {
      clearInterval(timer);
      offChanges();
      offConnection();
    };
  }, [repo, refresh]);

  const me = load.kind === 'ready' ? load.me : null;
  const online = me !== null && me.status !== 'offline';
  const report = useCallback(
    (lat: number, lng: number) => repo.reportLocation(lat, lng),
    [repo],
  );
  const location = useDriverLocation({ geolocation, report, enabled: online });
  useWakeLock(wakeLock, online);

  if (load.kind === 'loading') {
    return (
      <p role="status" className={styles.message}>
        Cargando…
      </p>
    );
  }
  if (load.kind === 'error') {
    return (
      <main className={styles.message}>
        <p role="alert">No se pudo cargar tu información. Revisa tu conexión.</p>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            setLoad({ kind: 'loading' });
            void refresh();
          }}
        >
          Reintentar
        </button>
      </main>
    );
  }
  if (!load.me) {
    return (
      <main className={styles.message}>
        <p role="alert">Esta cuenta no está vinculada a un taxi. Avísale al administrador.</p>
        <button type="button" className={styles.secondary} onClick={onSignOut}>
          Cerrar sesión
        </button>
      </main>
    );
  }

  return (
    <Screen
      me={load.me}
      trip={load.trip}
      repo={repo}
      refresh={refresh}
      connection={connection}
      location={location}
      onSignOut={onSignOut}
      advanceCooldownMs={advanceCooldownMs}
    />
  );
}

function Screen({
  me,
  trip,
  repo,
  refresh,
  connection,
  location,
  onSignOut,
  advanceCooldownMs,
}: {
  me: Driver;
  trip: Trip | null;
  repo: DriverRepo;
  refresh: () => Promise<void>;
  connection: ConnectionState;
  location: LocationState;
  onSignOut: () => void;
  advanceCooldownMs: number;
}) {
  const online = me.status !== 'offline';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Una sola acción a la vez: un doble toque no debe saltarse un estado del viaje. */
  async function run(action: () => Promise<string | null>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const message = await action();
      setError(message);
      await refresh();
    } catch (e) {
      console.error('[DriverApp] action', e);
      setError(NETWORK_ERROR);
      // Quizá la acción sí se aplicó y solo se perdió la respuesta: muestra el estado real.
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const toggleOnline = () =>
    run(async () => {
      const res = await repo.setOnline(!online);
      if (res.ok) return null;
      return res.error === 'active_trip'
        ? 'No puedes desconectarte con un viaje activo. Finalízalo primero.'
        : ADVANCE_ERRORS.driver_not_found;
    });

  const advance = ({ id, status }: Trip) =>
    run(async () => {
      const res = await repo.advanceTrip(id, status);
      if (!res.ok) return ADVANCE_ERRORS[res.error];
      await refresh();
      await new Promise((r) => setTimeout(r, advanceCooldownMs));
      return null;
    });

  async function signOut(): Promise<void> {
    // Sin esto seguiría figurando libre y el admin podría asignarle viajes.
    if (online && !trip) await repo.setOnline(false).catch(() => undefined);
    onSignOut();
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <h1 className={styles.name}>
            <span className={styles.badge}>{me.taxiNumber}</span> {me.name}
          </h1>
          <button
            type="button"
            role="switch"
            aria-checked={online}
            aria-label="Conectado"
            className={styles.toggle}
            disabled={busy}
            onClick={() => void toggleOnline()}
          >
            <span aria-hidden="true">Conectado</span>
            <span className={online ? styles.toggleOn : styles.toggleOff}>
              {online ? 'Sí' : 'No'}
            </span>
          </button>
        </div>
        <p className={styles.meta}>
          <span>Taxi {me.taxiNumber}</span>
          <span aria-hidden="true">·</span>
          <span>{driverStatusLabel(me.status)}</span>
        </p>
        <p className={location === 'active' ? styles.locationOk : styles.locationWarn}>
          <span aria-hidden="true">{location === 'active' ? '● ' : '▲ '}</span>
          <span role="status">{LOCATION_LABELS[location]}</span>
        </p>
      </header>

      <ConnectionBanner state={connection} />

      <main className={styles.main}>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {trip ? (
          <TripCard trip={trip} busy={busy} onAdvance={() => void advance(trip)} />
        ) : (
          <section className={styles.waiting}>
            <h2>{online ? 'Esperando un viaje' : 'Estás desconectado'}</h2>
            <p>
              {online
                ? 'Cuando te asignen un viaje aparecerá aquí.'
                : 'Conéctate para recibir viajes.'}
            </p>
          </section>
        )}
        <p role="status" className="visually-hidden">
          {trip ? `Viaje: ${tripStatusLabel(trip.status)}` : ''}
        </p>
        {online && (
          <p className={styles.notice}>
            Mantén esta app abierta y en primer plano: tu ubicación solo se envía mientras está
            abierta.
          </p>
        )}
        <button type="button" className={styles.signOut} onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </main>
    </div>
  );
}

function TripCard({
  trip,
  busy,
  onAdvance,
}: {
  trip: Trip;
  busy: boolean;
  onAdvance: () => void;
}) {
  const action = driverActionLabel(trip.status);
  return (
    <section className={styles.card} aria-labelledby="trip-title">
      <h2 id="trip-title" className={styles.cardTitle}>
        Viaje asignado · <Elapsed since={trip.assignedAt ?? trip.createdAt} />
      </h2>
      <dl className={styles.details}>
        <div>
          <dt>Cliente</dt>
          <dd className={styles.customer}>{trip.customerName}</dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{trip.customerPhone}</dd>
        </div>
        <div>
          <dt>Origen</dt>
          <dd>{trip.pickupAddress}</dd>
        </div>
        <div>
          <dt>Destino</dt>
          <dd>{trip.dropoffAddress}</dd>
        </div>
      </dl>
      <Stepper trip={trip} />
      {action && (
        <button type="button" className={styles.primary} disabled={busy} onClick={onAdvance}>
          {action}
        </button>
      )}
      <div className={styles.links}>
        <a className={styles.secondary} href={`tel:${trip.customerPhone.replace(/[^\d+]/g, '')}`}>
          Llamar al cliente
        </a>
        <a className={styles.secondary} href={wazeUrl(trip)} target="_blank" rel="noreferrer">
          Abrir navegación
        </a>
      </div>
    </section>
  );
}

function Stepper({ trip }: { trip: Trip }) {
  const current = tripStepIndex(trip.status);
  return (
    <ol className={styles.stepper} aria-label="Progreso del viaje" role="list">
      {TRIP_STEPS.map((label, i) => {
        const done = i < current;
        const isCurrent = i === current;
        return (
          <li
            key={label}
            aria-current={isCurrent ? 'step' : undefined}
            className={isCurrent ? styles.stepCurrent : done ? styles.stepDone : styles.step}
          >
            <span className={styles.stepNumber}>
              {done && <span aria-hidden="true">✓ </span>}
              {i + 1}
              <span className="visually-hidden"> ·</span>
            </span>{' '}
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Aislado para que el reloj de 1 s no re-renderice toda la pantalla. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{formatLastSeen(since, now)}</>;
}
