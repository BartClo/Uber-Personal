import type { SupabaseClient } from '@supabase/supabase-js';
import { phoneDigits, validateClientRequest, type ClientRequestInput } from '../domain/clientTrip';
import type { TripStatus } from '../domain/types';

export type RequestTripError = 'invalid_input' | 'too_many_requests';
export type RequestTripResult = { ok: true; token: string } | { ok: false; error: RequestTripError };

export interface ClientTripView {
  status: TripStatus;
  pickupAddress: string;
  dropoffAddress: string;
  createdAt: string;
  driver: { firstName: string; taxiNumber: string } | null;
}
export type GetStatusResult =
  | { ok: true; trip: ClientTripView }
  | { ok: false; error: 'not_found' };

export interface ClientRepo {
  requestTrip(input: ClientRequestInput): Promise<RequestTripResult>;
  /** Resolves {ok:false,not_found} for unknown tokens; rejects on network/server failure. */
  getStatus(token: string): Promise<GetStatusResult>;
}

/**
 * In-memory implementation. Mirrors the SQL rules (validation, 3 active trips per phone digits),
 * except the 2-hour window and the 12-hour link expiry, which are time-based and tested in SQL.
 */
export class FakeClientRepo implements ClientRepo {
  private trips = new Map<string, ClientTripView & { phone: string }>();
  private failures = 0;
  private counter = 0;

  async requestTrip(input: ClientRequestInput): Promise<RequestTripResult> {
    const v = validateClientRequest(input);
    if (!v.ok) return { ok: false, error: 'invalid_input' };
    const active = [...this.trips.values()].filter(
      (t) => phoneDigits(t.phone) === phoneDigits(v.value.phone) && t.status !== 'completed' && t.status !== 'cancelled',
    ).length;
    if (active >= 3) return { ok: false, error: 'too_many_requests' };
    this.counter += 1;
    const token = `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
    this.trips.set(token, {
      status: 'pending',
      pickupAddress: v.value.pickup,
      dropoffAddress: v.value.dropoff,
      createdAt: '2026-11-03T10:00:00.000Z',
      driver: null,
      phone: v.value.phone,
    });
    return { ok: true, token };
  }

  async getStatus(token: string): Promise<GetStatusResult> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('network');
    }
    const t = this.trips.get(token);
    if (!t) return { ok: false, error: 'not_found' };
    const { phone: _phone, ...trip } = t;
    void _phone;
    return { ok: true, trip };
  }

  /** Test helper. */
  setStatus(token: string, status: TripStatus, driver: ClientTripView['driver'] = null): void {
    const t = this.trips.get(token);
    if (t) {
      t.status = status;
      t.driver = driver;
    }
  }

  /** Test helper: next n getStatus calls reject. */
  failNext(n: number): void {
    this.failures = n;
  }
}

interface RawStatus {
  ok?: boolean;
  error?: string;
  status?: TripStatus;
  pickup_address?: string;
  dropoff_address?: string;
  created_at?: string;
  driver_first_name?: string;
  taxi_number?: string;
}

export function createSupabaseClientRepo(client: SupabaseClient): ClientRepo {
  return {
    async requestTrip(input) {
      const { data, error } = await client.rpc('request_trip', {
        p_name: input.name,
        p_phone: input.phone,
        p_pickup: input.pickup,
        p_dropoff: input.dropoff,
      });
      if (error) throw new Error(error.message);
      const r = data as { ok?: boolean; token?: string; error?: string } | null;
      if (r?.ok && typeof r.token === 'string') return { ok: true, token: r.token };
      if (r?.error === 'too_many_requests') return { ok: false, error: 'too_many_requests' };
      return { ok: false, error: 'invalid_input' };
    },
    async getStatus(token) {
      const { data, error } = await client.rpc('get_trip_status', { p_token: token });
      if (error) {
        // A malformed uuid is a bad link, not an outage.
        if (error.code === '22P02') return { ok: false, error: 'not_found' };
        throw new Error(error.message);
      }
      const r = data as RawStatus | null;
      if (!r?.ok || !r.status) return { ok: false, error: 'not_found' };
      return {
        ok: true,
        trip: {
          status: r.status,
          pickupAddress: r.pickup_address ?? '',
          dropoffAddress: r.dropoff_address ?? '',
          createdAt: r.created_at ?? '',
          driver:
            r.driver_first_name && r.taxi_number
              ? { firstName: r.driver_first_name, taxiNumber: r.taxi_number }
              : null,
        },
      };
    },
  };
}
