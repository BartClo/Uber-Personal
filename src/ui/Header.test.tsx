import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Driver } from '@/domain/types';
import { Header } from './Header';

afterEach(cleanup);

const now = new Date('2026-11-02T12:00:00Z');
const fresh = '2026-11-02T11:59:50Z';
const mk = (o: Partial<Driver>): Driver => ({
  id: 'd', name: 'N', taxiNumber: '1', phone: '1', status: 'free',
  lat: 0, lng: 0, lastSeenAt: fresh, ...o,
});

describe('Header', () => {
  it('cuenta libres, en viaje y sin señal', () => {
    const drivers = [
      mk({ id: 'a' }),
      mk({ id: 'b' }),
      mk({ id: 'c', status: 'busy' }),
      mk({ id: 'd', lastSeenAt: '2026-11-02T11:50:00Z' }),
      mk({ id: 'e', status: 'offline', lastSeenAt: null }),
    ];
    render(<Header drivers={drivers} now={now} connection="connected" />);
    expect(screen.getByRole('heading', { name: 'Despacho' })).toBeInTheDocument();
    expect(screen.getByText('2 libres')).toBeInTheDocument();
    expect(screen.getByText('1 en viaje')).toBeInTheDocument();
    expect(screen.getByText('1 sin señal')).toBeInTheDocument();
    expect(screen.getByText('En vivo')).toBeInTheDocument();
  });
  it('oculta "En vivo" al reconectar', () => {
    render(<Header drivers={[]} now={now} connection="reconnecting" />);
    expect(screen.queryByText('En vivo')).not.toBeInTheDocument();
  });
});
