import { describe, expect, it } from 'vitest';
import { driverStatusLabel, tripSourceLabel, tripStatusLabel } from './labels';

describe('labels', () => {
  it('driver', () => {
    expect(driverStatusLabel('free')).toBe('Libre');
    expect(driverStatusLabel('busy')).toBe('En viaje');
    expect(driverStatusLabel('offline')).toBe('Desconectado');
  });
  it('trip', () => {
    expect(tripStatusLabel('pending')).toBe('En espera');
    expect(tripStatusLabel('assigned')).toBe('Asignado');
    expect(tripStatusLabel('en_route')).toBe('En camino al cliente');
    expect(tripStatusLabel('on_board')).toBe('Cliente a bordo');
    expect(tripStatusLabel('completed')).toBe('Finalizado');
    expect(tripStatusLabel('cancelled')).toBe('Cancelado');
  });
  it('source', () => {
    expect(tripSourceLabel('admin')).toBe('Cargado por admin');
    expect(tripSourceLabel('client_app')).toBe('App del cliente');
  });
});
