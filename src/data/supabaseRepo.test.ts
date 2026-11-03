// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Driver, Trip } from '../domain/types';
import type { FleetRepo, SeedableRepo } from './repo';
import { runRepoContract } from './repo.contract';
import { driverToRow, tripToRow } from './supabaseMapping';
import { createSupabaseRepo } from './supabaseRepo';

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY ?? '';

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

async function check(p: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await p;
  if (error) throw new Error(error.message);
}

(url ? describe : describe.skip)('createSupabaseRepo (Supabase local)', () => {
  let admin: SupabaseClient;
  const repos: FleetRepo[] = [];
  const clients: SupabaseClient[] = [];

  async function signedInClient(role: string | null): Promise<SupabaseClient> {
    const email = `test-${role ?? 'user'}-${crypto.randomUUID()}@example.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const { error } = await admin.auth.admin.createUser({
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
    return client;
  }

  async function cleanTables(): Promise<void> {
    await check(admin.from('trips').delete().neq('id', ZERO_UUID));
    await check(admin.from('drivers').delete().neq('id', ZERO_UUID));
  }

  let adminClient: SupabaseClient;

  beforeAll(async () => {
    admin = createClient(url ?? '', serviceKey, noSession);
    adminClient = await signedInClient('admin');
  });

  afterAll(async () => {
    for (const c of clients) await c.removeAllChannels();
    await cleanTables();
  });

  runRepoContract(async () => {
    await cleanTables();
    const repo = createSupabaseRepo(adminClient);
    repos.push(repo);
    const seedable: SeedableRepo = Object.assign(repo, {
      async seed(data: { drivers?: Driver[]; trips?: Trip[] }): Promise<void> {
        if (data.drivers?.length) {
          await check(admin.from('drivers').insert(data.drivers.map(driverToRow)));
        }
        if (data.trips?.length) {
          await check(admin.from('trips').insert(data.trips.map(tripToRow)));
        }
      },
    });
    return seedable;
  });

  describe('RLS', () => {
    it('a non-admin authenticated user sees no rows and cannot assign', async () => {
      await cleanTables();
      const D = '00000000-0000-4000-8000-0000000000b1';
      const T = '00000000-0000-4000-8000-0000000000b2';
      await check(
        admin.from('drivers').insert({ id: D, name: 'X', taxi_number: '99', phone: '1', status: 'free' }),
      );
      await check(
        admin.from('trips').insert({
          id: T,
          customer_name: 'C',
          customer_phone: '1',
          pickup_address: 'A',
          dropoff_address: 'B',
        }),
      );
      const repo = createSupabaseRepo(await signedInClient(null));
      expect(await repo.listDrivers()).toEqual([]);
      expect(await repo.listTrips()).toEqual([]);
      const res = await repo.assignTrip(T, D);
      expect(res).toEqual({ ok: false, error: 'trip_not_found' });
      const { data } = await admin.from('trips').select('status').eq('id', T).single();
      expect(data?.status).toBe('pending');
    });

    it('the anon role cannot execute assign_trip', async () => {
      const anon = createClient(url ?? '', anonKey, noSession);
      const { error } = await anon.rpc('assign_trip', { p_trip_id: ZERO_UUID, p_driver_id: ZERO_UUID });
      expect(error).not.toBeNull();
    });
  });

  it('subscribeConnection reports connected', async () => {
    const repo = createSupabaseRepo(adminClient);
    const states: string[] = [];
    const off = repo.subscribeConnection((s) => states.push(s));
    await expect.poll(() => states.includes('connected'), { timeout: 10000 }).toBe(true);
    off();
  });
});
