import { describe, expect, it } from 'vitest';
import {
  driverToRow,
  inputToRow,
  rowToDriver,
  rowToTrip,
  tripToRow,
  type DriverRow,
  type TripRow,
} from './supabaseMapping';

const driverRow: DriverRow = {
  id: 'd1',
  name: 'Luis',
  taxi_number: '07',
  phone: '555',
  status: 'free',
  lat: -33.45,
  lng: -70.66,
  last_seen_at: '2026-11-02 10:00:00+00',
};

const tripRow: TripRow = {
  id: 't1',
  source: 'client_app',
  customer_name: 'Ana',
  customer_phone: '555-0100',
  pickup_address: 'Calle 1',
  pickup_lat: null,
  pickup_lng: null,
  dropoff_address: 'Calle 2',
  status: 'assigned',
  driver_id: 'd1',
  created_at: '2026-11-02T07:00:00-03:00',
  assigned_at: '2026-11-02T10:05:00.123456+00:00',
};

describe('supabaseMapping', () => {
  it('rowToDriver maps to camelCase and normalizes last_seen_at to ISO UTC', () => {
    expect(rowToDriver(driverRow)).toEqual({
      id: 'd1',
      name: 'Luis',
      taxiNumber: '07',
      phone: '555',
      status: 'free',
      lat: -33.45,
      lng: -70.66,
      lastSeenAt: '2026-11-02T10:00:00.000Z',
    });
  });

  it('rowToDriver keeps null last_seen_at and coordinates', () => {
    const d = rowToDriver({ ...driverRow, lat: null, lng: null, last_seen_at: null });
    expect(d.lastSeenAt).toBeNull();
    expect(d.lat).toBeNull();
    expect(d.lng).toBeNull();
  });

  it('rowToTrip maps to camelCase and normalizes timestamps to ISO UTC', () => {
    expect(rowToTrip(tripRow)).toEqual({
      id: 't1',
      source: 'client_app',
      customerName: 'Ana',
      customerPhone: '555-0100',
      pickupAddress: 'Calle 1',
      pickupLat: null,
      pickupLng: null,
      dropoffAddress: 'Calle 2',
      status: 'assigned',
      driverId: 'd1',
      createdAt: '2026-11-02T10:00:00.000Z',
      assignedAt: '2026-11-02T10:05:00.123Z',
    });
  });

  it('rowToTrip keeps null assigned_at', () => {
    expect(rowToTrip({ ...tripRow, assigned_at: null }).assignedAt).toBeNull();
  });

  it('inputToRow maps to snake_case and sets source admin', () => {
    expect(
      inputToRow({
        customerName: 'Ana',
        customerPhone: '555',
        pickupAddress: 'A',
        pickupLat: 1,
        pickupLng: 2,
        dropoffAddress: 'B',
      }),
    ).toEqual({
      source: 'admin',
      customer_name: 'Ana',
      customer_phone: '555',
      pickup_address: 'A',
      pickup_lat: 1,
      pickup_lng: 2,
      dropoff_address: 'B',
    });
  });

  it('driverToRow / tripToRow round-trip', () => {
    const d = rowToDriver(driverRow);
    expect(rowToDriver(driverToRow(d))).toEqual(d);
    const t = rowToTrip(tripRow);
    expect(rowToTrip(tripToRow(t))).toEqual(t);
  });
});
