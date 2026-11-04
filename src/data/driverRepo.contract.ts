import { describe, expect, it, vi } from 'vitest';
import type { Driver, Trip } from '../domain/types';
import type { DriverRepo } from './driverRepo';

export const OTHER_DRIVER_ID = '00000000-0000-4000-8000-0000000000c2';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

/** Control del escenario, por fuera de lo que el taxista puede hacer. */
export interface DriverHarness {
  repo: DriverRepo;
  /** Id del taxista de la sesión. Existe además otro taxista, OTHER_DRIVER_ID. */
  meId: string;
  setMyStatus(status: Driver['status']): Promise<void>;
  /** driverId null deja el viaje sin asignar. */
  addTrip(status: Trip['status'], driverId: string | null): Promise<string>;
  readTripStatus(id: string): Promise<Trip['status']>;
  /** Taxista visto por fuera de sus permisos. */
  readDriver(id: string): Promise<Driver>;
  /** Asigna un viaje al taxista de la sesión como lo haría el admin. */
  assignToMe(tripId: string): Promise<void>;
  /** Repo de una sesión sin taxista vinculado. */
  unlinkedRepo(): Promise<DriverRepo>;
}

export function runDriverRepoContract(makeHarness: () => Promise<DriverHarness>): void {
  describe('DriverRepo contract', () => {
    it('getMe devuelve al taxista de la sesión', async () => {
      const h = await makeHarness();
      const me = await h.repo.getMe();
      expect(me?.id).toBe(h.meId);
    });

    it('getCurrentTrip es null sin viaje y también si solo hay finalizados o ajenos', async () => {
      const h = await makeHarness();
      expect(await h.repo.getCurrentTrip()).toBeNull();
      await h.addTrip('completed', h.meId);
      await h.addTrip('cancelled', h.meId);
      await h.addTrip('assigned', OTHER_DRIVER_ID);
      await h.addTrip('pending', null);
      expect(await h.repo.getCurrentTrip()).toBeNull();
    });

    it.each(['assigned', 'en_route', 'on_board'] as const)(
      'getCurrentTrip devuelve el viaje propio en %s',
      async (status) => {
        const h = await makeHarness();
        const id = await h.addTrip(status, h.meId);
        const trip = await h.repo.getCurrentTrip();
        expect(trip?.id).toBe(id);
        expect(trip?.status).toBe(status);
      },
    );

    it('advanceTrip recorre todos los estados y al finalizar deja libre al taxista', async () => {
      const h = await makeHarness();
      await h.setMyStatus('busy');
      const id = await h.addTrip('assigned', h.meId);
      for (const [from, to] of [
        ['assigned', 'en_route'],
        ['en_route', 'on_board'],
      ] as const) {
        const res = await h.repo.advanceTrip(id, from);
        expect(res.ok && res.trip.status).toBe(to);
        expect((await h.readDriver(h.meId)).status).toBe('busy');
      }
      const last = await h.repo.advanceTrip(id, 'on_board');
      expect(last.ok && last.trip.status).toBe('completed');
      expect((await h.readDriver(h.meId)).status).toBe('free');
      expect(await h.repo.getCurrentTrip()).toBeNull();
    });

    it.each(['completed', 'cancelled', 'pending'] as const)(
      'advanceTrip rechaza un viaje propio en %s',
      async (status) => {
        const h = await makeHarness();
        const id = await h.addTrip(status, h.meId);
        expect(await h.repo.advanceTrip(id, status)).toEqual({
          ok: false,
          error: 'not_advanceable',
        });
        expect(await h.readTripStatus(id)).toBe(status);
      },
    );

    it('advanceTrip no avanza si el estado no es el que el taxista estaba viendo', async () => {
      const h = await makeHarness();
      const id = await h.addTrip('en_route', h.meId);
      expect(await h.repo.advanceTrip(id, 'assigned')).toEqual({
        ok: false,
        error: 'not_advanceable',
      });
      expect(await h.readTripStatus(id)).toBe('en_route');
    });

    it('dos avances simultáneos desde el mismo estado: solo uno surte efecto', async () => {
      const h = await makeHarness();
      const id = await h.addTrip('assigned', h.meId);
      const results = await Promise.all([
        h.repo.advanceTrip(id, 'assigned'),
        h.repo.advanceTrip(id, 'assigned'),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'not_advanceable' }]);
      expect(await h.readTripStatus(id)).toBe('en_route');
    });

    it('advanceTrip no toca viajes ajenos ni desconocidos', async () => {
      const h = await makeHarness();
      const foreign = await h.addTrip('assigned', OTHER_DRIVER_ID);
      expect(await h.repo.advanceTrip(foreign, 'assigned')).toEqual({ ok: false, error: 'trip_not_found' });
      expect(await h.readTripStatus(foreign)).toBe('assigned');
      expect(await h.repo.advanceTrip(UNKNOWN, 'assigned')).toEqual({
        ok: false,
        error: 'trip_not_found',
      });
    });

    it('reportLocation guarda posición y hora solo del taxista propio', async () => {
      const h = await makeHarness();
      const before = await h.readDriver(OTHER_DRIVER_ID);
      expect(await h.repo.reportLocation(-33.45, -70.66)).toEqual({ ok: true });
      const me = await h.readDriver(h.meId);
      expect(me.lat).toBe(-33.45);
      expect(me.lng).toBe(-70.66);
      expect(Number.isNaN(Date.parse(me.lastSeenAt ?? ''))).toBe(false);
      expect(await h.readDriver(OTHER_DRIVER_ID)).toEqual(before);
    });

    it.each([
      [91, 0],
      [-91, 0],
      [0, 181],
      [0, -181],
    ])('reportLocation rechaza (%d, %d)', async (lat, lng) => {
      const h = await makeHarness();
      expect(await h.repo.reportLocation(lat, lng)).toEqual({
        ok: false,
        error: 'invalid_coordinates',
      });
      expect((await h.readDriver(h.meId)).lastSeenAt).toBeNull();
    });

    it('setOnline: conectado queda libre; desconectado queda offline', async () => {
      const h = await makeHarness();
      expect(await h.repo.setOnline(true)).toEqual({ ok: true, status: 'free' });
      expect((await h.readDriver(h.meId)).status).toBe('free');
      expect(await h.repo.setOnline(false)).toEqual({ ok: true, status: 'offline' });
      expect((await h.readDriver(h.meId)).status).toBe('offline');
    });

    it('setOnline(true) con viaje activo queda ocupado', async () => {
      const h = await makeHarness();
      await h.addTrip('en_route', h.meId);
      expect(await h.repo.setOnline(true)).toEqual({ ok: true, status: 'busy' });
    });

    it('setOnline(false) con viaje activo se rechaza y no cambia el estado', async () => {
      const h = await makeHarness();
      await h.setMyStatus('busy');
      await h.addTrip('assigned', h.meId);
      expect(await h.repo.setOnline(false)).toEqual({ ok: false, error: 'active_trip' });
      expect((await h.readDriver(h.meId)).status).toBe('busy');
    });

    it('una cuenta sin taxi falla limpiamente en todo', async () => {
      const h = await makeHarness();
      const trip = await h.addTrip('assigned', h.meId);
      const repo = await h.unlinkedRepo();
      const error = { ok: false, error: 'driver_not_found' };
      expect(await repo.getMe()).toBeNull();
      expect(await repo.getCurrentTrip()).toBeNull();
      expect(await repo.reportLocation(1, 1)).toEqual(error);
      expect(await repo.setOnline(true)).toEqual(error);
      expect(await repo.advanceTrip(trip, 'assigned')).toEqual(error);
    });

    it('subscribe avisa al asignar un viaje; al desuscribirse deja de avisar', async () => {
      const h = await makeHarness();
      await h.setMyStatus('free');
      const states: string[] = [];
      const offConn = h.repo.subscribeConnection((s) => states.push(s));
      const cb = vi.fn();
      const off = h.repo.subscribe(cb);
      await vi.waitFor(() => expect(states).toContain('connected'), { timeout: 10_000 });
      cb.mockClear();
      const id = await h.addTrip('pending', null);
      await h.assignToMe(id);
      await vi.waitFor(() => expect(cb).toHaveBeenCalled(), { timeout: 10_000 });
      off();
      offConn();
      cb.mockClear();
      await h.repo.setOnline(true);
      await new Promise((r) => setTimeout(r, 50));
      expect(cb).not.toHaveBeenCalled();
      // Holgado: el primer canal tras un rato inactivo espera el arranque en frío de Realtime.
    }, 30_000);

    it('advanceTrip avisa a los suscriptores', async () => {
      const h = await makeHarness();
      const id = await h.addTrip('assigned', h.meId);
      const cb = vi.fn();
      const off = h.repo.subscribe(cb);
      cb.mockClear();
      await h.repo.advanceTrip(id, 'assigned');
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());
      off();
    });
  });
}
