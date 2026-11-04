// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Driver, Trip } from '../domain/types';
import { OTHER_DRIVER_ID, runDriverRepoContract } from './driverRepo.contract';
import { rowToDriver, type DriverRow } from './supabaseMapping';
import { createSupabaseDriverRepo } from './supabaseDriverRepo';

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY ?? '';

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

async function check(p: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await p;
  if (error) throw new Error(error.message);
}

(url ? describe : describe.skip)('createSupabaseDriverRepo (Supabase local)', () => {
  let admin: SupabaseClient;
  const clients: SupabaseClient[] = [];

  async function signedInUser(role: string | null): Promise<{ client: SupabaseClient; userId: string }> {
    const email = `test-driver-${crypto.randomUUID()}@example.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: role ? { role } : {},
    });
    if (error) throw new Error(error.message);
    const client = createClient(url ?? '', anonKey, noSession);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(signInError.message);
    clients.push(client);
    return { client, userId: data.user.id };
  }

  async function cleanTables(): Promise<void> {
    await check(admin.from('trips').delete().neq('id', ZERO_UUID));
    await check(admin.from('drivers').delete().neq('id', ZERO_UUID));
  }

  async function addDriver(id: string, taxi: string, userId: string | null): Promise<void> {
    await check(
      admin.from('drivers').insert({
        id,
        name: `Taxista ${taxi}`,
        taxi_number: taxi,
        phone: '555-0200',
        status: 'offline',
        user_id: userId,
      }),
    );
  }

  async function addTrip(status: Trip['status'], driverId: string | null): Promise<string> {
    const id = crypto.randomUUID();
    await check(
      admin.from('trips').insert({
        id,
        customer_name: 'Ana',
        customer_phone: '555-0100',
        pickup_address: 'Calle 1',
        dropoff_address: 'Calle 2',
        status,
        driver_id: driverId,
        assigned_at: driverId ? new Date().toISOString() : null,
      }),
    );
    return id;
  }

  async function readDriver(id: string): Promise<Driver> {
    const { data, error } = await admin.from('drivers').select('*').eq('id', id).single();
    if (error) throw new Error(error.message);
    return rowToDriver(data as DriverRow);
  }

  async function readTripStatus(id: string): Promise<Trip['status']> {
    const { data, error } = await admin.from('trips').select('status').eq('id', id).single();
    if (error) throw new Error(error.message);
    return (data as { status: Trip['status'] }).status;
  }

  beforeAll(() => {
    admin = createClient(url ?? '', serviceKey, noSession);
  });

  afterAll(async () => {
    for (const c of clients) await c.removeAllChannels();
    await cleanTables();
  });

  runDriverRepoContract(async () => {
    await cleanTables();
    const { client, userId } = await signedInUser('driver');
    const meId = crypto.randomUUID();
    await addDriver(meId, '07', userId);
    await addDriver(OTHER_DRIVER_ID, '08', null);
    const adminUser = await signedInUser('admin');
    return {
      repo: createSupabaseDriverRepo(client),
      meId,
      setMyStatus: (status) =>
        check(admin.from('drivers').update({ status }).eq('id', meId)),
      addTrip,
      readTripStatus,
      readDriver,
      assignToMe: async (tripId) => {
        const { data, error } = await adminUser.client.rpc('assign_trip', {
          p_trip_id: tripId,
          p_driver_id: meId,
        });
        if (error) throw new Error(error.message);
        expect((data as { ok: boolean }).ok).toBe(true);
      },
      unlinkedRepo: async () => createSupabaseDriverRepo((await signedInUser('driver')).client),
    };
  });

  describe('seguridad con un taxista real', () => {
    const OTHER_USER_DRIVER = '00000000-0000-4000-8000-0000000000c3';
    let driver: SupabaseClient;
    let meId: string;
    let myTrip: string;
    let foreignTrip: string;
    let pendingTrip: string;

    beforeEach(async () => {
      await cleanTables();
      const signedIn = await signedInUser('driver');
      driver = signedIn.client;
      meId = crypto.randomUUID();
      await addDriver(meId, '07', signedIn.userId);
      await addDriver(OTHER_USER_DRIVER, '08', null);
      await check(admin.from('drivers').update({ status: 'free' }).eq('id', OTHER_USER_DRIVER));
      myTrip = await addTrip('assigned', meId);
      foreignTrip = await addTrip('assigned', OTHER_USER_DRIVER);
      pendingTrip = await addTrip('pending', null);
    });

    it('solo lee su fila de taxista', async () => {
      const { data, error } = await driver.from('drivers').select('id');
      expect(error).toBeNull();
      expect(data).toEqual([{ id: meId }]);
    });

    it('solo lee sus viajes', async () => {
      const { data, error } = await driver.from('trips').select('id');
      expect(error).toBeNull();
      expect(data).toEqual([{ id: myTrip }]);
    });

    it('no actualiza tablas directamente, ni siquiera sus propias filas', async () => {
      await driver.from('drivers').update({ status: 'free', lat: 1 }).eq('id', meId);
      await driver.from('drivers').update({ status: 'offline' }).eq('id', OTHER_USER_DRIVER);
      await driver.from('trips').update({ status: 'completed' }).eq('id', myTrip);
      await driver.from('trips').update({ driver_id: meId }).eq('id', pendingTrip);
      const me = await readDriver(meId);
      expect(me.status).toBe('offline');
      expect(me.lat).toBeNull();
      expect((await readDriver(OTHER_USER_DRIVER)).status).toBe('free');
      expect(await readTripStatus(myTrip)).toBe('assigned');
      expect(await readTripStatus(pendingTrip)).toBe('pending');
    });

    it('no inserta ni borra filas', async () => {
      const ins = await driver.from('trips').insert({
        customer_name: 'X',
        customer_phone: '1',
        pickup_address: 'A',
        dropoff_address: 'B',
      });
      expect(ins.error).not.toBeNull();
      const insDriver = await driver
        .from('drivers')
        .insert({ name: 'X', taxi_number: '99', phone: '1' });
      expect(insDriver.error).not.toBeNull();
      await driver.from('trips').delete().eq('id', myTrip);
      await driver.from('drivers').delete().eq('id', meId);
      expect(await readTripStatus(myTrip)).toBe('assigned');
      expect((await readDriver(meId)).id).toBe(meId);
    });

    it('assign_trip no surte efecto: ni con viaje pendiente, ni ajeno, ni propio', async () => {
      for (const tripId of [pendingTrip, foreignTrip, myTrip]) {
        const { data, error } = await driver.rpc('assign_trip', {
          p_trip_id: tripId,
          p_driver_id: meId,
        });
        expect(error).toBeNull();
        expect(data).toEqual({ ok: false, error: 'trip_not_found' });
      }
      expect(await readTripStatus(pendingTrip)).toBe('pending');
      expect(await readTripStatus(foreignTrip)).toBe('assigned');
    });

    it('anon no puede ejecutar las RPC del taxista', async () => {
      const anon = createClient(url ?? '', anonKey, noSession);
      const calls = [
        anon.rpc('driver_report_location', { p_lat: 1, p_lng: 1 }),
        anon.rpc('driver_set_online', { p_online: true }),
        anon.rpc('driver_advance_trip', { p_trip_id: myTrip, p_expected_status: 'assigned' }),
      ];
      for (const res of await Promise.all(calls)) expect(res.error).not.toBeNull();
    });

    it('rechaza coordenadas NaN, infinitas o nulas', async () => {
      const bad: Array<[unknown, unknown]> = [
        ['NaN', 0],
        [0, 'Infinity'],
        [null, 0],
      ];
      for (const [p_lat, p_lng] of bad) {
        const { data, error } = await driver.rpc('driver_report_location', { p_lat, p_lng });
        expect(error).toBeNull();
        expect(data).toEqual({ ok: false, error: 'invalid_coordinates' });
      }
      expect((await readDriver(meId)).lastSeenAt).toBeNull();
    });

    it.each(['completed', 'cancelled'] as const)(
      'no lee los datos del cliente de un viaje propio en %s',
      async (status) => {
        const id = await addTrip(status, meId);
        const { data, error } = await driver
          .from('trips')
          .select('customer_name, customer_phone, pickup_address, dropoff_address')
          .eq('id', id);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      },
    );

    it('pierde el acceso al viaje en cuanto este termina', async () => {
      const repo = createSupabaseDriverRepo(driver);
      await check(admin.from('trips').update({ status: 'cancelled' }).eq('id', myTrip));
      expect(await repo.getCurrentTrip()).toBeNull();
      const { data } = await driver.from('trips').select('id').eq('id', myTrip);
      expect(data).toEqual([]);
    });

    it('no alcanza el token de seguimiento por ninguna vía', async () => {
      const column = await driver.from('trips').select('tracking_token');
      expect(column.error).not.toBeNull();
      const { data: rows } = await driver.from('trips').select('*').eq('id', myTrip);
      expect(JSON.stringify(rows)).not.toContain('token');
      const table = await driver.from('trip_tracking').select('*');
      expect(table.error?.code).toBe('42501');
      const { data } = await driver.rpc('driver_advance_trip', {
        p_trip_id: myTrip,
        p_expected_status: 'assigned',
      });
      expect(Object.keys((data as { trip: object }).trip).sort()).toEqual(
        [
          'assigned_at',
          'created_at',
          'customer_name',
          'customer_phone',
          'driver_id',
          'dropoff_address',
          'id',
          'pickup_address',
          'pickup_lat',
          'pickup_lng',
          'source',
          'status',
        ].sort(),
      );
    });

    it('la firma antigua de driver_advance_trip ya no existe; el estado nulo no avanza', async () => {
      const old = await driver.rpc('driver_advance_trip', { p_trip_id: myTrip });
      expect(old.error).not.toBeNull();
      const { data } = await driver.rpc('driver_advance_trip', {
        p_trip_id: myTrip,
        p_expected_status: null,
      });
      expect(data).toEqual({ ok: false, error: 'not_advanceable' });
      expect(await readTripStatus(myTrip)).toBe('assigned');
    });

    it('el admin sigue viendo todo y puede asignar', async () => {
      const { client } = await signedInUser('admin');
      const drivers = await client.from('drivers').select('id');
      expect(drivers.data).toHaveLength(2);
      const trips = await client.from('trips').select('id');
      expect(trips.data).toHaveLength(3);
      const { data } = await client.rpc('assign_trip', {
        p_trip_id: pendingTrip,
        p_driver_id: OTHER_USER_DRIVER,
      });
      expect((data as { ok: boolean }).ok).toBe(true);
    });
  });
});
