import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Driver, Trip } from '@/domain/types';
import { TripQueue } from './TripQueue';

afterEach(cleanup);

const now = new Date('2026-11-02T12:00:00Z');
const mk = (o: Partial<Trip>): Trip => ({
  id: 't', source: 'admin', customerName: 'Cliente', customerPhone: '555',
  pickupAddress: 'Origen', pickupLat: -33.4, pickupLng: -70.6, dropoffAddress: 'Destino',
  status: 'pending', driverId: null, createdAt: '2026-11-02T11:59:00Z', assignedAt: null, ...o,
});
const driver: Driver = {
  id: 'd1', name: 'Ana Pérez', taxiNumber: '12', phone: '1', status: 'busy',
  lat: null, lng: null, lastSeenAt: null,
};

describe('TripQueue', () => {
  it('ordena pendientes del más antiguo al más nuevo y cuenta', () => {
    const trips = [
      mk({ id: 'b', customerName: 'Beta', createdAt: '2026-11-02T11:58:00Z' }),
      mk({ id: 'c', customerName: 'Gama', createdAt: '2026-11-02T11:59:00Z' }),
      mk({ id: 'a', customerName: 'Alfa', createdAt: '2026-11-02T11:57:00Z' }),
    ];
    render(<TripQueue trips={trips} drivers={[]} now={now} onAssignClick={() => {}} />);
    const names = screen.getAllByTestId('pending-name').map((n) => n.textContent);
    expect(names).toEqual(['Alfa', 'Beta', 'Gama']);
    expect(screen.getByText('3 en espera')).toBeInTheDocument();
    expect(screen.getByText(/En espera · hace 3 min/)).toBeInTheDocument();
  });
  it('sin coordenadas muestra aviso', () => {
    render(<TripQueue trips={[mk({ pickupLat: null, pickupLng: null })]} drivers={[]} now={now} onAssignClick={() => {}} />);
    expect(screen.getByText('Sin ubicación en el mapa')).toBeInTheDocument();
  });
  it('clic en Asignar llama onAssignClick con el viaje', async () => {
    const onAssignClick = vi.fn();
    const trip = mk({ id: 'x' });
    render(<TripQueue trips={[trip]} drivers={[]} now={now} onAssignClick={onAssignClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Asignar a Cliente' }));
    expect(onAssignClick).toHaveBeenCalledWith(trip);
  });
  it('on_board aparece en En curso con taxista; completados no', () => {
    const trips = [
      mk({ id: 'o', customerName: 'Olga', status: 'on_board', driverId: 'd1' }),
      mk({ id: 'z', customerName: 'Zeta', status: 'completed', driverId: 'd1' }),
    ];
    render(<TripQueue trips={trips} drivers={[driver]} now={now} onAssignClick={() => {}} />);
    expect(screen.getByText('Cliente a bordo')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez · taxi 12')).toBeInTheDocument();
    expect(screen.queryByText('Zeta')).not.toBeInTheDocument();
  });
  it('taxista faltante muestra Taxista desconocido', () => {
    render(<TripQueue trips={[mk({ status: 'assigned', driverId: 'nope' })]} drivers={[]} now={now} onAssignClick={() => {}} />);
    expect(screen.getByText('Taxista desconocido')).toBeInTheDocument();
  });
  it('cada viaje tiene enlace a Waze', () => {
    const t = { ...mk({ id: 'w', customerName: 'Wanda' }) };
    render(<TripQueue trips={[t]} drivers={[]} now={now} onAssignClick={() => {}} />);
    const link = screen.getByRole('link', { name: 'Abrir en Waze el viaje de Wanda' });
    expect(link).toHaveAttribute('href', expect.stringContaining('https://www.waze.com/ul?'));
    expect(link).toHaveAttribute('target', '_blank');
  });
});
