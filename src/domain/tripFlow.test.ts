import { describe, expect, it } from 'vitest';
import { driverActionLabel, nextTripStatus, TRIP_STEPS, tripStepIndex } from './tripFlow';

describe('tripFlow', () => {
  it('nextTripStatus avanza assigned → en_route → on_board → completed', () => {
    expect(nextTripStatus('assigned')).toBe('en_route');
    expect(nextTripStatus('en_route')).toBe('on_board');
    expect(nextTripStatus('on_board')).toBe('completed');
  });

  it.each(['pending', 'completed', 'cancelled'] as const)('%s no avanza', (status) => {
    expect(nextTripStatus(status)).toBeNull();
    expect(driverActionLabel(status)).toBeNull();
  });

  it('driverActionLabel nombra la siguiente acción', () => {
    expect(driverActionLabel('assigned')).toBe('Voy en camino');
    expect(driverActionLabel('en_route')).toBe('Cliente a bordo');
    expect(driverActionLabel('on_board')).toBe('Finalizar viaje');
  });

  it('tripStepIndex ubica el estado en los 4 pasos', () => {
    expect(TRIP_STEPS).toEqual(['Asignado', 'En camino', 'A bordo', 'Final']);
    expect(tripStepIndex('assigned')).toBe(0);
    expect(tripStepIndex('en_route')).toBe(1);
    expect(tripStepIndex('on_board')).toBe(2);
    expect(tripStepIndex('completed')).toBe(3);
  });

  it.each(['pending', 'cancelled'] as const)('%s queda fuera del stepper', (status) => {
    expect(tripStepIndex(status)).toBe(-1);
  });
});
