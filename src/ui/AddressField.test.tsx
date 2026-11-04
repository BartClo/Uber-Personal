import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geocoder } from '@/data/geocoder';
import type { AddressSuggestion } from '@/domain/addressSuggestion';
import { AddressField, type Coords } from './AddressField';

const APOQ: AddressSuggestion = { label: 'Avenida Apoquindo 3000, Las Condes', lat: -33.41, lng: -70.57 };
const COSTA: AddressSuggestion = { label: 'Costanera Center, Providencia', lat: -33.417, lng: -70.606 };

interface Pending {
  q: string;
  signal: AbortSignal;
  resolve: (r: AddressSuggestion[]) => void;
  reject: (e: Error) => void;
}

function fakeGeocoder() {
  const calls: Pending[] = [];
  const geocoder: Geocoder = {
    search: (q, signal) =>
      new Promise((resolve, reject) => {
        calls.push({ q, signal, resolve, reject });
      }),
  };
  return { geocoder, calls };
}

function Harness({
  geocoder,
  onChange,
  error,
}: {
  geocoder: Geocoder;
  onChange?: (t: string, c: Coords | null) => void;
  error?: string;
}) {
  const [value, setValue] = useState('');
  return (
    <AddressField
      id="addr"
      label="Dirección"
      value={value}
      geocoder={geocoder}
      error={error}
      onChange={(t, c) => {
        setValue(t);
        onChange?.(t, c);
      }}
    />
  );
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  const g = fakeGeocoder();
  const onChange = vi.fn();
  const u = userEvent.setup({ delay: null });
  render(<Harness geocoder={g.geocoder} onChange={onChange} />);
  return { ...g, onChange, u, input: screen.getByRole('combobox', { name: 'Dirección' }) };
}

async function openList(s: ReturnType<typeof setup>, results = [APOQ, COSTA]) {
  await s.u.type(s.input, 'Apoq');
  await wait(300);
  s.calls[s.calls.length - 1]!.resolve(results);
  await flush();
}

describe('AddressField', () => {
  it('no consulta con menos de 3 caracteres y espera 300 ms', async () => {
    const s = setup();
    await s.u.type(s.input, 'Ap');
    await wait(1000);
    expect(s.calls).toHaveLength(0);
    await s.u.type(s.input, 'o');
    await wait(200);
    expect(s.calls).toHaveLength(0);
    await wait(150);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.q).toBe('Apo');
  });

  it('agrupa las teclas en una sola consulta (debounce)', async () => {
    const s = setup();
    await s.u.type(s.input, 'Apoquindo');
    await wait(300);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.q).toBe('Apoquindo');
  });

  it('muestra un combobox con listbox y opciones', async () => {
    const s = setup();
    expect(s.input).toHaveAttribute('aria-expanded', 'false');
    await openList(s);
    expect(s.input).toHaveAttribute('aria-expanded', 'true');
    expect(s.input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([APOQ.label, COSTA.label]);
  });

  it('flechas y Enter: elige con coordenadas', async () => {
    const s = setup();
    await openList(s);
    await s.u.keyboard('{ArrowDown}{ArrowDown}');
    const opts = screen.getAllByRole('option');
    expect(opts[1]).toHaveAttribute('aria-selected', 'true');
    expect(s.input).toHaveAttribute('aria-activedescendant', opts[1]!.id);
    await s.u.keyboard('{ArrowUp}');
    expect(s.input).toHaveAttribute('aria-activedescendant', opts[0]!.id);
    await s.u.keyboard('{Enter}');
    expect(s.onChange).toHaveBeenLastCalledWith(APOQ.label, { lat: APOQ.lat, lng: APOQ.lng });
    expect(s.input).toHaveValue(APOQ.label);
    expect(s.input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/Ubicación encontrada/)).toBeInTheDocument();
  });

  it('Enter sin opción activa no bloquea el envío del formulario', async () => {
    const s = setup();
    await openList(s);
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => {
      s.input.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(false);
  });

  it('clic con el mouse elige la sugerencia', async () => {
    const s = setup();
    await openList(s);
    await s.u.click(screen.getByRole('option', { name: COSTA.label }));
    expect(s.onChange).toHaveBeenLastCalledWith(COSTA.label, { lat: COSTA.lat, lng: COSTA.lng });
  });

  it('Escape cierra la lista y conserva el texto', async () => {
    const s = setup();
    await openList(s);
    await s.u.keyboard('{Escape}');
    expect(s.input).toHaveAttribute('aria-expanded', 'false');
    expect(s.input).toHaveValue('Apoq');
  });

  it('CRITICO: cualquier edición posterior borra las coordenadas', async () => {
    const s = setup();
    await openList(s);
    await s.u.click(screen.getByRole('option', { name: APOQ.label }));
    expect(screen.getByText(/Ubicación encontrada/)).toBeInTheDocument();
    await s.u.type(s.input, 'x');
    expect(s.onChange).toHaveBeenLastCalledWith(`${APOQ.label}x`, null);
    expect(screen.getByText('Sin ubicación exacta')).toBeInTheDocument();
    // Volver a escribir el mismo texto tampoco recupera el pin.
    await s.u.type(s.input, '{Backspace}');
    expect(s.onChange).toHaveBeenLastCalledWith(APOQ.label, null);
    expect(screen.getByText('Sin ubicación exacta')).toBeInTheDocument();
  });

  it('borrar un carácter con la lista abierta también emite null', async () => {
    const s = setup();
    await openList(s);
    await s.u.type(s.input, '{Backspace}');
    expect(s.onChange).toHaveBeenLastCalledWith('Apo', null);
  });

  it('aborta la consulta en vuelo al seguir escribiendo e ignora la respuesta tardía', async () => {
    const s = setup();
    await s.u.type(s.input, 'Apoq');
    await wait(300);
    const first = s.calls[0]!;
    await s.u.type(s.input, 'u');
    expect(first.signal.aborted).toBe(true);
    first.resolve([COSTA]);
    await flush();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await wait(300);
    s.calls[1]!.resolve([APOQ]);
    await flush();
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([APOQ.label]);
  });

  it('si el texto baja de 3 caracteres cierra la lista', async () => {
    const s = setup();
    await openList(s);
    await s.u.type(s.input, '{Backspace}{Backspace}');
    expect(s.input).toHaveAttribute('aria-expanded', 'false');
  });

  it('un fallo del geocodificador no bloquea: texto libre, sin lista, sin pin', async () => {
    const s = setup();
    await s.u.type(s.input, 'Calle inventada 5');
    await wait(300);
    s.calls[0]!.reject(new Error('503'));
    await flush();
    expect(s.input).toHaveAttribute('aria-expanded', 'false');
    expect(s.input).toHaveValue('Calle inventada 5');
    expect(s.onChange).toHaveBeenLastCalledWith('Calle inventada 5', null);
    expect(screen.getByText('Sin ubicación exacta')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin resultados deja la lista cerrada', async () => {
    const s = setup();
    await openList(s, []);
    expect(s.input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('el error se enlaza con aria-describedby y aria-invalid', () => {
    const g = fakeGeocoder();
    render(<Harness geocoder={g.geocoder} error="Falta la dirección" />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Falta la dirección');
  });

  it('showHint=false no muestra pista', () => {
    const g = fakeGeocoder();
    render(
      <AddressField id="d" label="Destino" value="algo" onChange={vi.fn()} geocoder={g.geocoder} showHint={false} />,
    );
    expect(screen.queryByText('Sin ubicación exacta')).not.toBeInTheDocument();
  });
});
