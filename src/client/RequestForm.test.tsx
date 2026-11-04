import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientRepo, RequestTripResult } from '@/data/clientRepo';
import { RequestForm } from './RequestForm';

afterEach(cleanup);

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
    render(<RequestForm repo={repoWith(requestTrip)} onSuccess={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pedir taxi' }));
    expect(requestTrip).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tu nombre')).toHaveAccessibleDescription('Falta tu nombre');
    expect(screen.getByLabelText('A dónde vas')).toHaveAccessibleDescription('Falta el destino');
    expect(screen.getByLabelText('Teléfono')).toHaveAccessibleDescription('Falta tu teléfono');
  });

  it('clears only the edited field error when the user types in it', async () => {
    render(<RequestForm repo={repoWith(vi.fn())} onSuccess={vi.fn()} />);
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
    render(<RequestForm repo={repoWith(requestTrip)} onSuccess={onSuccess} />);
    const u = userEvent.setup();
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Pedir taxi' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('tok'));
    expect(requestTrip).toHaveBeenCalledWith({
      pickup: 'Calle 1',
      dropoff: 'Calle 2',
      name: 'Ana',
      phone: '555 0100',
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
    render(<RequestForm repo={repoWith(requestTrip)} onSuccess={vi.fn()} />);
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
    render(<RequestForm repo={repoWith(requestTrip)} onSuccess={vi.fn()} />);
    const u = userEvent.setup();
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Pedir taxi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes varios pedidos activos');
  });

  it('shows a network error and re-enables the button', async () => {
    const requestTrip = vi.fn().mockRejectedValue(new Error('x'));
    render(<RequestForm repo={repoWith(requestTrip)} onSuccess={vi.fn()} />);
    const u = userEvent.setup();
    await fill(u);
    await u.click(screen.getByRole('button', { name: 'Pedir taxi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos enviar tu pedido');
    expect(screen.getByRole('button', { name: 'Pedir taxi' })).toBeEnabled();
  });
});
