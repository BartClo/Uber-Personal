import type { Driver, Trip } from '../domain/types';

export type AssignError = 'already_assigned' | 'driver_unavailable' | 'trip_not_found';
export type AssignResult = { ok: true; trip: Trip } | { ok: false; error: AssignError };
export type NewTripInput = Pick<
  Trip,
  | 'customerName'
  | 'customerPhone'
  | 'pickupAddress'
  | 'pickupLat'
  | 'pickupLng'
  | 'dropoffAddress'
>;
export type Unsubscribe = () => void;
export type ConnectionState = 'connected' | 'reconnecting';

export interface FleetRepo {
  listDrivers(): Promise<Driver[]>;
  listTrips(): Promise<Trip[]>;
  subscribeDrivers(cb: (d: Driver[]) => void): Unsubscribe;
  subscribeTrips(cb: (t: Trip[]) => void): Unsubscribe;
  subscribeConnection(cb: (s: ConnectionState) => void): Unsubscribe;
  createTrip(input: NewTripInput): Promise<Trip>;
  assignTrip(tripId: string, driverId: string): Promise<AssignResult>;
}

export type SeedableRepo = FleetRepo & {
  seed(data: { drivers?: Driver[]; trips?: Trip[] }): Promise<void> | void;
};
