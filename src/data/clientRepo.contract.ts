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
