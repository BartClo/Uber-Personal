'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ConnectionState, FleetRepo, NewTripInput } from '@/data/repo';
import type { Driver, Trip } from '@/domain/types';
import { AssignDialog } from './AssignDialog';
import { ConnectionBanner } from './ConnectionBanner';
import { DriverList } from './DriverList';
import { FleetMap } from './FleetMap';
import { Header } from './Header';
import { NewTripForm } from './NewTripForm';
import { TripQueue } from './TripQueue';
import styles from './Dashboard.module.css';

export function Dashboard({ repo }: { repo: FleetRepo }) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connected');
  const [now, setNow] = useState(() => new Date());
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(true);

  useEffect(() => {
    const offD = repo.subscribeDrivers(setDrivers);
    const offT = repo.subscribeTrips(setTrips);
    const offC = repo.subscribeConnection(setConnection);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => {
      offD();
      offT();
      offC();
      clearInterval(timer);
    };
  }, [repo]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([repo.listDrivers(), repo.listTrips()]).then(
      ([d, t]) => {
        if (cancelled) return;
        setDrivers(d);
        setTrips(t);
        setLoadFailed(false);
      },
      () => {
        if (!cancelled) setLoadFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repo, loadKey]);

  const createTrip = useCallback(
    async (input: NewTripInput) => {
      await repo.createTrip(input);
    },
    [repo],
  );

  // Look up by id so live updates flow into the open dialog.
  const selectedTrip = selectedTripId ? trips.find((t) => t.id === selectedTripId) : undefined;

  return (
    <div className={styles.shell}>
      <Header drivers={drivers} now={now} connection={connection} />
      <ConnectionBanner state={connection} />
      {loadFailed && (
        <div role="alert" className={styles.loadError}>
          <p>No se pudieron cargar los datos.</p>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              setLoadFailed(false);
              setLoadKey((k) => k + 1);
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      <main className={styles.grid}>
        <div className={styles.drivers}>
          <DriverList drivers={drivers} now={now} />
        </div>
        <div className={styles.map}>
          <FleetMap
            drivers={drivers}
            trips={trips}
            now={now}
            selectedDriverId={selectedDriverId}
            onSelectDriver={setSelectedDriverId}
          />
        </div>
        <div className={styles.trips}>
          <button
            type="button"
            className={styles.button}
            aria-expanded={formOpen}
            aria-controls="new-trip-panel"
            onClick={() => setFormOpen((o) => !o)}
          >
            Nuevo pedido
          </button>
          <div id="new-trip-panel" hidden={!formOpen}>
            {formOpen && <NewTripForm onSubmit={createTrip} />}
          </div>
          <TripQueue
            trips={trips}
            drivers={drivers}
            now={now}
            onAssignClick={(t) => setSelectedTripId(t.id)}
          />
        </div>
      </main>
      {selectedTrip && (
        <AssignDialog
          trip={selectedTrip}
          drivers={drivers}
          now={now}
          onAssign={(driverId) => repo.assignTrip(selectedTrip.id, driverId)}
          onClose={() => setSelectedTripId(null)}
        />
      )}
    </div>
  );
}
