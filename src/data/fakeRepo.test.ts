import { describe, expect, it, vi } from 'vitest';
import type { Driver, Trip } from '../domain/types';
import { FakeRepo } from './fakeRepo';
import { runRepoContract } from './repo.contract';

runRepoContract(async () => new FakeRepo());

const drv: Driver = {
  id: 'd1',
  name: 'Luis',
  taxiNumber: '12',
  phone: '555',
  status: 'free',
  lat: null,
  lng: null,
  lastSeenAt: null,
};
const trp: Trip = {
  id: 't1',
  source: 'admin',
  customerName: 'Ana',
  customerPhone: '555',
  pickupAddress: 'A',
  pickupLat: null,
  pickupLng: null,
  dropoffAddress: 'B',
  status: 'pending',
  driverId: null,
  createdAt: '2026-11-02T10:00:00.000Z',
  assignedAt: null,
};

describe('FakeRepo specifics', () => {
  it('assignTrip notifies driver and trip subscribers', async () => {
    const repo = new FakeRepo();
    repo.seed({ drivers: [drv], trips: [trp] });
    const onDrivers = vi.fn<(d: Driver[]) => void>();
    const onTrips = vi.fn<(t: Trip[]) => void>();
    repo.subscribeDrivers(onDrivers);
    repo.subscribeTrips(onTrips);
    await repo.assignTrip('t1', 'd1');
    expect(onDrivers).toHaveBeenCalledTimes(1);
    expect(onDrivers.mock.calls[0]?.[0][0]?.status).toBe('busy');
    expect(onTrips).toHaveBeenCalledTimes(1);
    expect(onTrips.mock.calls[0]?.[0][0]?.status).toBe('assigned');
  });

  it('seed notifies subscribers', () => {
    const repo = new FakeRepo();
    const onDrivers = vi.fn();
    const onTrips = vi.fn();
    repo.subscribeDrivers(onDrivers);
    repo.subscribeTrips(onTrips);
    repo.seed({ drivers: [drv], trips: [trp] });
    expect(onDrivers).toHaveBeenCalledTimes(1);
    expect(onTrips).toHaveBeenCalledTimes(1);
  });

  it('setConnection notifies subscribeConnection subscribers; unsubscribe stops', () => {
    const repo = new FakeRepo();
    const cb = vi.fn();
    const off = repo.subscribeConnection(cb);
    repo.setConnection('reconnecting');
    expect(cb).toHaveBeenCalledWith('reconnecting');
    off();
    repo.setConnection('connected');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('callbacks receive copies: mutating them does not change repo state', async () => {
    const repo = new FakeRepo();
    repo.seed({ drivers: [drv], trips: [trp] });
    let received: Trip[] = [];
    repo.subscribeTrips((t) => {
      received = t;
    });
    await repo.createTrip({ ...trp });
    const first = received[0];
    if (first) first.customerName = 'HACKED';
    received.pop();
    const listed = await repo.listTrips();
    expect(listed).toHaveLength(2);
    expect(listed[0]?.customerName).toBe('Ana');
    const mine = listed[0];
    if (mine) mine.customerName = 'X';
    expect((await repo.listTrips())[0]?.customerName).toBe('Ana');
  });
});
