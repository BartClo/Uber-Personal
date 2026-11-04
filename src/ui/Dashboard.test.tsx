import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeRepo } from '@/data/fakeRepo';
import type { Driver, Trip } from '@/domain/types';
import { Dashboard } from './Dashboard';

vi.mock('./FleetMap', () => ({ FleetMap: () => <div data-testid="map-stub" /> }));

afterEach(cleanup);

const recent = () => new Date(Date.now() - 5_000).toISOString();
const drivers = (): Driver[] => [
  { id: 'd1', name: 'Ana Pérez', taxiNumber: '12', phone: '1', status: 'free', lat: -33.4, lng: -70.6, lastSeenAt: recent() },
  { id: 'd2', name: 'Luis Rojas', taxiNumber: '7', phone: '2', status: 'busy', lat: -33.41, lng: -70.61, lastSeenAt: recent() },
];
const trips = (): Trip[] => [
  {
    id: 't1', source: 'admin', customerName: 'Carla Díaz', customerPhone: '555',
    pickupAddress: 'Plaza', pickupLat: -33.4, pickupLng: -70.6, dropoffAddress: 'Aeropuerto',
    status: 'pending', driverId: null, createdAt: new Date(Date.now() - 60_000).toISOString(),
    assignedAt: null,
  },
];

function setup() {
  const repo = new FakeRepo();
  repo.seed({ drivers: drivers(), trips: trips() });
  render(<Dashboard repo={repo} />);
  return repo;
}

describe('Dashboard', () => {
  it('carga y muestra taxistas y pedidos sembrados', async () => {
    setup();
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Luis Rojas')).toBeInTheDocument();
    expect(screen.getByText('Carla Díaz')).toBeInTheDocument();
    expect(screen.getByText('1 libres')).toBeInTheDocument();
    expect(screen.getByTestId('map-stub')).toBeInTheDocument();
  });

  it('crear un pedido lo muestra en la cola', async () => {
    setup();
    await screen.findByText('Carla Díaz');
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo pedido' }));
    const form = screen.getByRole('form', { name: 'Nuevo pedido' });
    await userEvent.type(within(form).getByLabelText('Nombre del cliente'), 'Pedro Soto');
    await userEvent.type(within(form).getByLabelText('Teléfono'), '999');
    await userEvent.type(within(form).getByLabelText('Dirección de origen'), 'Centro');
    await userEvent.type(within(form).getByLabelText('Dirección de destino'), 'Puerto');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear pedido' }));
    const pending = screen.getByRole('list', { name: 'Pedidos en espera' });
    expect(await within(pending).findByText('Pedro Soto')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Nuevo pedido' })).not.toBeInTheDocument();
  });

  it('el botón "Nuevo pedido" oculta y muestra el formulario', async () => {
    setup();
    await screen.findByText('Carla Díaz');
    const toggle = screen.getByRole('button', { name: 'Nuevo pedido' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('form', { name: 'Nuevo pedido' })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByRole('form', { name: 'Nuevo pedido' })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByRole('form', { name: 'Nuevo pedido' })).not.toBeInTheDocument();
  });

  it('asignar mueve el pedido a "En curso" y el taxista queda "En viaje"', async () => {
    setup();
    await screen.findByText('Carla Díaz');
    await userEvent.click(screen.getByRole('button', { name: /Asignar a Carla Díaz/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar a Ana Pérez' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const active = screen.getByRole('list', { name: 'Pedidos en curso' });
    expect(within(active).getByText('Carla Díaz')).toBeInTheDocument();
    expect(within(active).getByText('Ana Pérez · taxi 12')).toBeInTheDocument();
    expect(screen.getByText('2 en viaje')).toBeInTheDocument();
  });

  it('cancelar un pedido lo saca de la cola', async () => {
    const repo = setup();
    await screen.findByText('Carla Díaz');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar el pedido de Carla Díaz' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    expect(await screen.findByText('No hay pedidos en espera')).toBeInTheDocument();
    expect(screen.queryByText('Carla Díaz')).not.toBeInTheDocument();
    expect((await repo.listTrips())[0]?.status).toBe('cancelled');
  });

  it('cancelar un viaje en curso libera al taxista', async () => {
    setup();
    await screen.findByText('Carla Díaz');
    await userEvent.click(screen.getByRole('button', { name: /Asignar a Carla Díaz/ }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Asignar a Ana Pérez' }),
    );
    expect(screen.getByText('2 en viaje')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar el pedido de Carla Díaz' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    expect(await screen.findByText('Ningún viaje en curso')).toBeInTheDocument();
    expect(screen.getByText('1 en viaje')).toBeInTheDocument();
    expect(screen.getByText('1 libres')).toBeInTheDocument();
  });

  it('muestra y oculta "Reconectando…" según la conexión', async () => {
    const repo = setup();
    await screen.findByText('Ana Pérez');
    expect(screen.queryByText('Reconectando…')).not.toBeInTheDocument();
    act(() => repo.setConnection('reconnecting'));
    expect(screen.getByText('Reconectando…')).toBeInTheDocument();
    act(() => repo.setConnection('connected'));
    expect(screen.queryByText('Reconectando…')).not.toBeInTheDocument();
  });

  it('error de carga muestra "Reintentar" y recarga', async () => {
    const repo = new FakeRepo();
    const spy = vi.spyOn(repo, 'listDrivers').mockRejectedValueOnce(new Error('x'));
    render(<Dashboard repo={repo} />);
    expect(await screen.findByText('No se pudieron cargar los datos.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('No se pudieron cargar los datos.')).not.toBeInTheDocument();
  });

  it('limpia suscripciones al desmontar', async () => {
    const repo = new FakeRepo();
    const { unmount } = render(<Dashboard repo={repo} />);
    await screen.findByText('0 libres');
    unmount();
    expect(() => repo.setConnection('reconnecting')).not.toThrow();
    expect(() => repo.seed({ drivers: drivers() })).not.toThrow();
  });
  it('la carga inicial tardía no pisa datos más nuevos de la suscripción', async () => {
    const repo = new FakeRepo();
    let resolveDrivers: (d: Driver[]) => void = () => {};
    vi.spyOn(repo, 'listDrivers').mockReturnValueOnce(
      new Promise<Driver[]>((r) => { resolveDrivers = r; }),
    );
    render(<Dashboard repo={repo} />);
    act(() => repo.seed({ drivers: drivers() }));
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    await act(async () => { resolveDrivers([]); });
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
  });

  it('cierra el diálogo si el pedido seleccionado desaparece', async () => {
    const repo = setup();
    await screen.findByText('Carla Díaz');
    await userEvent.click(screen.getByRole('button', { name: /Asignar a Carla Díaz/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => repo.seed({ trips: [] }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => repo.seed({ trips: trips() }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
