import type { Driver, DriverStatus, Trip, TripStatus } from '../domain/types';
import type { ConnectionState, Unsubscribe } from './repo';

export type AdvanceError = 'driver_not_found' | 'trip_not_found' | 'not_advanceable';
export type AdvanceResult = { ok: true; trip: Trip } | { ok: false; error: AdvanceError };

export type ReportError = 'driver_not_found' | 'invalid_coordinates';
export type ReportResult = { ok: true } | { ok: false; error: ReportError };

export type SetOnlineError = 'driver_not_found' | 'active_trip';
export type SetOnlineResult =
  { ok: true; status: DriverStatus } | { ok: false; error: SetOnlineError };

/** Todo lo que el taxista conectado puede ver y hacer. No existe la acción de rechazar. */
export interface DriverRepo {
  /** El taxista vinculado a la sesión; null si la cuenta no tiene taxi. */
  getMe(): Promise<Driver | null>;
  /** El viaje activo (assigned, en_route u on_board) del taxista, o null. */
  getCurrentTrip(): Promise<Trip | null>;
  /** Avisa que algo cambió; quien escucha vuelve a leer. */
  subscribe(cb: () => void): Unsubscribe;
  subscribeConnection(cb: (s: ConnectionState) => void): Unsubscribe;
  /** expectedStatus: el estado que el taxista está viendo; si ya cambió, no se avanza. */
  advanceTrip(tripId: string, expectedStatus: TripStatus): Promise<AdvanceResult>;
  reportLocation(lat: number, lng: number): Promise<ReportResult>;
  setOnline(online: boolean): Promise<SetOnlineResult>;
}
