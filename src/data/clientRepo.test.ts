import { describe, expect, it } from 'vitest';
import { FakeClientRepo } from './clientRepo';
import { runClientRepoContract } from './clientRepo.contract';

runClientRepoContract(async () => new FakeClientRepo());

describe('FakeClientRepo specifics', () => {
  it('exposes the driver after setStatus and can simulate failures', async () => {
    const repo = new FakeClientRepo();
    const r = await repo.requestTrip({ pickup: 'A', dropoff: 'B', name: 'Ana', phone: '555' });
    if (!r.ok) throw new Error('expected ok');
    repo.setStatus(r.token, 'assigned', { firstName: 'Carlos', taxiNumber: '07' });
    const s = await repo.getStatus(r.token);
    expect(s.ok && s.trip.driver).toEqual({ firstName: 'Carlos', taxiNumber: '07' });
    repo.failNext(1);
    await expect(repo.getStatus(r.token)).rejects.toThrow();
    expect((await repo.getStatus(r.token)).ok).toBe(true);
  });
});
