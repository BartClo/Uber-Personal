import { describe, expect, it, vi } from 'vitest';
import { createPhotonGeocoder } from './geocoder';

const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body }) as Response;

describe('createPhotonGeocoder', () => {
  it('pide a Photon con sesgo a Santiago y convierte las features', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      json({
        features: [
          { geometry: { coordinates: [-70.57, -33.41] }, properties: { street: 'Avenida Apoquindo', housenumber: '3000', district: 'Las Condes' } },
          { geometry: { coordinates: [-70, -33] }, properties: {} },
        ],
      }),
    );
    const signal = new AbortController().signal;
    const r = await createPhotonGeocoder(fetchFn).search('Apoquindo 3000', signal);
    expect(r).toEqual([{ label: 'Avenida Apoquindo 3000, Las Condes', lat: -33.41, lng: -70.57 }]);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://photon.komoot.io/api/');
    expect(u.searchParams.get('q')).toBe('Apoquindo 3000');
    expect(u.searchParams.get('limit')).toBe('5');
    expect(u.searchParams.get('lat')).toBe('-33.45');
    expect(u.searchParams.get('lon')).toBe('-70.65');
    expect(u.searchParams.get('bbox')).toBe('-71.6,-34.2,-70.0,-32.8');
    expect(init.signal).toBe(signal);
  });
  it('respuesta no OK lanza', async () => {
    const g = createPhotonGeocoder(vi.fn().mockResolvedValue(json({}, false)));
    await expect(g.search('abc', new AbortController().signal)).rejects.toThrow();
  });
  it.each([[null], [{}], [{ features: 'x' }]])('respuesta malformada lanza: %j', async (body) => {
    const g = createPhotonGeocoder(vi.fn().mockResolvedValue(json(body)));
    await expect(g.search('abc', new AbortController().signal)).rejects.toThrow();
  });
  it('JSON inválido lanza', async () => {
    const bad = { ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } } as unknown as Response;
    await expect(createPhotonGeocoder(vi.fn().mockResolvedValue(bad)).search('abc', new AbortController().signal)).rejects.toThrow();
  });
});
