import { describe, expect, it, vi } from 'vitest';
import { OTHER_DRIVER_ID, runDriverRepoContract } from './driverRepo.contract';
import { fakeDriver, fakeTrip, FakeDriverRepo } from './fakeDriverRepo';

const ME = '00000000-0000-4000-8000-0000000000c1';

runDriverRepoContract(() => {
  const repo = new FakeDriverRepo(ME);
  repo.seed({ drivers: [fakeDriver(ME), fakeDriver(OTHER_DRIVER_ID)] });
  repo.setConnection('connected');
  return Promise.resolve({
    repo,
    meId: ME,
    setMyStatus: (status) => {
      repo.patchDriver(ME, { status });
      return Promise.resolve();
    },
    addTrip: (status, driverId) => {
      const trip = fakeTrip(crypto.randomUUID(), status, driverId);
      repo.addTrip(trip);
      return Promise.resolve(trip.id);
    },
    readTripStatus: (id) => Promise.resolve(repo.tripById(id).status),
    readDriver: (id) => Promise.resolve(repo.driverById(id)),
    assignToMe: (tripId) => {
      repo.assign(tripId, ME);
      return Promise.resolve();
    },
    unlinkedRepo: () => Promise.resolve(new FakeDriverRepo(null)),
  });
});

describe('FakeDriverRepo', () => {
  it('setConnection notifica a los suscriptores', () => {
    const repo = new FakeDriverRepo(ME);
    const cb = vi.fn();
    repo.subscribeConnection(cb);
    repo.setConnection('reconnecting');
    expect(cb).toHaveBeenCalledWith('reconnecting');
  });
});
