import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClientRepo } from '@/data/clientRepo';
import { TrackingScreen } from './TrackingScreen';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function setup() {
  const repo = new FakeClientRepo();
  const r = await repo.requestTrip({ pickup: 'Calle 1', dropoff: 'Calle 2', name: 'Ana', phone: '555' });
  if (!r.ok) throw new Error('x');
  return { repo, token: r.token };
}

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('TrackingScreen', () => {
  it('shows pending status and addresses, then picks up the assignment on poll', async () => {
    const { repo, token } = await setup();
    render(<TrackingScreen repo={repo} token={token} pollMs={5000} />);
    await flush();
    expect(screen.getByText('Buscando tu taxi…')).toBeInTheDocument();
    expect(screen.getByText('Calle 1')).toBeInTheDocument();
    repo.setStatus(token, 'assigned', { firstName: 'Carlos', taxiNumber: '07' });
    await tick(5000);
    expect(screen.getByText('Tu taxi fue asignado')).toBeInTheDocument();
    expect(screen.getByText('Taxi 07 · Carlos')).toBeInTheDocument();
  });

  it('renders a step list marking the current step', async () => {
    const { repo, token } = await setup();
    repo.setStatus(token, 'en_route', { firstName: 'Carlos', taxiNumber: '07' });
    render(<TrackingScreen repo={repo} token={token} pollMs={5000} />);
    await flush();
    const current = screen.getByRole('listitem', { current: 'step' });
    expect(current).toHaveTextContent('En camino');
  });

  it('shows not_found message and stops polling', async () => {
    const repo = new FakeClientRepo();
    const spy = vi.spyOn(repo, 'getStatus');
    render(<TrackingScreen repo={repo} token="nope" pollMs={5000} />);
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('No encontramos este viaje');
    await tick(15000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('shows Reconectando… on network failure and recovers', async () => {
    const { repo, token } = await setup();
    render(<TrackingScreen repo={repo} token={token} pollMs={5000} />);
    await flush();
    repo.failNext(1);
    await tick(5000);
    expect(screen.getByText('Reconectando…')).toBeInTheDocument();
    expect(screen.getByText('Buscando tu taxi…')).toBeInTheDocument();
    await tick(5000);
    expect(screen.queryByText('Reconectando…')).not.toBeInTheDocument();
  });

  it('shows Reconectando… if the first fetch fails', async () => {
    const { repo, token } = await setup();
    repo.failNext(1);
    render(<TrackingScreen repo={repo} token={token} pollMs={5000} />);
    await flush();
    expect(screen.getByText('Reconectando…')).toBeInTheDocument();
  });

  it('cleans up the interval on unmount and stops on a final status', async () => {
    const { repo, token } = await setup();
    const spy = vi.spyOn(repo, 'getStatus');
    const { unmount } = render(<TrackingScreen repo={repo} token={token} pollMs={5000} />);
    await flush();
    unmount();
    await tick(20000);
    expect(spy).toHaveBeenCalledTimes(1);

    const second = await setup();
    second.repo.setStatus(second.token, 'completed', { firstName: 'C', taxiNumber: '1' });
    const spy2 = vi.spyOn(second.repo, 'getStatus');
    render(<TrackingScreen repo={second.repo} token={second.token} pollMs={5000} />);
    await flush();
    await tick(20000);
    expect(spy2).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Viaje finalizado')).toBeInTheDocument();
  });
});
