import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientRepo, RequestTripResult } from '@/data/clientRepo';
import type { Geocoder } from '@/data/geocoder';
import { RequestForm } from './RequestForm';

afterEach(cleanup);

const noGeocoder: Geocoder = { search: async () => [] };
const APOQ = { label: 'Avenida Apoquindo 3000, Las Condes', lat: -33.41, lng: -70.57 };

function repoWith(fn: ClientRepo['requestTrip']): ClientRepo {
  return { requestTrip: fn, getStatus: vi.fn() };
}

async function fill(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText('Dónde te recogemos'), 'Calle 1');
  await u.type(screen.getByLabelText('A dónde vas'), 'Calle 2');
  await u.type(screen.getByLabelText('Tu nombre'), 'Ana');
  await u.type(screen.getByLabelText('Teléfono'), '555 0100');
}

describe('RequestForm', () => {
  it('shows inline errors linked by aria-describedby and does not submit', async () => {
    const requestTrip = vi.fn();
    render(<RequestForm geocoder={noGeocoder} repo={repoWith(requestTrip)} onSuccess={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pedir taxi' }));
    expect(requestTrip).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tu nombre')).toHaveAccessibleDescription('Falta tu nombre');
    expect(screen.getByLabelText('A dónde vas')).toHaveAccessibleDescription('Falta el destino');
    expect(screen.getByLabelText('Teléfono')).toHaveAccessibleDescription('Falta tu teléfono');
  });

  it('clears only the edited field error when the user types in it', async () => {
    render(<RequestForm geocoder={noGeocoder} repo={repoWith(vi.fn())} onSuccess={vi.fn()} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Pedir taxi' }));
    const name = screen.getByLabelText('Tu nombre');
    await u.type(name, 'A');
    expect(name).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Falta tu nombre')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono')).toHaveAccessibleDescription('Falta tu teléfono');
  });

  it('submits trimmed data and calls onSuccess with the token', async () => {
    const requestTrip = vi.fn().mockResolvedValue({ ok: true, token: 'tok' });
    const onSuccess = vi.fn();
    render(<RequestForm geocoder={noGeocoder} repo={repoWith(requestTrip)} onSuccess={onSuccess} />);
    const u = userEvent.setup();
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Pedir taxi' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('tok'));
    expect(requestTrip).toHaveBeenCalledWith({
      pickup: 'Calle 1',
      dropoff: 'Calle 2',
      name: 'Ana',
      phone: '555 0100',
      pickupLat: null,
      pickupLng: null,
    });
  });

  it('guards against double submit', async () => {
    let resolve: (r: RequestTripResult) => void = () => undefined;
    const requestTrip = vi.fn(
      () =>
        new Promise<RequestTripResult>((r) => {
          resolve = r;
        }),
    );
    render(<RequestForm geocoder={noGeocoder} repo={repoWith(requestTrip)} onSuccess={vi.fn()} />);
    const u = userEvent.setup();
    await fill(u);
    const btn = screen.getByRole('button', { name: 'Pedir taxi' });
    await u.click(btn);
    await u.click(screen.getByRole('button', { name: 'Enviando…' }));
    expect(requestTrip).toHaveBeenCalledTimes(1);
    resolve({ ok: true, token: 't' });
  });

  it('shows a rate-limit message', async () => {
    const requestTrip = vi.fn().mockResolvedValue({ ok: false, error: 'too_many_requests' });
    render(<RequestForm geocoder={noGeocoder} repo={repoWith(requestTrip)} onSuccess={vi.fn()} />);
    const u = userEvent.setup();
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Pedir taxi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes varios pedidos activos');
  });

  it('shows a network error and re-enables the button', async () => {
    const requestTrip = vi.fn().mockRejectedValue(new Error('x'));
    render(<RequestForm geocoder={noGeocoder} repo={repoWith(requestTrip)} onSuccess={vi.fn()} />);
    const u = userEvent.setup();
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Pedir taxi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos enviar tu pedido');
    expect(screen.getByRole('button', { name: 'Pedir taxi' })).toBeEnabled();
  });

  describe('autocompletado', () => {
    const geocoder: Geocoder = { search: async () => [APOQ] };
    async function pick(u: ReturnType<typeof userEvent.setup>, label: string) {
      await u.type(screen.getByLabelText(label), 'Apoquindo');
      await u.click(await screen.findByRole('option', { name: APOQ.label }));
    }
    async function fillRest(u: ReturnType<typeof userEvent.setup>) {
      await u.type(screen.getByLabelText('Tu nombre'), 'Ana');
      await u.type(screen.getByLabelText('Teléfono'), '555 0100');
    }

    it('elegir una sugerencia de origen envía sus coordenadas; el destino solo texto', async () => {
      const requestTrip = vi.fn().mockResolvedValue({ ok: true, token: 'tok' });
      render(<RequestForm geocoder={geocoder} repo={repoWith(requestTrip)} onSuccess={vi.fn()} />);
      const u = userEvent.setup();
      await pick(u, 'Dónde te recogemos');
      await pick(u, 'A dónde vas');
      await fillRest(u);
      await u.click(screen.getByRole('button', { name: 'Pedir taxi' }));
      expect(requestTrip).toHaveBeenCalledWith({
        pickup: APOQ.label,
        dropoff: APOQ.label,
        name: 'Ana',
        phone: '555 0100',
        pickupLat: APOQ.lat,
        pickupLng: APOQ.lng,
      });
    });

    it('editar el origen después de elegir descarta las coordenadas', async () => {
      const requestTrip = vi.fn().mockResolvedValue({ ok: true, token: 'tok' });
      render(<RequestForm geocoder={geocoder} repo={repoWith(requestTrip)} onSuccess={vi.fn()} />);
      const u = userEvent.setup();
      await pick(u, 'Dónde te recogemos');
      await u.type(screen.getByLabelText('Dónde te recogemos'), ' esquina');
      await u.type(screen.getByLabelText('A dónde vas'), 'Aeropuerto');
      await fillRest(u);
      await u.click(screen.getByRole('button', { name: 'Pedir taxi' }));
      expect(requestTrip).toHaveBeenCalledWith(
        expect.objectContaining({ pickup: `${APOQ.label} esquina`, pickupLat: null, pickupLng: null }),
      );
    });

    it('si el geocodificador falla el texto libre se envía igual', async () => {
      const failing: Geocoder = {
        search: async () => {
          throw new Error('503');
        },
      };
      const requestTrip = vi.fn().mockResolvedValue({ ok: true, token: 'tok' });
      render(<RequestForm geocoder={failing} repo={repoWith(requestTrip)} onSuccess={vi.fn()} />);
      const u = userEvent.setup();
      await fill(u);
      await u.click(screen.getByRole('button', { name: 'Pedir taxi' }));
      expect(requestTrip).toHaveBeenCalledWith(
        expect.objectContaining({ pickup: 'Calle 1', pickupLat: null, pickupLng: null }),
      );
    });
  });
});
