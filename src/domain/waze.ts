import type { Trip } from './types';

type WazeTrip = Pick<
  Trip,
  'pickupAddress' | 'pickupLat' | 'pickupLng' | 'dropoffAddress' | 'status'
>;

/**
 * Enlace de Waze hacia la siguiente parada del viaje: el destino si el cliente ya va a bordo;
 * si no, el origen. Waze calcula la ruta desde donde esté quien abre el enlace.
 */
export function wazeUrl(trip: WazeTrip): string {
  const params = new URLSearchParams();
  if (trip.status === 'on_board') {
    params.set('q', trip.dropoffAddress);
  } else if (trip.pickupLat !== null && trip.pickupLng !== null) {
    params.set('ll', `${trip.pickupLat},${trip.pickupLng}`);
  } else {
    params.set('q', trip.pickupAddress);
  }
  params.set('navigate', 'yes');
  return `https://www.waze.com/ul?${params.toString()}`;
}
