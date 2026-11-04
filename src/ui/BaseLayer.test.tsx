import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  layer: { addTo: vi.fn() },
  map: { getPane: vi.fn(), removeLayer: vi.fn() },
}));

vi.mock('leaflet', () => ({ default: { maplibreGL: () => h.layer } }));
vi.mock('maplibre-gl', () => ({ setWorkerUrl: () => {} }));
vi.mock('@maplibre/maplibre-gl-leaflet', () => ({}));
vi.mock('react-leaflet', () => ({ useMap: () => h.map, TileLayer: () => null }));

import { VectorLayer } from './BaseLayer';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('VectorLayer', () => {
  it('añade la capa a un mapa vivo y la quita al desmontar', () => {
    h.map.getPane.mockReturnValue({});
    const { unmount } = render(<VectorLayer />);
    expect(h.layer.addTo).toHaveBeenCalledWith(h.map);
    unmount();
    expect(h.map.removeLayer).toHaveBeenCalledWith(h.layer);
  });

  it('no toca un mapa ya destruido al montar', () => {
    h.map.getPane.mockReturnValue(undefined);
    render(<VectorLayer />);
    expect(h.layer.addTo).not.toHaveBeenCalled();
  });

  it('no quita la capa si el mapa se destruyó antes de desmontar', () => {
    h.map.getPane.mockReturnValue({});
    const { unmount } = render(<VectorLayer />);
    h.map.getPane.mockReturnValue(undefined);
    unmount();
    expect(h.map.removeLayer).not.toHaveBeenCalled();
  });
});
