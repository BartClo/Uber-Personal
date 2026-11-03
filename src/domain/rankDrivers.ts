import { haversineKm } from './distance';
import { isStale } from './freshness';
import type { Driver, Trip } from './types';

export interface RankedDriver {
  driver: Driver;
  distanceKm: number | null;
  stale: boolean;
  assignable: boolean;
}

// Solo ayuda visual: ordena sugerencias, nunca asigna.
export function rankDrivers(drivers: Driver[], trip: Trip, now: Date): RankedDriver[] {
  const hasPickup = trip.pickupLat !== null && trip.pickupLng !== null;
  const ranked = drivers.map((driver, index): RankedDriver & { index: number } => ({
    driver,
    index,
    stale: isStale(driver.lastSeenAt, now),
    assignable: driver.status === 'free',
    distanceKm:
      hasPickup && driver.lat !== null && driver.lng !== null
        ? haversineKm(
            { lat: trip.pickupLat as number, lng: trip.pickupLng as number },
            { lat: driver.lat, lng: driver.lng },
          )
        : null,
  }));
  const group = (r: RankedDriver): number => (!r.assignable ? 2 : r.stale ? 1 : 0);
  ranked.sort((a, b) => {
    const g = group(a) - group(b);
    if (g !== 0) return g;
    if (group(a) < 2 && a.distanceKm !== b.distanceKm) {
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    }
    return a.index - b.index;
  });
  return ranked.map(({ driver, distanceKm, stale, assignable }) => ({
    driver,
    distanceKm,
    stale,
    assignable,
  }));
}
