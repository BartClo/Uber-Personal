'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPhotonGeocoder, type Geocoder } from '@/data/geocoder';
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

export function Dashboard({ repo, geocoder }: { repo: FleetRepo; geocoder?: Geocoder }) {
  const [defaultGeocoder] = useState(() => createPhotonGeocoder());
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connected');
  const [now, setNow] = useState(() => new Date());
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Collections already delivered by a subscription: a late initial load must not overwrite them.
  const delivered = useRef({ drivers: false, trips: false });

  useEffect(() => {
    delivered.current = { drivers: false, trips: false };
    const offD = repo.subscribeDrivers((d) => {
      delivered.current.drivers = true;
      setDrivers(d);
    });
    const offT = repo.subscribeTrips((t) => {
      delivered.current.trips = true;
      setTrips(t);
      setSelectedTripId((id) => (id && !t.some((x) => x.id === id) ? null : id));
    });
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
        if (!delivered.current.drivers) setDrivers(d);
        if (!delivered.current.trips) setTrips(t);
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
      setFormOpen(false);
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
        <div className={`${styles.pane} ${styles.drivers}`}>
          <DriverList
            drivers={drivers}
            now={now}
            selectedDriverId={selectedDriverId}
            onSelectDriver={setSelectedDriverId}
          />
        </div>
        <div className={styles.map}>
          <FleetMap
            drivers={drivers}
            trips={trips}
            now={now}
            selectedDriverId={selectedDriverId}
            onSelectDriver={setSelectedDriverId}
            focusTrip={selectedTrip ?? null}
          />
        </div>
        <div className={`${styles.pane} ${styles.trips}`}>
          <div className={styles.tripsTop}>
            <h2>Pedidos</h2>
            <button
              type="button"
              className={styles.button}
              aria-expanded={formOpen}
              aria-controls="new-trip-panel"
              onClick={() => setFormOpen((o) => !o)}
            >
              Nuevo pedido
            </button>
          </div>
          <div id="new-trip-panel" hidden={!formOpen} className={styles.formPanel}>
            {formOpen && <NewTripForm onSubmit={createTrip} geocoder={geocoder ?? defaultGeocoder} />}
          </div>
          <div className={styles.tripsScroll}>
            <TripQueue
              trips={trips}
              drivers={drivers}
              now={now}
              onAssignClick={(t) => setSelectedTripId(t.id)}
              onCancel={(tripId) => repo.cancelTrip(tripId)}
            />
          </div>
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
