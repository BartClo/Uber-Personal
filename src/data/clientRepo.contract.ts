import { describe, expect, it } from 'vitest';
import type { ClientRepo } from './clientRepo';

const valid = (phone: string) => ({
  pickup: 'Calle 1 #10',
  dropoff: 'Aeropuerto',
  name: 'Ana',
  phone,
});

export function runClientRepoContract(makeRepo: () => Promise<ClientRepo>): void {
  describe('ClientRepo contract', () => {
    it('requestTrip returns a token and getStatus shows a pending trip without driver', async () => {
      const repo = await makeRepo();
      const r = await repo.requestTrip(valid('555 0100'));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const s = await repo.getStatus(r.token);
      expect(s.ok).toBe(true);
      if (!s.ok) return;
      expect(s.trip.status).toBe('pending');
      expect(s.trip.pickupAddress).toBe('Calle 1 #10');
      expect(s.trip.driver).toBeNull();
      expect(JSON.stringify(s)).not.toContain('555 0100');
    });

    it('rejects invalid input', async () => {
      const repo = await makeRepo();
      expect(await repo.requestTrip({ ...valid('555 0100'), name: '   ' })).toEqual({
        ok: false,
        error: 'invalid_input',
      });
      expect(await repo.requestTrip(valid('abc'))).toEqual({ ok: false, error: 'invalid_input' });
      expect(await repo.requestTrip({ ...valid('555 0100'), pickup: 'x'.repeat(201) })).toEqual({
        ok: false,
        error: 'invalid_input',
      });
    });

    it('acepta coordenadas de origen válidas', async () => {
      const repo = await makeRepo();
      const r = await repo.requestTrip({
        ...valid(`556 ${Math.floor(Math.random() * 9000 + 1000)}`),
        pickupLat: -33.41,
        pickupLng: -70.57,
      });
      expect(r.ok).toBe(true);
    });

    it.each([
      ['solo latitud', -33.41, null],
      ['solo longitud', null, -70.57],
      ['latitud fuera de rango', 91, -70.57],
      ['longitud fuera de rango', -33.41, -181],
      ['NaN', Number.NaN, -70.57],
    ])('rechaza coordenadas inválidas: %s', async (_n, lat, lng) => {
      const repo = await makeRepo();
      expect(await repo.requestTrip({ ...valid('555 0102'), pickupLat: lat, pickupLng: lng })).toEqual({
        ok: false,
        error: 'invalid_input',
      });
    });

    it.each([
      ['control', 'Ana\u0007B'],
      ['zero-width', 'Ana\u200bB'],
      ['bidi', 'Ana\u202eB'],
      ['BOM', 'Ana\ufeffB'],
    ])('rejects %s characters in names and addresses', async (_name, bad) => {
      const repo = await makeRepo();
      const invalid = { ok: false, error: 'invalid_input' };
      expect(await repo.requestTrip({ ...valid('555 0101'), name: bad })).toEqual(invalid);
      expect(await repo.requestTrip({ ...valid('555 0101'), pickup: bad })).toEqual(invalid);
      expect(await repo.requestTrip({ ...valid('555 0101'), dropoff: bad })).toEqual(invalid);
    });

    it('the limit compares phones by digits, ignoring their format', async () => {
      const repo = await makeRepo();
      const n = Math.floor(Math.random() * 9000 + 1000);
      for (const phone of [`777 ${n}`, `777-${n}`, `(777) ${n}`]) {
        expect((await repo.requestTrip(valid(phone))).ok).toBe(true);
      }
      expect(await repo.requestTrip(valid(`777${n}`))).toEqual({
        ok: false,
        error: 'too_many_requests',
      });
    });

    it('limits to 3 active trips per phone', async () => {
      const repo = await makeRepo();
      const phone = `555 ${Math.floor(Math.random() * 9000 + 1000)}`;
      for (let i = 0; i < 3; i += 1) expect((await repo.requestTrip(valid(phone))).ok).toBe(true);
      expect(await repo.requestTrip(valid(phone))).toEqual({
        ok: false,
        error: 'too_many_requests',
      });
    });

    it('getStatus returns not_found for an unknown token', async () => {
      const repo = await makeRepo();
      expect(await repo.getStatus('00000000-0000-4000-8000-0000000000ff')).toEqual({
        ok: false,
        error: 'not_found',
      });
    });
  });
}
