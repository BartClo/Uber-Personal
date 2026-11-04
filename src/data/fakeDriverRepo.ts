import { nextTripStatus } from '../domain/tripFlow';
import type { Driver, Trip } from '../domain/types';
import type { AdvanceResult, DriverRepo, ReportResult, SetOnlineResult } from './driverRepo';
import type { ConnectionState, Unsubscribe } from './repo';

const ACTIVE: ReadonlyArray<Trip['status']> = ['assigned', 'en_route', 'on_board'];

export function fakeDriver(id: string, patch: Partial<Driver> = {}): Driver {
  return {
    id,
    name: 'Carlos Rojas',
    taxiNumber: '07',
    phone: '555-0200',
    status: 'offline',
    lat: null,
    lng: null,
    lastSeenAt: null,
    ...patch,
  };
}

export function fakeTrip(id: string, status: Trip['status'], driverId: string | null): Trip {
  return {
    id,
    source: 'admin',
    customerName: 'Ana Pérez',
    customerPhone: '+56 9 5555 0100',
    pickupAddress: 'Av. Providencia 1234',
    pickupLat: null,
    pickupLng: null,
    dropoffAddress: 'Aeropuerto SCL',
    status,
    driverId,
    createdAt: '2026-11-03T10:00:00.000Z',
    assignedAt: driverId ? '2026-11-03T10:00:00.000Z' : null,
  };
}

export class FakeDriverRepo implements DriverRepo {
  private drivers: Driver[] = [];
  private trips: Trip[] = [];
  private subs = new Set<() => void>();
  private connSubs = new Set<(s: ConnectionState) => void>();
  private connection: ConnectionState | null = null;

  /** meId: el taxista de la sesión; null simula una cuenta sin taxi. */
  constructor(private readonly meId: string | null) {}

  getMe(): Promise<Driver | null> {
    const me = this.drivers.find((d) => d.id === this.meId);
    return Promise.resolve(me ? { ...me } : null);
  }

  getCurrentTrip(): Promise<Trip | null> {
    const trip = this.trips.find((t) => t.driverId === this.meId && ACTIVE.includes(t.status));
    return Promise.resolve(trip && this.meId ? { ...trip } : null);
  }

  subscribe(cb: () => void): Unsubscribe {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  subscribeConnection(cb: (s: ConnectionState) => void): Unsubscribe {
    this.connSubs.add(cb);
    if (this.connection) cb(this.connection);
    return () => {
      this.connSubs.delete(cb);
    };
  }

  advanceTrip(tripId: string): Promise<AdvanceResult> {
    const me = this.drivers.find((d) => d.id === this.meId);
    if (!me) return Promise.resolve({ ok: false, error: 'driver_not_found' });
    const trip = this.trips.find((t) => t.id === tripId && t.driverId === me.id);
    if (!trip) return Promise.resolve({ ok: false, error: 'trip_not_found' });
    const next = nextTripStatus(trip.status);
    if (!next) return Promise.resolve({ ok: false, error: 'not_advanceable' });
    trip.status = next;
    if (next === 'completed') me.status = 'free';
    this.emit();
    return Promise.resolve({ ok: true, trip: { ...trip } });
  }

  reportLocation(lat: number, lng: number): Promise<ReportResult> {
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) {
      return Promise.resolve({ ok: false, error: 'invalid_coordinates' });
    }
    const me = this.drivers.find((d) => d.id === this.meId);
    if (!me) return Promise.resolve({ ok: false, error: 'driver_not_found' });
    me.lat = lat;
    me.lng = lng;
    me.lastSeenAt = new Date().toISOString();
    this.emit();
    return Promise.resolve({ ok: true });
  }

  setOnline(online: boolean): Promise<SetOnlineResult> {
    const me = this.drivers.find((d) => d.id === this.meId);
    if (!me) return Promise.resolve({ ok: false, error: 'driver_not_found' });
    const active = this.trips.some((t) => t.driverId === me.id && ACTIVE.includes(t.status));
    if (!online && active) return Promise.resolve({ ok: false, error: 'active_trip' });
    me.status = !online ? 'offline' : active ? 'busy' : 'free';
    this.emit();
    return Promise.resolve({ ok: true, status: me.status });
  }

  // Control de pruebas: lo que en producción hacen el admin o la red.

  seed(data: { drivers?: Driver[]; trips?: Trip[] }): void {
    if (data.drivers) this.drivers = data.drivers.map((d) => ({ ...d }));
    if (data.trips) this.trips = data.trips.map((t) => ({ ...t }));
    this.emit();
  }

  addTrip(trip: Trip): void {
    this.trips.push({ ...trip });
    this.emit();
  }

  patchDriver(id: string, patch: Partial<Driver>): void {
    this.drivers = this.drivers.map((d) => (d.id === id ? { ...d, ...patch } : d));
    this.emit();
  }

  assign(tripId: string, driverId: string): void {
    this.trips = this.trips.map((t) =>
      t.id === tripId ? { ...t, status: 'assigned', driverId } : t,
    );
    this.patchDriver(driverId, { status: 'busy' });
  }

  tripById(id: string): Trip {
    const trip = this.trips.find((t) => t.id === id);
    if (!trip) throw new Error(`viaje desconocido: ${id}`);
    return { ...trip };
  }

  driverById(id: string): Driver {
    const driver = this.drivers.find((d) => d.id === id);
    if (!driver) throw new Error(`taxista desconocido: ${id}`);
    return { ...driver };
  }

  setConnection(s: ConnectionState): void {
    this.connection = s;
    for (const cb of [...this.connSubs]) cb(s);
  }

  private emit(): void {
    for (const cb of [...this.subs]) cb();
  }
}
