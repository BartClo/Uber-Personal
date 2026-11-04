import { describe, expect, it } from 'vitest';
import { clientStatusMessage, validateClientRequest } from './clientTrip';

const ok = { pickup: 'Calle 1', dropoff: 'Calle 2', name: 'Ana', phone: '555 0100' };

describe('validateClientRequest', () => {
  it('accepts valid input and trims', () => {
    const r = validateClientRequest({ ...ok, name: '  Ana ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe('Ana');
  });
  it('reports each missing field in Spanish', () => {
    const r = validateClientRequest({ pickup: ' ', dropoff: '', name: '', phone: '  ' });
    expect(r).toEqual({
      ok: false,
      errors: {
        pickup: 'Falta la dirección de recogida',
        dropoff: 'Falta el destino',
        name: 'Falta tu nombre',
        phone: 'Falta tu teléfono',
      },
    });
  });
  it('rejects too long and bad phone', () => {
    const r = validateClientRequest({ ...ok, name: 'x'.repeat(81), phone: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toBeDefined();
      expect(r.errors.phone).toBeDefined();
    }
  });
});

describe('clientStatusMessage', () => {
  it('maps every status', () => {
    expect(clientStatusMessage('pending')).toBe('Buscando tu taxi…');
    expect(clientStatusMessage('assigned')).toBe('Tu taxi fue asignado');
    expect(clientStatusMessage('en_route')).toBe('Tu taxi va en camino');
    expect(clientStatusMessage('on_board')).toBe('Estás en viaje');
    expect(clientStatusMessage('completed')).toBe('Viaje finalizado');
    expect(clientStatusMessage('cancelled')).toBe('Viaje cancelado');
  });
});
