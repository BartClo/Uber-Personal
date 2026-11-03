import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewTripForm } from './NewTripForm';

afterEach(cleanup);

async function fill(name = 'Luis', phone = '555', from = 'Calle 1', to = 'Calle 2') {
  const u = userEvent.setup();
  if (name) await u.type(screen.getByLabelText('Nombre del cliente'), name);
  if (phone) await u.type(screen.getByLabelText('Teléfono'), phone);
  if (from) await u.type(screen.getByLabelText('Dirección de origen'), from);
  if (to) await u.type(screen.getByLabelText('Dirección de destino'), to);
  return u;
}

describe('NewTripForm', () => {
  it('nombre vacío: no envía y muestra todos los errores', async () => {
    const onSubmit = vi.fn();
    render(<NewTripForm onSubmit={onSubmit} />);
    const u = await fill('', '555', '', 'x');
    await u.click(screen.getByRole('button', { name: 'Crear pedido' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Falta el nombre del cliente')).toBeInTheDocument();
    expect(screen.getByText('Falta la dirección de origen')).toBeInTheDocument();
    expect(screen.queryByText('Falta el teléfono')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del cliente')).toHaveAccessibleDescription('Falta el nombre del cliente');
  });
  it('envía recortado con coordenadas null y se limpia', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NewTripForm onSubmit={onSubmit} />);
    const u = await fill(' Luis ');
    await u.click(screen.getByRole('button', { name: 'Crear pedido' }));
    expect(onSubmit).toHaveBeenCalledWith({
      customerName: 'Luis', customerPhone: '555', pickupAddress: 'Calle 1',
      pickupLat: null, pickupLng: null, dropoffAddress: 'Calle 2',
    });
    expect(screen.getByLabelText('Nombre del cliente')).toHaveValue('');
  });
  it('si rechaza muestra error y conserva datos', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('x'));
    render(<NewTripForm onSubmit={onSubmit} />);
    const u = await fill();
    await u.click(screen.getByRole('button', { name: 'Crear pedido' }));
    expect(await screen.findByText('No se pudo crear el pedido. Intenta de nuevo.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del cliente')).toHaveValue('Luis');
    expect(screen.getByRole('button', { name: 'Crear pedido' })).toBeEnabled();
  });
  it('deshabilita el botón mientras envía', async () => {
    let resolve!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    render(<NewTripForm onSubmit={onSubmit} />);
    const u = await fill();
    await u.click(screen.getByRole('button', { name: 'Crear pedido' }));
    expect(screen.getByRole('button', { name: /Creando/ })).toBeDisabled();
    resolve();
    expect(await screen.findByRole('button', { name: 'Crear pedido' })).toBeEnabled();
  });
});
