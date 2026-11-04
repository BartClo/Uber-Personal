import { describe, expect, it } from 'vitest';
import { wazeUrl } from './waze';

const trip = {
  pickupAddress: 'Lota 2310, Providencia',
  pickupLat: -33.42,
  pickupLng: -70.6,
  dropoffAddress: 'Plaza Ñuñoa',
  status: 'pending',
} as const;

describe('wazeUrl', () => {
  it('antes de recoger navega al origen por coordenadas', () => {
    expect(wazeUrl(trip)).toBe('https://www.waze.com/ul?ll=-33.42%2C-70.6&navigate=yes');
  });
  it('sin coordenadas busca la dirección de origen', () => {
    expect(wazeUrl({ ...trip, pickupLat: null, pickupLng: null })).toBe(
      'https://www.waze.com/ul?q=Lota+2310%2C+Providencia&navigate=yes',
    );
  });
  it('con el cliente a bordo navega al destino', () => {
    expect(wazeUrl({ ...trip, status: 'on_board' })).toBe(
      'https://www.waze.com/ul?q=Plaza+%C3%91u%C3%B1oa&navigate=yes',
    );
  });
});
