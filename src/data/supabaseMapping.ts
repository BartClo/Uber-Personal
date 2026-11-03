import type { Driver, DriverStatus, Trip, TripSource, TripStatus } from '../domain/types';
import type { NewTripInput } from './repo';

export interface DriverRow {
  id: string;
  name: string;
  taxi_number: string;
  phone: string;
  status: DriverStatus;
  lat: number | null;
  lng: number | null;
  last_seen_at: string | null;
}

export interface TripRow {
  id: string;
  source: TripSource;
  customer_name: string;
  customer_phone: string;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string;
  status: TripStatus;
  driver_id: string | null;
  created_at: string;
  assigned_at: string | null;
}

export type NewTripRow = Pick<
  TripRow,
  | 'source'
  | 'customer_name'
  | 'customer_phone'
  | 'pickup_address'
  | 'pickup_lat'
  | 'pickup_lng'
  | 'dropoff_address'
>;

/** Normaliza un timestamp de Postgres a ISO 8601 UTC. */
export function toIso(value: string): string {
  return new Date(value).toISOString();
}

function toIsoOrNull(value: string | null): string | null {
  return value === null ? null : toIso(value);
}

export function rowToDriver(row: DriverRow): Driver {
  return {
    id: row.id,
    name: row.name,
    taxiNumber: row.taxi_number,
    phone: row.phone,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    lastSeenAt: toIsoOrNull(row.last_seen_at),
  };
}

export function driverToRow(d: Driver): DriverRow {
  return {
    id: d.id,
    name: d.name,
    taxi_number: d.taxiNumber,
    phone: d.phone,
    status: d.status,
    lat: d.lat,
    lng: d.lng,
    last_seen_at: d.lastSeenAt,
  };
}

export function rowToTrip(row: TripRow): Trip {
  return {
    id: row.id,
    source: row.source,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    pickupAddress: row.pickup_address,
    pickupLat: row.pickup_lat,
    pickupLng: row.pickup_lng,
    dropoffAddress: row.dropoff_address,
    status: row.status,
    driverId: row.driver_id,
    createdAt: toIso(row.created_at),
    assignedAt: toIsoOrNull(row.assigned_at),
  };
}

export function tripToRow(t: Trip): TripRow {
  return {
    id: t.id,
    source: t.source,
    customer_name: t.customerName,
    customer_phone: t.customerPhone,
    pickup_address: t.pickupAddress,
    pickup_lat: t.pickupLat,
    pickup_lng: t.pickupLng,
    dropoff_address: t.dropoffAddress,
    status: t.status,
    driver_id: t.driverId,
    created_at: t.createdAt,
    assigned_at: t.assignedAt,
  };
}

/** Viajes creados desde el panel: source 'admin' explícito. */
export function inputToRow(input: NewTripInput): NewTripRow {
  return {
    source: 'admin',
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    pickup_address: input.pickupAddress,
    pickup_lat: input.pickupLat,
    pickup_lng: input.pickupLng,
    dropoff_address: input.dropoffAddress,
  };
}
