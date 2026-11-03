import type { Driver, Trip } from '../domain/types';
import type {
  AssignResult,
  ConnectionState,
  NewTripInput,
  SeedableRepo,
  Unsubscribe,
} from './repo';

export class FakeRepo implements SeedableRepo {
  private drivers: Driver[] = [];
  private trips: Trip[] = [];
  private driverSubs = new Set<(d: Driver[]) => void>();
  private tripSubs = new Set<(t: Trip[]) => void>();
  private connSubs = new Set<(s: ConnectionState) => void>();

  listDrivers(): Promise<Driver[]> {
    return Promise.resolve(this.drivers.map((d) => ({ ...d })));
  }

  listTrips(): Promise<Trip[]> {
    return Promise.resolve(this.trips.map((t) => ({ ...t })));
  }

  subscribeDrivers(cb: (d: Driver[]) => void): Unsubscribe {
    this.driverSubs.add(cb);
    return () => {
      this.driverSubs.delete(cb);
    };
  }

  subscribeTrips(cb: (t: Trip[]) => void): Unsubscribe {
    this.tripSubs.add(cb);
    return () => {
      this.tripSubs.delete(cb);
    };
  }

  subscribeConnection(cb: (s: ConnectionState) => void): Unsubscribe {
    this.connSubs.add(cb);
    return () => {
      this.connSubs.delete(cb);
    };
  }

  createTrip(input: NewTripInput): Promise<Trip> {
    const trip: Trip = {
      id: crypto.randomUUID(),
      source: 'admin',
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      pickupAddress: input.pickupAddress,
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      dropoffAddress: input.dropoffAddress,
      status: 'pending',
      driverId: null,
      createdAt: new Date().toISOString(),
      assignedAt: null,
    };
    this.trips.push(trip);
    this.emitTrips();
    return Promise.resolve({ ...trip });
  }

  assignTrip(tripId: string, driverId: string): Promise<AssignResult> {
    // Check and mutate in one synchronous block: atomic.
    const trip = this.trips.find((t) => t.id === tripId);
    if (!trip) return Promise.resolve({ ok: false, error: 'trip_not_found' });
    if (trip.status !== 'pending') {
      return Promise.resolve({ ok: false, error: 'already_assigned' });
    }
    const driver = this.drivers.find((d) => d.id === driverId);
    if (!driver || driver.status !== 'free') {
      return Promise.resolve({ ok: false, error: 'driver_unavailable' });
    }
    trip.status = 'assigned';
    trip.driverId = driver.id;
    trip.assignedAt = new Date().toISOString();
    driver.status = 'busy';
    this.emitDrivers();
    this.emitTrips();
    return Promise.resolve({ ok: true, trip: { ...trip } });
  }

  seed(data: { drivers?: Driver[]; trips?: Trip[] }): void {
    if (data.drivers) this.drivers = data.drivers.map((d) => ({ ...d }));
    if (data.trips) this.trips = data.trips.map((t) => ({ ...t }));
    this.emitDrivers();
    this.emitTrips();
  }

  setConnection(s: ConnectionState): void {
    for (const cb of [...this.connSubs]) cb(s);
  }

  private emitDrivers(): void {
    for (const cb of [...this.driverSubs]) cb(this.drivers.map((d) => ({ ...d })));
  }

  private emitTrips(): void {
    for (const cb of [...this.tripSubs]) cb(this.trips.map((t) => ({ ...t })));
  }
}
