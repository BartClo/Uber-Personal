import { describe, expect, it } from 'vitest';
import { rankDrivers } from './rankDrivers';
import type { Driver, Trip } from './types';

const now = new Date('2026-11-02T12:00:00Z');
const mk = (o: Partial<Driver>): Driver => ({
  id: 'd', name: 'N', taxiNumber: '1', phone: '1', status: 'free',
  lat: -33.4, lng: -70.6, lastSeenAt: '2026-11-02T11:59:50Z', ...o,
});
const trip = (o: Partial<Trip> = {}): Trip => ({
  id: 't', source: 'admin', customerName: 'C', customerPhone: '1', pickupAddress: 'A',
  pickupLat: -33.4, pickupLng: -70.6, dropoffAddress: 'B', status: 'pending',
  driverId: null, createdAt: '2026-11-02T11:00:00Z', assignedAt: null, ...o,
});

describe('rankDrivers', () => {
  it('free a 1 km va antes que free a 3 km', () => {
    const far = mk({ id: 'far', lat: -33.4 + 3 / 111.2 });
    const near = mk({ id: 'near', lat: -33.4 + 1 / 111.2 });
    const r = rankDrivers([far, near], trip(), now);
    expect(r.map((x) => x.driver.id)).toEqual(['near', 'far']);
    expect(r[0]?.distanceKm).toBeCloseTo(1, 1);
  });
  it('offline y busy no son asignables y van al final', () => {
    const r = rankDrivers(
      [mk({ id: 'o', status: 'offline' }), mk({ id: 'b', status: 'busy' }), mk({ id: 'f' })],
      trip(),
      now,
    );
    expect(r.map((x) => x.driver.id)).toEqual(['f', 'o', 'b']);
    expect(r[1]?.assignable).toBe(false);
    expect(r[2]?.assignable).toBe(false);
  });
  it('señal vieja va después de los vigentes aunque esté más cerca', () => {
    const r = rankDrivers(
      [mk({ id: 'old', lastSeenAt: '2026-11-02T11:50:00Z' }), mk({ id: 'fresh', lat: -33.3 })],
      trip(),
      now,
    );
    expect(r.map((x) => x.driver.id)).toEqual(['fresh', 'old']);
    expect(r[1]?.stale).toBe(true);
  });
  it('sin coordenadas: distancias null y orden estable', () => {
    const r = rankDrivers(
      [mk({ id: 'a' }), mk({ id: 'b' }), mk({ id: 'c' })],
      trip({ pickupLat: null, pickupLng: null }),
      now,
    );
    expect(r.map((x) => x.distanceKm)).toEqual([null, null, null]);
    expect(r.map((x) => x.driver.id)).toEqual(['a', 'b', 'c']);
  });
  it('distancia null queda al final del grupo', () => {
    const r = rankDrivers([mk({ id: 'n', lat: null, lng: null }), mk({ id: 'k' })], trip(), now);
    expect(r.map((x) => x.driver.id)).toEqual(['k', 'n']);
  });
});
