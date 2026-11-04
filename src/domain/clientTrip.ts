import type { TripStatus } from './types';

export const CLIENT_LIMITS = { name: 80, phone: 20, address: 200 } as const;

export interface ClientRequestInput {
  pickup: string;
  dropoff: string;
  name: string;
  phone: string;
}
export type ClientRequestErrors = Partial<Record<keyof ClientRequestInput, string>>;
export type ClientValidation =
  | { ok: true; value: ClientRequestInput }
  | { ok: false; errors: ClientRequestErrors };

const PHONE_RE = /^[0-9+()./ -]+$/;

export function validateClientRequest(input: ClientRequestInput): ClientValidation {
  const value: ClientRequestInput = {
    pickup: input.pickup.trim(),
    dropoff: input.dropoff.trim(),
    name: input.name.trim(),
    phone: input.phone.trim(),
  };
  const errors: ClientRequestErrors = {};
  if (!value.pickup) errors.pickup = 'Falta la dirección de recogida';
  else if (value.pickup.length > CLIENT_LIMITS.address)
    errors.pickup = `La dirección de recogida admite hasta ${CLIENT_LIMITS.address} caracteres`;
  if (!value.dropoff) errors.dropoff = 'Falta el destino';
  else if (value.dropoff.length > CLIENT_LIMITS.address)
    errors.dropoff = `El destino admite hasta ${CLIENT_LIMITS.address} caracteres`;
  if (!value.name) errors.name = 'Falta tu nombre';
  else if (value.name.length > CLIENT_LIMITS.name)
    errors.name = `El nombre admite hasta ${CLIENT_LIMITS.name} caracteres`;
  if (!value.phone) errors.phone = 'Falta tu teléfono';
  else if (
    value.phone.length > CLIENT_LIMITS.phone ||
    !PHONE_RE.test(value.phone) ||
    !/[0-9]/.test(value.phone)
  )
    errors.phone = 'El teléfono no es válido';
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

const MESSAGES: Record<TripStatus, string> = {
  pending: 'Buscando tu taxi…',
  assigned: 'Tu taxi fue asignado',
  en_route: 'Tu taxi va en camino',
  on_board: 'Estás en viaje',
  completed: 'Viaje finalizado',
  cancelled: 'Viaje cancelado',
};
export const clientStatusMessage = (s: TripStatus): string => MESSAGES[s];
