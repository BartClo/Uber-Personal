import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);
import type { Driver } from '@/domain/types';
import { DriverList } from './DriverList';

const now = new Date('2026-11-02T12:00:00Z');
const mk = (o: Partial<Driver>): Driver => ({
  id: 'd', name: 'Nombre', taxiNumber: '1', phone: '1', status: 'free',
  lat: -33.4, lng: -70.6, lastSeenAt: '2026-11-02T11:59:40Z', ...o,
});

describe('DriverList', () => {
  it('sin señal para lastSeenAt null', () => {
    render(<DriverList now={now} drivers={[mk({ id: 'a', name: 'Ana', lastSeenAt: null })]} />);
    const row = screen.getByText('Ana').closest('li')!;
    expect(row).toHaveAttribute('data-stale', 'true');
    expect(row).toHaveTextContent(/Sin señal · sin señal/);
  });
  it('visto hace 20 s no es stale, aun sin coordenadas', () => {
    render(<DriverList now={now} drivers={[mk({ name: 'Beto', lat: null, lng: null })]} />);
    const row = screen.getByText('Beto').closest('li')!;
    expect(row).not.toHaveAttribute('data-stale');
    expect(row).toHaveTextContent('Libre · hace 20 s');
  });
  it('filtro Libres oculta busy y offline; cuenta y orden', async () => {
    const drivers = [
      mk({ id: '3', taxiNumber: '30', name: 'C', status: 'busy' }),
      mk({ id: '1', taxiNumber: '10', name: 'A', status: 'free' }),
      mk({ id: '2', taxiNumber: '20', name: 'B', status: 'offline' }),
    ];
    render(<DriverList now={now} drivers={drivers} />);
    expect(screen.getByText('3 en la flota')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    const names = () => within(screen.getByRole('list')).getAllByRole('listitem').map((l) => l.textContent);
    expect(names()).toHaveLength(3);
    expect(names()[0]).toContain('A');
    await userEvent.click(screen.getByRole('button', { name: 'Libres' }));
    expect(screen.getByRole('button', { name: 'Libres' })).toHaveAttribute('aria-pressed', 'true');
    expect(names()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'En viaje' }));
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('C');
  });
});
