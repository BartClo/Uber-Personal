import type { TripStatus } from './types';

/** Pasos que ve el taxista. No existe la acción de rechazar. */
export const TRIP_STEPS = ['Asignado', 'En camino', 'A bordo', 'Final'] as const;

const NEXT: Partial<Record<TripStatus, TripStatus>> = {
  assigned: 'en_route',
  en_route: 'on_board',
  on_board: 'completed',
};

const ACTION_LABELS: Partial<Record<TripStatus, string>> = {
  assigned: 'Voy en camino',
  en_route: 'Cliente a bordo',
  on_board: 'Finalizar viaje',
};

const STEP_INDEX: Partial<Record<TripStatus, number>> = {
  assigned: 0,
  en_route: 1,
  on_board: 2,
  completed: 3,
};

export const nextTripStatus = (s: TripStatus): TripStatus | null => NEXT[s] ?? null;
export const driverActionLabel = (s: TripStatus): string | null => ACTION_LABELS[s] ?? null;
/** Posición en TRIP_STEPS; -1 si el estado no pertenece al flujo del taxista. */
export const tripStepIndex = (s: TripStatus): number => STEP_INDEX[s] ?? -1;
