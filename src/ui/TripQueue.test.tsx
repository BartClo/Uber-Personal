import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CancelResult } from '@/data/repo';
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

const cancelOk = async (): Promise<CancelResult> => ({ ok: true, trip: mk({ status: 'cancelled' }) });

describe('TripQueue: cancelar', () => {
  function setup(trip: Trip, onCancel: (id: string) => Promise<CancelResult> = cancelOk) {
    const spy = vi.fn(onCancel);
    render(<TripQueue trips={[trip]} drivers={[driver]} now={now} onAssignClick={() => {}} onCancel={spy} />);
    return spy;
  }
  const open = () => userEvent.click(screen.getByRole('button', { name: 'Cancelar el pedido de Cliente' }));

  it.each(['pending', 'assigned', 'en_route', 'on_board'] as const)(
    'en %s pide confirmación antes de cancelar',
    async (status) => {
      const onCancel = setup(mk({ id: 'x', status, driverId: status === 'pending' ? null : 'd1' }));
      await open();
      expect(screen.getByText('¿Cancelar este pedido?')).toBeInTheDocument();
      expect(onCancel).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
      expect(onCancel).toHaveBeenCalledWith('x');
    },
  );

  it('los viajes terminados no ofrecen cancelar', () => {
    setup(mk({ status: 'completed' }));
    expect(screen.queryByRole('button', { name: /Cancelar/ })).not.toBeInTheDocument();
  });

  it('"No" y Escape descartan sin cancelar y devuelven el foco', async () => {
    const onCancel = setup(mk({}));
    await open();
    expect(screen.getByRole('button', { name: 'No, mantener' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'No, mantener' }));
    expect(screen.queryByText('¿Cancelar este pedido?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar el pedido de Cliente' })).toHaveFocus();
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('¿Cancelar este pedido?')).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each([
    ['not_cancellable', 'Este pedido ya no se puede cancelar'],
    ['trip_not_found', 'Este pedido ya no existe'],
  ] as const)('error %s se informa en español', async (error, message) => {
    setup(mk({}), async () => ({ ok: false, error }));
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('un error de red se informa y permite reintentar', async () => {
    const onCancel = setup(mk({}), async () => {
      throw new Error('red');
    });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cancelar. Intenta de nuevo.');
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('mientras cancela no se puede repetir', async () => {
    const onCancel = setup(mk({}), () => new Promise<CancelResult>(() => {}));
    await open();
    const yes = screen.getByRole('button', { name: 'Sí, cancelar' });
    await userEvent.click(yes);
    expect(yes).toBeDisabled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('TripQueue', () => {
  it('ordena pendientes del más antiguo al más nuevo y cuenta', () => {
    const trips = [
      mk({ id: 'b', customerName: 'Beta', createdAt: '2026-11-02T11:58:00Z' }),
      mk({ id: 'c', customerName: 'Gama', createdAt: '2026-11-02T11:59:00Z' }),
      mk({ id: 'a', customerName: 'Alfa', createdAt: '2026-11-02T11:57:00Z' }),
    ];
    render(<TripQueue trips={trips} drivers={[]} now={now} onAssignClick={() => {}} onCancel={cancelOk} />);
    const names = screen.getAllByTestId('pending-name').map((n) => n.textContent);
    expect(names).toEqual(['Alfa', 'Beta', 'Gama']);
    expect(screen.getByText('3 en espera')).toBeInTheDocument();
    expect(screen.getByText(/En espera · hace 3 min/)).toBeInTheDocument();
  });
  it('sin coordenadas muestra aviso', () => {
    render(<TripQueue trips={[mk({ pickupLat: null, pickupLng: null })]} drivers={[]} now={now} onAssignClick={() => {}} onCancel={cancelOk} />);
    expect(screen.getByText('Sin ubicación en el mapa')).toBeInTheDocument();
  });
  it('clic en Asignar llama onAssignClick con el viaje', async () => {
    const onAssignClick = vi.fn();
    const trip = mk({ id: 'x' });
    render(<TripQueue trips={[trip]} drivers={[]} now={now} onAssignClick={onAssignClick} onCancel={cancelOk} />);
    await userEvent.click(screen.getByRole('button', { name: 'Asignar a Cliente' }));
    expect(onAssignClick).toHaveBeenCalledWith(trip);
  });
  it('on_board aparece en En curso con taxista; completados no', () => {
    const trips = [
      mk({ id: 'o', customerName: 'Olga', status: 'on_board', driverId: 'd1' }),
      mk({ id: 'z', customerName: 'Zeta', status: 'completed', driverId: 'd1' }),
    ];
    render(<TripQueue trips={trips} drivers={[driver]} now={now} onAssignClick={() => {}} onCancel={cancelOk} />);
    expect(screen.getByText('Cliente a bordo')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez · taxi 12')).toBeInTheDocument();
    expect(screen.queryByText('Zeta')).not.toBeInTheDocument();
  });
  it('taxista faltante muestra Taxista desconocido', () => {
    render(<TripQueue trips={[mk({ status: 'assigned', driverId: 'nope' })]} drivers={[]} now={now} onAssignClick={() => {}} onCancel={cancelOk} />);
    expect(screen.getByText('Taxista desconocido')).toBeInTheDocument();
  });
  it('cada viaje tiene enlace a Waze', () => {
    const t = { ...mk({ id: 'w', customerName: 'Wanda' }) };
    render(<TripQueue trips={[t]} drivers={[]} now={now} onAssignClick={() => {}} onCancel={cancelOk} />);
    const link = screen.getByRole('link', { name: 'Abrir en Waze el viaje de Wanda' });
    expect(link).toHaveAttribute('href', expect.stringContaining('https://www.waze.com/ul?'));
    expect(link).toHaveAttribute('target', '_blank');
  });
});
