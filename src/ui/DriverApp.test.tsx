import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DriverRepo } from '@/data/driverRepo';
import { fakeDriver, fakeTrip, FakeDriverRepo } from '@/data/fakeDriverRepo';
import type { Driver, Trip } from '@/domain/types';
import { DriverApp } from './DriverApp';
import type { GeolocationLike } from './useDriverLocation';

afterEach(cleanup);

const ME = 'me';
const T1 = 't1';

function setup(
  driver: Partial<Driver> | null = { status: 'free' },
  trip: Trip | null = null,
  geolocation: GeolocationLike | null = null,
  advanceCooldownMs = 0,
) {
  const repo = new FakeDriverRepo(ME);
  repo.seed({
    drivers: driver ? [fakeDriver(ME, driver)] : [],
    trips: trip ? [trip] : [],
  });
  const onSignOut = vi.fn();
  render(
    <DriverApp
      repo={repo}
      geolocation={geolocation}
      wakeLock={null}
      onSignOut={onSignOut}
      advanceCooldownMs={advanceCooldownMs}
    />,
  );
  return { repo, onSignOut };
}

describe('DriverApp', () => {
  it('muestra identidad y espera cuando no hay viaje', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: /07.*Carlos Rojas/ })).toBeInTheDocument();
    expect(screen.getByText('Taxi 07')).toBeInTheDocument();
    expect(screen.getByText('Libre')).toBeInTheDocument();
    expect(screen.getByText(/Esperando un viaje/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Progreso del viaje' })).not.toBeInTheDocument();
  });

  it('dice claramente que hay que mantener la app abierta', async () => {
    setup();
    expect(await screen.findByText(/Mantén esta app abierta/)).toBeInTheDocument();
  });

  it('cuenta sin taxi: lo explica y permite salir', async () => {
    const { onSignOut } = setup(null);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no está vinculada a un taxi/);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it('muestra el viaje, sin ninguna opción de rechazo', async () => {
    setup({ status: 'busy' }, fakeTrip(T1, 'assigned', ME));
    expect(await screen.findByText(/Viaje asignado · hace/)).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Av. Providencia 1234')).toBeInTheDocument();
    expect(screen.getByText('Aeropuerto SCL')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rechazar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /rechazar/i })).not.toBeInTheDocument();
  });

  it('stepper: 4 pasos, paso actual marcado sin depender del color', async () => {
    setup({ status: 'busy' }, fakeTrip(T1, 'en_route', ME));
    const list = await screen.findByRole('list', { name: 'Progreso del viaje' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/1 · Asignado/),
      expect.stringMatching(/2 · En camino/),
      expect.stringMatching(/3 · A bordo/),
      expect.stringMatching(/4 · Final/),
    ]);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).toHaveTextContent('✓');
    expect(items[0]).not.toHaveAttribute('aria-current');
  });

  it('enlaces: llamar y navegar al origen; a bordo navega al destino', async () => {
    setup({ status: 'busy' }, fakeTrip(T1, 'assigned', ME));
    expect(await screen.findByRole('link', { name: 'Llamar al cliente' })).toHaveAttribute(
      'href',
      'tel:+56955550100',
    );
    expect(screen.getByRole('link', { name: /Abrir navegación/ }).getAttribute('href')).toContain(
      'q=Av.+Providencia+1234',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Voy en camino' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cliente a bordo' }));
    await screen.findByRole('button', { name: 'Finalizar viaje' });
    expect(screen.getByRole('link', { name: /Abrir navegación/ }).getAttribute('href')).toContain(
      'q=Aeropuerto+SCL',
    );
  });

  it('avanza por todo el flujo y vuelve a esperar con el taxista libre', async () => {
    const { repo } = setup({ status: 'busy' }, fakeTrip(T1, 'assigned', ME));
    for (const name of ['Voy en camino', 'Cliente a bordo', 'Finalizar viaje']) {
      await userEvent.click(await screen.findByRole('button', { name }));
    }
    expect(await screen.findByText(/Esperando un viaje/)).toBeInTheDocument();
    expect(repo.tripById(T1).status).toBe('completed');
    expect(repo.driverById(ME).status).toBe('free');
  });

  it('un doble toque avanza una sola vez', async () => {
    const { repo } = setup({ status: 'busy' }, fakeTrip(T1, 'assigned', ME), null, 500);
    const button = await screen.findByRole('button', { name: 'Voy en camino' });
    await userEvent.dblClick(button);
    const next = await screen.findByRole('button', { name: 'Cliente a bordo' });
    expect(next).toBeDisabled();
    expect(repo.tripById(T1).status).toBe('en_route');
    await vi.waitFor(() => expect(next).toBeEnabled(), { timeout: 2000 });
    expect(repo.tripById(T1).status).toBe('en_route');
  });

  it('error al avanzar se informa y no rompe', async () => {
    const { repo } = setup({ status: 'busy' }, fakeTrip(T1, 'assigned', ME));
    vi.spyOn(repo, 'advanceTrip').mockRejectedValueOnce(new Error('red'));
    await userEvent.click(await screen.findByRole('button', { name: 'Voy en camino' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo actualizar/);
    expect(screen.getByRole('button', { name: 'Voy en camino' })).toBeEnabled();
  });

  it('muestra un viaje que llega por realtime', async () => {
    const { repo } = setup();
    await screen.findByText(/Esperando un viaje/);
    act(() => repo.addTrip(fakeTrip(T1, 'assigned', ME)));
    expect(await screen.findByRole('button', { name: 'Voy en camino' })).toBeInTheDocument();
  });

  it('el interruptor conecta y desconecta', async () => {
    const { repo } = setup({ status: 'offline' });
    const toggle = await screen.findByRole('switch', { name: 'Conectado' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveTextContent('No');
    expect(screen.getByText(/Conéctate para recibir viajes/)).toBeInTheDocument();
    await userEvent.click(toggle);
    await vi.waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(toggle).toHaveTextContent('Sí');
    expect(repo.driverById(ME).status).toBe('free');
    await userEvent.click(toggle);
    await vi.waitFor(() => expect(repo.driverById(ME).status).toBe('offline'));
  });

  it('no deja desconectarse con viaje activo y lo explica', async () => {
    const { repo } = setup({ status: 'busy' }, fakeTrip(T1, 'en_route', ME));
    await userEvent.click(await screen.findByRole('switch', { name: 'Conectado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/viaje activo/);
    expect(repo.driverById(ME).status).toBe('busy');
  });

  it('banner Reconectando…', async () => {
    const { repo } = setup();
    await screen.findByText('Taxi 07');
    act(() => repo.setConnection('reconnecting'));
    expect(screen.getByText('Reconectando…')).toBeInTheDocument();
    act(() => repo.setConnection('connected'));
    expect(screen.queryByText('Reconectando…')).not.toBeInTheDocument();
  });

  it('muestra el estado de la ubicación', async () => {
    setup();
    expect(await screen.findByText('Este dispositivo no tiene GPS')).toBeInTheDocument();
  });

  it('informa permiso denegado y reporta posiciones al repo', async () => {
    let onOk: Parameters<GeolocationLike['watchPosition']>[0] = () => undefined;
    let onErr: Parameters<GeolocationLike['watchPosition']>[1] = () => undefined;
    const geo: GeolocationLike = {
      watchPosition: (ok, err) => {
        onOk = ok;
        onErr = err;
        return 1;
      },
      clearWatch: () => undefined,
      getCurrentPosition: () => undefined,
    };
    const { repo } = setup({ status: 'free' }, null, geo);
    await screen.findByText('Buscando ubicación…');
    act(() => onOk({ coords: { latitude: -33.4, longitude: -70.6 } }));
    expect(await screen.findByText('Ubicación activa')).toBeInTheDocument();
    expect(repo.driverById(ME).lat).toBe(-33.4);
    act(() => onErr({ code: 1 }));
    expect(
      screen.getByText('Ubicación desactivada: activa el permiso del navegador'),
    ).toBeInTheDocument();
  });

  it('desconectado no envía ubicación', async () => {
    const geo: GeolocationLike = {
      watchPosition: vi.fn(() => 1),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
    };
    setup({ status: 'offline' }, null, geo);
    await screen.findByText(/Ubicación en pausa/);
    expect(geo.watchPosition).not.toHaveBeenCalled();
  });

  it('cerrar sesión desconecta primero al taxista libre', async () => {
    const { repo, onSignOut } = setup({ status: 'free' });
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    await vi.waitFor(() => expect(onSignOut).toHaveBeenCalled());
    expect(repo.driverById(ME).status).toBe('offline');
  });

  it('un error de carga permite reintentar', async () => {
    const repo: DriverRepo = new FakeDriverRepo(ME);
    (repo as FakeDriverRepo).seed({ drivers: [fakeDriver(ME, { status: 'free' })] });
    vi.spyOn(repo, 'getMe').mockRejectedValueOnce(new Error('red'));
    render(<DriverApp repo={repo} geolocation={null} wakeLock={null} onSignOut={() => undefined} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo cargar/);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Taxi 07')).toBeInTheDocument();
  });
});
