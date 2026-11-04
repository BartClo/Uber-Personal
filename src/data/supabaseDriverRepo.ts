import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Driver, Trip, TripStatus } from '../domain/types';
import type { AdvanceResult, DriverRepo, ReportResult, SetOnlineResult } from './driverRepo';
import type { ConnectionState, Unsubscribe } from './repo';
import { rowToDriver, rowToTrip, type DriverRow, type TripRow } from './supabaseMapping';

type RpcFailure<E> = { ok: false; error: E };
type AdvanceResponse = { ok: true; trip: TripRow } | RpcFailure<Extract<AdvanceResult, { ok: false }>['error']>;

/**
 * Repo del taxista. Lecturas sujetas a RLS y escrituras solo por RPC. Un canal realtime por
 * instancia: RLS filtra los eventos a las filas propias y cada evento avisa a los suscriptores.
 * Un viaje que deja de estar en curso ya no pasa RLS y su evento no llega: quien use este repo
 * debe releer también con un temporizador.
 */
export function createSupabaseDriverRepo(client: SupabaseClient): DriverRepo {
  const subs = new Set<() => void>();
  const connSubs = new Set<(s: ConnectionState) => void>();
  let channel: RealtimeChannel | null = null;
  let state: ConnectionState | null = null;

  function notify(): void {
    for (const cb of [...subs]) cb();
  }

  function setState(s: ConnectionState): void {
    if (s === state) return;
    state = s;
    for (const cb of [...connSubs]) cb(s);
  }

  function ensureChannel(): void {
    if (channel) return;
    const c: RealtimeChannel = client
      .channel(`driver-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, notify)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, notify);
    channel = c;
    c.subscribe((status) => {
      // Ignora estados de canales ya retirados (p. ej. el CLOSED tardío de removeChannel).
      if (channel !== c) return;
      if (status === 'SUBSCRIBED') {
        setState('connected');
        // Cubre cambios ocurridos antes de suscribirse o durante una caída.
        notify();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setState('reconnecting');
      }
    });
  }

  function subscribeTo<T>(set: Set<T>, cb: T): Unsubscribe {
    set.add(cb);
    ensureChannel();
    return () => {
      set.delete(cb);
      if (!channel || subs.size + connSubs.size > 0) return;
      const c = channel;
      channel = null;
      state = null;
      void client.removeChannel(c);
    };
  }

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }

  // Filtra por la sesión además de RLS: un admin vería todas las filas.
  async function getMe(): Promise<Driver | null> {
    const { data: auth } = await client.auth.getSession();
    const userId = auth.session?.user.id;
    if (!userId) return null;
    const { data, error } = await client
      .from('drivers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToDriver(data as DriverRow) : null;
  }

  return {
    getMe,

    async getCurrentTrip(): Promise<Trip | null> {
      const me = await getMe();
      if (!me) return null;
      const { data, error } = await client
        .from('trips')
        .select('*')
        .eq('driver_id', me.id)
        .in('status', ['assigned', 'en_route', 'on_board'])
        .order('assigned_at')
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? rowToTrip(data as TripRow) : null;
    },

    subscribe: (cb) => subscribeTo(subs, cb),

    subscribeConnection(cb) {
      const off = subscribeTo(connSubs, cb);
      if (state) cb(state);
      return off;
    },

    async advanceTrip(tripId: string, expectedStatus: TripStatus): Promise<AdvanceResult> {
      const res = await rpc<AdvanceResponse>('driver_advance_trip', {
        p_trip_id: tripId,
        p_expected_status: expectedStatus,
      });
      if (!res.ok) return res;
      notify();
      return { ok: true, trip: rowToTrip(res.trip) };
    },

    // Sin notify: realtime ya avisa, y esto ocurre cada 5 s.
    reportLocation: (lat: number, lng: number) =>
      rpc<ReportResult>('driver_report_location', { p_lat: lat, p_lng: lng }),

    async setOnline(online: boolean): Promise<SetOnlineResult> {
      const res = await rpc<SetOnlineResult>('driver_set_online', { p_online: online });
      if (res.ok) notify();
      return res;
    },
  };
}
