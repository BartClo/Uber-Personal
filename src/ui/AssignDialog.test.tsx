import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssignResult } from '@/data/repo';
import type { Driver, Trip } from '@/domain/types';
import { AssignDialog } from './AssignDialog';

afterEach(cleanup);

const now = new Date('2026-11-02T12:00:00Z');
const mk = (o: Partial<Driver>): Driver => ({
  id: 'd', name: 'Nombre', taxiNumber: '1', phone: '1', status: 'free',
  lat: -33.4, lng: -70.6, lastSeenAt: '2026-11-02T11:59:50Z', ...o,
});
const trip: Trip = {
  id: 't', source: 'admin', customerName: 'Carla', customerPhone: '1',
  pickupAddress: 'Av. Siempre Viva 742', pickupLat: -33.4, pickupLng: -70.6,
  dropoffAddress: 'B', status: 'pending', driverId: null,
  createdAt: '2026-11-02T11:00:00Z', assignedAt: null,
};
const okFn = async (): Promise<AssignResult> => ({ ok: true, trip });
const setup = (drivers: Driver[], onAssign: (id: string) => Promise<AssignResult> = okFn) => {
  const spy = vi.fn(onAssign);
  const onClose = vi.fn();
  render(<AssignDialog trip={trip} drivers={drivers} now={now} onAssign={spy} onClose={onClose} />);
  return { onAssign: spy, onClose };
};

describe('AssignDialog', () => {
  it('Tab desde el último elemento enfocable vuelve al primero y Shift+Tab al último', async () => {
    setup([mk({ id: 'a', name: 'Ana' })]);
    const close = screen.getByRole('button', { name: 'Cerrar' });
    const assign = screen.getByRole('button', { name: 'Asignar a Ana' });
    assign.focus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(assign).toHaveFocus();
  });
  it('restaura el foco al elemento previo al desmontar', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(
      <AssignDialog trip={trip} drivers={[mk({})]} now={now} onAssign={okFn} onClose={() => {}} />,
    );
    expect(opener).not.toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
  it('Escape con la confirmación abierta solo la descarta', async () => {
    const stale = mk({ id: 's', name: 'Sara', lastSeenAt: '2026-11-02T10:00:00Z' });
    const { onClose } = setup([stale]);
    await userEvent.click(screen.getByRole('button', { name: 'Asignar a Sara' }));
    expect(screen.getByRole('button', { name: 'Asignar igual' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Asignar igual' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('es un diálogo modal con título, pedido y foco dentro', () => {
    setup([mk({ id: 'a', name: 'Ana' })]);
    const dlg = screen.getByRole('dialog', { name: 'Asignar a' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(dlg).toHaveTextContent('Más cerca primero');
    expect(dlg).toHaveTextContent('Carla');
    expect(dlg).toHaveTextContent('Av. Siempre Viva 742');
    expect(dlg.contains(document.activeElement)).toBe(true);
  });
  it('Escape y Cerrar llaman onClose', async () => {
    const { onClose } = setup([mk({})]);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it('asigna directo y cierra con ok:true', async () => {
    const { onAssign, onClose } = setup([mk({ id: 'a', name: 'Ana' })]);
    await userEvent.click(screen.getByRole('button', { name: /^Asignar/ }));
    expect(onAssign).toHaveBeenCalledWith('a');
    expect(onClose).toHaveBeenCalled();
  });
  it('señal vieja pide confirmar y solo asigna tras confirmar', async () => {
    const { onAssign } = setup([mk({ id: 'a', name: 'Ana', lastSeenAt: '2026-11-02T11:56:50Z' })]);
    await userEvent.click(screen.getByRole('button', { name: /^Asignar/ }));
    expect(screen.getByText('Sin señal hace 3 min. ¿Asignar igual?')).toBeInTheDocument();
    expect(onAssign).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Asignar igual' }));
    expect(onAssign).toHaveBeenCalledWith('a');
  });
  it('Cancelar vuelve sin asignar', async () => {
    const { onAssign } = setup([mk({ lastSeenAt: null })]);
    await userEvent.click(screen.getByRole('button', { name: /^Asignar/ }));
    expect(screen.getByText('Sin señal. ¿Asignar igual?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText(/¿Asignar igual\?/)).not.toBeInTheDocument();
    expect(onAssign).not.toHaveBeenCalled();
  });
  it('no asignables tienen el botón deshabilitado', () => {
    setup([mk({ id: 'b', name: 'Beto', status: 'busy' }), mk({ id: 'o', name: 'Omar', status: 'offline' })]);
    for (const b of screen.getAllByRole('button', { name: /^Asignar/ })) expect(b).toBeDisabled();
  });
  it.each([
    ['already_assigned', 'Este viaje ya fue asignado por otra persona'],
    ['driver_unavailable', 'Ese taxista ya no está disponible'],
    ['trip_not_found', 'Este pedido ya no existe'],
  ] as const)('error %s muestra mensaje y no cierra', async (error, msg) => {
    const { onClose } = setup([mk({})], async () => ({ ok: false, error }));
    await userEvent.click(screen.getByRole('button', { name: /^Asignar/ }));
    expect(await screen.findByText(msg)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    if (error === 'already_assigned') {
      expect(screen.getByRole('button', { name: /^Asignar/ })).toBeDisabled();
    }
  });
  it('rechazo de red muestra mensaje y sigue abierto', async () => {
    const { onClose } = setup([mk({})], async () => {
      throw new Error('net');
    });
    await userEvent.click(screen.getByRole('button', { name: /^Asignar/ }));
    expect(await screen.findByText('No se pudo asignar. Intenta de nuevo.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Asignar/ })).toBeEnabled();
  });
  it('mientras está pendiente deshabilita todos los Asignar', async () => {
    let resolve: (r: AssignResult) => void = () => {};
    setup(
      [mk({ id: 'a', name: 'Ana' }), mk({ id: 'b', name: 'Bea' })],
      () => new Promise<AssignResult>((r) => { resolve = r; }),
    );
    await userEvent.click(screen.getAllByRole('button', { name: /^Asignar/ })[0]!);
    for (const b of screen.getAllByRole('button', { name: /^Asignar/ })) expect(b).toBeDisabled();
    resolve({ ok: false, error: 'driver_unavailable' });
    expect(await screen.findByText('Ese taxista ya no está disponible')).toBeInTheDocument();
  });
  it('si el taxista deja de ser asignable con la confirmación abierta, no hay Asignar igual', async () => {
    const d = mk({ id: 'a', lastSeenAt: null });
    const onAssign = vi.fn(okFn);
    const props = { trip, now, onAssign, onClose: vi.fn() };
    const { rerender } = render(<AssignDialog {...props} drivers={[d]} />);
    await userEvent.click(screen.getByRole('button', { name: /^Asignar/ }));
    expect(screen.getByRole('button', { name: 'Asignar igual' })).toBeEnabled();
    rerender(<AssignDialog {...props} drivers={[{ ...d, status: 'offline' }]} />);
    expect(screen.queryByRole('button', { name: 'Asignar igual' })).not.toBeInTheDocument();
  });
  it('Escape y Cerrar no cierran mientras está pendiente', async () => {
    const { onClose } = setup([mk({})], () => new Promise<AssignResult>(() => {}));
    await userEvent.click(screen.getByRole('button', { name: /^Asignar/ }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
  });
});
