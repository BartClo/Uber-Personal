// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSupabaseClientRepo } from './clientRepo';
import { runClientRepoContract } from './clientRepo.contract';

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY ?? '';
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

(url ? describe : describe.skip)('ClientRepo (Supabase local)', () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;

  beforeAll(async () => {
    admin = createClient(url ?? '', serviceKey, noSession);
    anon = createClient(url ?? '', anonKey, noSession);
    await admin.from('trips').delete().neq('id', ZERO_UUID);
    await admin.from('drivers').delete().neq('id', ZERO_UUID);
  });
  afterAll(async () => {
    await admin.from('trips').delete().neq('id', ZERO_UUID);
    await admin.from('drivers').delete().neq('id', ZERO_UUID);
  });

  async function tripIdOf(token: string): Promise<string> {
    const { data, error } = await admin
      .from('trip_tracking')
      .select('trip_id')
      .eq('token', token)
      .single();
    if (error) throw new Error(error.message);
    return (data as { trip_id: string }).trip_id;
  }

  async function newToken(phone: string): Promise<string> {
    const r = await createSupabaseClientRepo(anon).requestTrip({
      pickup: 'A',
      dropoff: 'B',
      name: 'Eva',
      phone,
    });
    if (!r.ok) throw new Error(r.error);
    return r.token;
  }

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

  runClientRepoContract(async () => createSupabaseClientRepo(anon));

  describe('request_trip: coordenadas', () => {
    const coordsOf = async (token: string) => {
      const { data } = await admin
        .from('trips')
        .select('pickup_lat, pickup_lng')
        .eq('id', await tripIdOf(token))
        .single();
      return data as { pickup_lat: number | null; pickup_lng: number | null };
    };

    it('guarda las coordenadas del origen y deja null si no hay', async () => {
      const repo = createSupabaseClientRepo(anon);
      const withPin = await repo.requestTrip({
        pickup: 'A', dropoff: 'B', name: 'Eva', phone: '600 400 001', pickupLat: -33.41, pickupLng: -70.57,
      });
      const without = await repo.requestTrip({ pickup: 'A', dropoff: 'B', name: 'Eva', phone: '600 400 002' });
      if (!withPin.ok || !without.ok) throw new Error('request failed');
      expect(await coordsOf(withPin.token)).toEqual({ pickup_lat: -33.41, pickup_lng: -70.57 });
      expect(await coordsOf(without.token)).toEqual({ pickup_lat: null, pickup_lng: null });
    });

    it('la firma antigua de 4 argumentos sigue funcionando sin coordenadas (RPC directo)', async () => {
      const { data } = await anon.rpc('request_trip', {
        p_name: 'Eva', p_phone: '600 400 003', p_pickup: 'A', p_dropoff: 'B',
      });
      expect((data as { ok: boolean }).ok).toBe(true);
    });
  });

  describe('get_trip_status: caducidad', () => {
    it.each(['completed', 'cancelled'])('%s: visible 11 h, not_found a las 13 h', async (status) => {
      const repo = createSupabaseClientRepo(anon);
      const token = await newToken(`600 201 ${status.length}`);
      const id = await tripIdOf(token);
      await admin.from('trips').update({ status }).eq('id', id);
      const { data } = await admin.from('trips').select('finished_at').eq('id', id).single();
      expect(Date.now() - Date.parse((data as { finished_at: string }).finished_at)).toBeLessThan(60_000);
      await admin.from('trips').update({ finished_at: hoursAgo(11) }).eq('id', id);
      expect((await repo.getStatus(token)).ok).toBe(true);
      await admin.from('trips').update({ finished_at: hoursAgo(13) }).eq('id', id);
      expect(await repo.getStatus(token)).toEqual({ ok: false, error: 'not_found' });
    });

    it('un viaje sin terminar no caduca, por antiguo que sea', async () => {
      const token = await newToken('600 200 002');
      await admin.from('trips').update({ created_at: hoursAgo(48) }).eq('id', await tripIdOf(token));
      expect((await createSupabaseClientRepo(anon).getStatus(token)).ok).toBe(true);
    });
  });

  describe('request_trip: límite', () => {
    it('los pedidos de hace más de 2 h no cuentan: el bloqueo se cura solo', async () => {
      const phone = '600 200 003';
      const ids = [
        await tripIdOf(await newToken(phone)),
        await tripIdOf(await newToken(phone)),
        await tripIdOf(await newToken(phone)),
      ];
      const repo = createSupabaseClientRepo(anon);
      const input = { pickup: 'A', dropoff: 'B', name: 'Eva', phone };
      expect(await repo.requestTrip(input)).toEqual({ ok: false, error: 'too_many_requests' });
      await admin.from('trips').update({ created_at: hoursAgo(3) }).in('id', ids);
      expect((await repo.requestTrip(input)).ok).toBe(true);
    });

    it('peticiones simultáneas no superan el límite', async () => {
      const repo = createSupabaseClientRepo(anon);
      const input = { pickup: 'A', dropoff: 'B', name: 'Eva', phone: '600 200 004' };
      const results = await Promise.all(Array.from({ length: 8 }, () => repo.requestTrip(input)));
      expect(results.filter((r) => r.ok)).toHaveLength(3);
    });
  });

  it('anon no puede escribir directamente en trips ni drivers', async () => {
    const calls = [
      anon.from('trips').update({ status: 'cancelled' }).eq('id', ZERO_UUID),
      anon.from('trips').delete().eq('id', ZERO_UUID),
      anon.from('drivers').update({ status: 'free' }).eq('id', ZERO_UUID),
      anon.from('drivers').delete().eq('id', ZERO_UUID),
      anon.from('drivers').insert({ name: 'x', taxi_number: '1', phone: '1' }),
    ];
    for (const res of await Promise.all(calls)) expect(res.error?.code).toBe('42501');
  });

  it('anon no accede a trip_tracking', async () => {
    const res = await anon.from('trip_tracking').select('*');
    expect(res.error?.code).toBe('42501');
  });

  it('creates a pending client_app trip visible to the admin side', async () => {
    const repo = createSupabaseClientRepo(anon);
    const r = await repo.requestTrip({
      pickup: 'Av. Central 1',
      dropoff: 'Terminal',
      name: 'Luz',
      phone: '+34 600 111 222',
    });
    expect(r.ok).toBe(true);
    const { data } = await admin.from('trips').select('*').eq('customer_name', 'Luz').single();
    expect(data?.source).toBe('client_app');
    expect(data?.status).toBe('pending');
    expect(data?.pickup_lat).toBeNull();
  });

  it('get_trip_status exposes only the allowed fields, with driver first name and taxi number', async () => {
    const { data: drv } = await admin
      .from('drivers')
      .insert({
        name: 'Carlos Pérez',
        taxi_number: '07',
        phone: '600999888',
        status: 'free',
        lat: 40.1,
        lng: -3.7,
      })
      .select()
      .single();
    const repo = createSupabaseClientRepo(anon);
    const r = await repo.requestTrip({ pickup: 'A', dropoff: 'B', name: 'Mar', phone: '600 123 456' });
    if (!r.ok) throw new Error('expected ok');
    await admin.from('trips').update({ status: 'assigned', driver_id: drv?.id }).eq('id', await tripIdOf(r.token));

    const { data, error } = await anon.rpc('get_trip_status', { p_token: r.token });
    expect(error).toBeNull();
    expect(Object.keys(data as object).sort()).toEqual(
      [
        'created_at',
        'dropoff_address',
        'driver_first_name',
        'ok',
        'pickup_address',
        'status',
        'taxi_number',
      ].sort(),
    );
    expect((data as { driver_first_name: string }).driver_first_name).toBe('Carlos');
    const s = await repo.getStatus(r.token);
    expect(s.ok && s.trip.driver).toEqual({ firstName: 'Carlos', taxiNumber: '07' });
    const text = JSON.stringify(data);
    expect(text).not.toContain('600999888');
    expect(text).not.toContain('600 123 456');
  });

  it('anon cannot read trips or drivers directly', async () => {
    const trips = await anon.from('trips').select('*');
    expect(trips.error ?? trips.data?.length === 0).toBeTruthy();
    expect(trips.data ?? []).toHaveLength(0);
    const drivers = await anon.from('drivers').select('*');
    expect(drivers.data ?? []).toHaveLength(0);
  });

  it('anon cannot insert into trips or call assign_trip', async () => {
    const ins = await anon.from('trips').insert({
      customer_name: 'x',
      customer_phone: '1',
      pickup_address: 'a',
      dropoff_address: 'b',
    });
    expect(ins.error).not.toBeNull();
    const assign = await anon.rpc('assign_trip', { p_trip_id: ZERO_UUID, p_driver_id: ZERO_UUID });
    expect(assign.error).not.toBeNull();
  });
});
