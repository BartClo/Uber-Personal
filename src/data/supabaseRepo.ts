import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Driver, Trip } from "../domain/types";
import type {
  AssignError,
  AssignResult,
  ConnectionState,
  FleetRepo,
  NewTripInput,
  Unsubscribe,
} from "./repo";
import {
  inputToRow,
  rowToDriver,
  rowToTrip,
  type DriverRow,
  type TripRow,
} from "./supabaseMapping";

type RpcResponse =
  { ok: true; trip: TripRow } | { ok: false; error: AssignError };

/**
 * Repo sobre Supabase. Usa UN canal realtime por instancia, compartido por todos
 * los suscriptores; se crea con el primer suscriptor y se elimina con el último.
 * Cada evento postgres_changes provoca un re-listado completo de la tabla.
 */
export function createSupabaseRepo(client: SupabaseClient): FleetRepo {
  const driverSubs = new Set<(d: Driver[]) => void>();
  const tripSubs = new Set<(t: Trip[]) => void>();
  const connSubs = new Set<(s: ConnectionState) => void>();
  let channel: RealtimeChannel | null = null;
  let state: ConnectionState | null = null;
  let hasDropped = false;

  async function listDrivers(): Promise<Driver[]> {
    const { data, error } = await client
      .from("drivers")
      .select("*")
      .order("taxi_number");
    if (error) throw new Error(error.message);
    return (data as DriverRow[]).map(rowToDriver);
  }

  async function listTrips(): Promise<Trip[]> {
    const { data, error } = await client
      .from("trips")
      .select("*")
      .order("created_at")
      .order("id");
    if (error) throw new Error(error.message);
    return (data as TripRow[]).map(rowToTrip);
  }

  // Cada recarga lleva un número de secuencia por tabla; se descarta cualquier
  // respuesta más antigua que la última entregada (las recargas pueden resolverse
  // fuera de orden).
  let driverSeq = 0;
  let driverDelivered = 0;
  let tripSeq = 0;
  let tripDelivered = 0;

  function refreshDrivers(): void {
    if (driverSubs.size === 0) return;
    const seq = ++driverSeq;
    listDrivers().then(
      (d) => {
        if (seq < driverDelivered) return;
        driverDelivered = seq;
        for (const cb of [...driverSubs]) cb(d);
      },
      (e: unknown) => console.error("[supabaseRepo] listDrivers", e),
    );
  }

  function refreshTrips(): void {
    if (tripSubs.size === 0) return;
    const seq = ++tripSeq;
    listTrips().then(
      (t) => {
        if (seq < tripDelivered) return;
        tripDelivered = seq;
        for (const cb of [...tripSubs]) cb(t);
      },
      (e: unknown) => console.error("[supabaseRepo] listTrips", e),
    );
  }

  function setState(s: ConnectionState): void {
    if (s === state) return;
    state = s;
    for (const cb of [...connSubs]) cb(s);
  }

  function ensureChannel(): void {
    if (channel) return;
    const c: RealtimeChannel = client
      .channel(`fleet-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        refreshDrivers,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trips" },
        refreshTrips,
      );
    channel = c;
    c.subscribe((status) => {
      // Ignora estados de canales ya retirados (p. ej. el CLOSED tardío de removeChannel).
      if (channel !== c) return;
      if (status === "SUBSCRIBED") {
        setState("connected");
        // Re-lista en cada SUBSCRIBED: cubre cambios previos a la suscripción y caídas.
        hasDropped = false;
        refreshDrivers();
        refreshTrips();
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        hasDropped = true;
        setState("reconnecting");
      }
    });
  }

  function releaseChannelIfIdle(): void {
    if (!channel || driverSubs.size + tripSubs.size + connSubs.size > 0) return;
    const c = channel;
    channel = null;
    state = null;
    hasDropped = false;
    void client.removeChannel(c);
  }

  function subscribe<T>(set: Set<T>, cb: T): Unsubscribe {
    set.add(cb);
    ensureChannel();
    return () => {
      set.delete(cb);
      releaseChannelIfIdle();
    };
  }

  return {
    listDrivers,
    listTrips,
    subscribeDrivers: (cb) => subscribe(driverSubs, cb),
    subscribeTrips: (cb) => subscribe(tripSubs, cb),
    subscribeConnection(cb) {
      const off = subscribe(connSubs, cb);
      if (state) cb(state);
      return off;
    },

    async createTrip(input: NewTripInput): Promise<Trip> {
      const { data, error } = await client
        .from("trips")
        .insert(inputToRow(input))
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      const trip = rowToTrip(data as TripRow);
      // Notificación inmediata además del evento realtime (que también re-lista).
      refreshTrips();
      return trip;
    },

    async assignTrip(tripId: string, driverId: string): Promise<AssignResult> {
      const { data, error } = await client.rpc("assign_trip", {
        p_trip_id: tripId,
        p_driver_id: driverId,
      });
      if (error) throw new Error(error.message);
      const res = data as RpcResponse;
      if (!res.ok) return { ok: false, error: res.error };
      refreshTrips();
      refreshDrivers();
      return { ok: true, trip: rowToTrip(res.trip) };
    },
  };
}
