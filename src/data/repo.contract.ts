import { describe, expect, it, vi } from 'vitest';
import type { Driver, Trip } from '../domain/types';
import type { NewTripInput, SeedableRepo } from './repo';

const input: NewTripInput = {
  customerName: 'Ana',
  customerPhone: '555-0100',
  pickupAddress: 'Calle 1',
  pickupLat: 10,
  pickupLng: 20,
  dropoffAddress: 'Calle 2',
};

function driver(id: string, status: Driver['status']): Driver {
  return {
    id,
    name: `Conductor ${id}`,
    taxiNumber: `T-${id}`,
    phone: '555-0200',
    status,
    lat: 10,
    lng: 20,
    lastSeenAt: '2026-11-02T10:00:00.000Z',
  };
}

function trip(id: string, status: Trip['status'], driverId: string | null = null): Trip {
  return {
    id,
    source: 'admin',
    ...input,
    status,
    driverId,
    createdAt: '2026-11-02T10:00:00.000Z',
    assignedAt: null,
  };
}

const T1 = '00000000-0000-4000-8000-000000000001';
const D1 = '00000000-0000-4000-8000-0000000000a1';
const D2 = '00000000-0000-4000-8000-0000000000a2';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

export function runRepoContract(makeRepo: () => Promise<SeedableRepo>): void {
  describe('FleetRepo contract', () => {
    it("createTrip creates a pending trip with source 'admin' and null driverId", async () => {
      const repo = await makeRepo();
      const created = await repo.createTrip(input);
      expect(created.status).toBe('pending');
      expect(created.source).toBe('admin');
      expect(created.driverId).toBeNull();
      expect(created.assignedAt).toBeNull();
      expect(created.id).toBeTruthy();
      expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
      expect(created).toMatchObject(input);
      expect(await repo.listTrips()).toEqual([created]);
    });

    it('createTrip accepts null pickup coordinates', async () => {
      const repo = await makeRepo();
      const created = await repo.createTrip({ ...input, pickupLat: null, pickupLng: null });
      expect(created.pickupLat).toBeNull();
      expect(created.pickupLng).toBeNull();
    });

    it("assignTrip assigns a pending trip to a free driver: trip → 'assigned', driver → 'busy'", async () => {
      const repo = await makeRepo();
      await repo.seed({ drivers: [driver(D1, 'free')], trips: [trip(T1, 'pending')] });
      const res = await repo.assignTrip(T1, D1);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.trip.status).toBe('assigned');
        expect(res.trip.driverId).toBe(D1);
        expect(Number.isNaN(Date.parse(res.trip.assignedAt ?? ''))).toBe(false);
      }
      const trips = await repo.listTrips();
      expect(trips.find((t) => t.id === T1)?.status).toBe('assigned');
      const drivers = await repo.listDrivers();
      expect(drivers.find((d) => d.id === D1)?.status).toBe('busy');
    });

    it('assignTrip returns already_assigned when the trip is not pending', async () => {
      const repo = await makeRepo();
      await repo.seed({
        drivers: [driver(D1, 'busy'), driver(D2, 'free')],
        trips: [trip(T1, 'assigned', D1)],
      });
      expect(await repo.assignTrip(T1, D2)).toEqual({ ok: false, error: 'already_assigned' });
    });

    it('assignTrip returns driver_unavailable when the driver is busy', async () => {
      const repo = await makeRepo();
      await repo.seed({ drivers: [driver(D1, 'busy')], trips: [trip(T1, 'pending')] });
      expect(await repo.assignTrip(T1, D1)).toEqual({ ok: false, error: 'driver_unavailable' });
      expect((await repo.listTrips())[0]?.status).toBe('pending');
    });

    it('assignTrip returns driver_unavailable when the driver is offline', async () => {
      const repo = await makeRepo();
      await repo.seed({ drivers: [driver(D1, 'offline')], trips: [trip(T1, 'pending')] });
      expect(await repo.assignTrip(T1, D1)).toEqual({ ok: false, error: 'driver_unavailable' });
    });

    it('assignTrip returns trip_not_found for an unknown id', async () => {
      const repo = await makeRepo();
      await repo.seed({ drivers: [driver(D1, 'free')] });
      expect(await repo.assignTrip(UNKNOWN, D1)).toEqual({ ok: false, error: 'trip_not_found' });
    });

    it('two concurrent assignTrip calls for the same trip: exactly one ok, one already_assigned', async () => {
      const repo = await makeRepo();
      await repo.seed({
        drivers: [driver(D1, 'free'), driver(D2, 'free')],
        trips: [trip(T1, 'pending')],
      });
      const results = await Promise.all([repo.assignTrip(T1, D1), repo.assignTrip(T1, D2)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const failed = results.filter((r) => !r.ok);
      expect(failed).toEqual([{ ok: false, error: 'already_assigned' }]);
    });

    it('cancelTrip cancels a pending trip without touching drivers', async () => {
      const repo = await makeRepo();
      await repo.seed({ drivers: [driver(D1, 'free')], trips: [trip(T1, 'pending')] });
      const res = await repo.cancelTrip(T1);
      expect(res.ok && res.trip.status).toBe('cancelled');
      expect((await repo.listTrips())[0]?.status).toBe('cancelled');
      expect((await repo.listDrivers())[0]?.status).toBe('free');
    });

    it.each(['assigned', 'en_route', 'on_board'] as const)(
      'cancelTrip on %s frees the busy driver and keeps the link to the trip',
      async (status) => {
        const repo = await makeRepo();
        await repo.seed({ drivers: [driver(D1, 'busy')], trips: [trip(T1, status, D1)] });
        const res = await repo.cancelTrip(T1);
        expect(res.ok && res.trip.status).toBe('cancelled');
        expect(res.ok && res.trip.driverId).toBe(D1);
        expect((await repo.listDrivers())[0]?.status).toBe('free');
      },
    );

    it('cancelTrip leaves a driver who is not busy as they are', async () => {
      const repo = await makeRepo();
      await repo.seed({ drivers: [driver(D1, 'offline')], trips: [trip(T1, 'assigned', D1)] });
      expect((await repo.cancelTrip(T1)).ok).toBe(true);
      expect((await repo.listDrivers())[0]?.status).toBe('offline');
    });

    it.each(['completed', 'cancelled'] as const)(
      'cancelTrip returns not_cancellable for a %s trip',
      async (status) => {
        const repo = await makeRepo();
        await repo.seed({ drivers: [driver(D1, 'free')], trips: [trip(T1, status, D1)] });
        expect(await repo.cancelTrip(T1)).toEqual({ ok: false, error: 'not_cancellable' });
        expect((await repo.listTrips())[0]?.status).toBe(status);
        expect((await repo.listDrivers())[0]?.status).toBe('free');
      },
    );

    it('cancelTrip returns trip_not_found for an unknown id', async () => {
      const repo = await makeRepo();
      expect(await repo.cancelTrip(UNKNOWN)).toEqual({ ok: false, error: 'trip_not_found' });
    });

    it('subscribeTrips calls back after createTrip; unsubscribe stops callbacks', async () => {
      const repo = await makeRepo();
      const cb = vi.fn<(t: Trip[]) => void>();
      const unsubscribe = repo.subscribeTrips(cb);
      const created = await repo.createTrip(input);
      await vi.waitFor(() => {
        expect(cb).toHaveBeenCalled();
      });
      const last = cb.mock.calls[cb.mock.calls.length - 1]?.[0] ?? [];
      expect(last.some((t) => t.id === created.id)).toBe(true);

      unsubscribe();
      const before = cb.mock.calls.length;
      await repo.createTrip(input);
      await new Promise((r) => setTimeout(r, 50));
      expect(cb.mock.calls.length).toBe(before);
    });
  });
}
