import type { DriverStatus, TripSource, TripStatus } from './types';

const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  free: 'Libre',
  busy: 'En viaje',
  offline: 'Desconectado',
};

const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  pending: 'En espera',
  assigned: 'Asignado',
  en_route: 'En camino al cliente',
  on_board: 'Cliente a bordo',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
};

const TRIP_SOURCE_LABELS: Record<TripSource, string> = {
  admin: 'Cargado por admin',
  client_app: 'App del cliente',
};

export const driverStatusLabel = (s: DriverStatus): string => DRIVER_STATUS_LABELS[s];
export const tripStatusLabel = (s: TripStatus): string => TRIP_STATUS_LABELS[s];
export const tripSourceLabel = (s: TripSource): string => TRIP_SOURCE_LABELS[s];
