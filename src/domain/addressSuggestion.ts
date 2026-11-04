export interface AddressSuggestion {
  label: string;
  lat: number;
  lng: number;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const same = (a: string, b: string): boolean =>
  a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;

/**
 * Etiqueta legible para una propiedad de Photon: "Calle 123, Comuna" o "Lugar, Comuna".
 * Devuelve null si no hay nombre ni calle (no hay nada que mostrar).
 */
export function formatSuggestion(properties: Record<string, unknown>): string | null {
  const name = text(properties.name);
  const street = text(properties.street);
  const number = text(properties.housenumber);
  const streetLine = street ? (number ? `${street} ${number}` : street) : '';
  // Un nombre que solo repite la calle no aporta: la calle con número es más precisa.
  const primary = name && !(street && same(name, street) && number) ? name : streetLine;
  if (!primary) return null;
  const area = text(properties.district) || text(properties.locality) || text(properties.city);
  return area && !same(area, primary) ? `${primary}, ${area}` : primary;
}

/** Feature GeoJSON de Photon ([lng, lat]) a sugerencia; null si no es utilizable. */
export function suggestionFromFeature(feature: unknown): AddressSuggestion | null {
  if (typeof feature !== 'object' || feature === null) return null;
  const f = feature as { geometry?: { coordinates?: unknown }; properties?: unknown };
  const c = f.geometry?.coordinates;
  if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
  const [lng, lat] = c as [number, number];
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (typeof f.properties !== 'object' || f.properties === null) return null;
  const label = formatSuggestion(f.properties as Record<string, unknown>);
  return label ? { label, lat, lng } : null;
}
