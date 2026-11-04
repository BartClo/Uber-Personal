import { suggestionFromFeature, type AddressSuggestion } from '@/domain/addressSuggestion';

export interface Geocoder {
  search(query: string, signal: AbortSignal): Promise<AddressSuggestion[]>;
}

const PHOTON_URL = 'https://photon.komoot.io/api/';

/** Photon (OSM) no exige clave y permite autocompletar; Nominatim lo prohíbe. */
export function createPhotonGeocoder(fetchFn: typeof fetch = (...a) => fetch(...a)): Geocoder {
  return {
    async search(query, signal) {
      const params = new URLSearchParams({
        q: query,
        limit: '5',
        lat: '-33.45',
        lon: '-70.65',
        bbox: '-71.6,-34.2,-70.0,-32.8',
      });
      const res = await fetchFn(`${PHOTON_URL}?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`Photon respondió ${res.status}`);
      const body: unknown = await res.json();
      const features = (body as { features?: unknown } | null)?.features;
      if (!Array.isArray(features)) throw new Error('Respuesta de Photon malformada');
      return features.flatMap((f) => {
        const s = suggestionFromFeature(f);
        return s ? [s] : [];
      });
    },
  };
}
