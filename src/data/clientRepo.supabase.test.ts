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

  runClientRepoContract(async () => createSupabaseClientRepo(anon));

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
    await admin.from('trips').update({ status: 'assigned', driver_id: drv?.id }).eq('tracking_token', r.token);

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
