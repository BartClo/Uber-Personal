import { describe, expect, it } from 'vitest';
import { formatSuggestion, suggestionFromFeature } from './addressSuggestion';

describe('formatSuggestion', () => {
  it('calle con número y comuna', () => {
    expect(
      formatSuggestion({ street: 'Avenida Apoquindo', housenumber: '3000', district: 'Las Condes', city: 'Santiago' }),
    ).toBe('Avenida Apoquindo 3000, Las Condes');
  });
  it('lugar con nombre y comuna', () => {
    expect(formatSuggestion({ name: 'Costanera Center', street: 'Avenida Andrés Bello', district: 'Providencia' })).toBe(
      'Costanera Center, Providencia',
    );
  });
  it('si el nombre repite la calle y hay número, usa calle + número', () => {
    expect(
      formatSuggestion({ name: 'Avenida Apoquindo', street: 'Avenida Apoquindo', housenumber: '3000', district: 'Las Condes' }),
    ).toBe('Avenida Apoquindo 3000, Las Condes');
  });
  it('solo nombre', () => {
    expect(formatSuggestion({ name: 'Aeropuerto' })).toBe('Aeropuerto');
  });
  it('sin duplicados entre zona y ciudad ni entre nombre y zona', () => {
    expect(formatSuggestion({ name: 'Santiago', city: 'Santiago' })).toBe('Santiago');
    expect(formatSuggestion({ name: 'Providencia', district: 'providencia' })).toBe('Providencia');
  });
  it('usa locality o city si falta district', () => {
    expect(formatSuggestion({ name: 'Plaza', locality: 'Ñuñoa' })).toBe('Plaza, Ñuñoa');
    expect(formatSuggestion({ name: 'Plaza', city: 'Santiago' })).toBe('Plaza, Santiago');
  });
  it('sin nombre ni calle no es utilizable', () => {
    expect(formatSuggestion({ district: 'Las Condes', city: 'Santiago' })).toBeNull();
    expect(formatSuggestion({ housenumber: '12' })).toBeNull();
  });
  it('ignora valores vacíos o no texto', () => {
    expect(formatSuggestion({ name: '  ', street: 'Calle 1', housenumber: 5 as unknown as string })).toBe('Calle 1');
  });
});

describe('suggestionFromFeature', () => {
  const ok = { geometry: { coordinates: [-70.57, -33.41] }, properties: { street: 'Apoquindo', housenumber: '3000' } };
  it('convierte [lng, lat] a lat/lng', () => {
    expect(suggestionFromFeature(ok)).toEqual({ label: 'Apoquindo 3000', lat: -33.41, lng: -70.57 });
  });
  it.each([
    ['sin geometría', { properties: { name: 'X' } }],
    ['coordenadas no numéricas', { geometry: { coordinates: ['a', 'b'] }, properties: { name: 'X' } }],
    ['fuera de rango', { geometry: { coordinates: [-70, 95] }, properties: { name: 'X' } }],
    ['sin propiedades utilizables', { geometry: { coordinates: [-70, -33] }, properties: {} }],
    ['no es objeto', 5],
  ])('descarta: %s', (_n, f) => {
    expect(suggestionFromFeature(f)).toBeNull();
  });
});
