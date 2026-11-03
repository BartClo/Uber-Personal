import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);
import type { Driver, Trip } from '@/domain/types';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: ({ attribution }: { attribution: string }) => <p>{attribution}</p>,
  Marker: ({ icon }: { icon: { options: { className: string; html: string } } }) => (
    <div data-testid="marker" className={icon.options.className}>{icon.options.html}</div>
  ),
}));

import { FleetMapInner, driverMarkerClass } from './FleetMapInner';

const now = new Date('2026-11-02T12:00:00Z');
const mk = (o: Partial<Driver>): Driver => ({
  id: 'd', name: 'N', taxiNumber: '1', phone: '1', status: 'free',
  lat: -33.4, lng: -70.6, lastSeenAt: '2026-11-02T11:59:50Z', ...o,
});
const trip = (o: Partial<Trip>): Trip => ({
  id: 't', source: 'admin', customerName: 'c', customerPhone: '1', pickupAddress: 'x',
  pickupLat: -33.4, pickupLng: -70.6, dropoffAddress: 'y', status: 'pending', driverId: null,
  createdAt: '2026-11-02T11:00:00Z', assignedAt: null, ...o,
});

describe('driverMarkerClass', () => {
  it('free/busy/stale/offline', () => {
    expect(driverMarkerClass(mk({}), now)).toBe('marker-free');
    expect(driverMarkerClass(mk({ status: 'busy' }), now)).toBe('marker-busy');
    expect(driverMarkerClass(mk({ lastSeenAt: null }), now)).toBe('marker-stale');
    expect(driverMarkerClass(mk({ status: 'offline' }), now)).toBe('marker-stale');
  });
});

describe('FleetMapInner', () => {
  it('2 marcadores de 3 taxistas, el stale con marker-stale', () => {
    const drivers = [
      mk({ id: 'a', taxiNumber: '11' }),
      mk({ id: 'b', taxiNumber: '22', lastSeenAt: null }),
      mk({ id: 'c', taxiNumber: '33', lat: null, lng: null }),
    ];
    render(<FleetMapInner drivers={drivers} trips={[]} now={now} />);
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(2);
    expect(screen.getByText('22')).toHaveClass('marker-stale');
    expect(screen.getByText('11')).toHaveClass('marker-free');
  });
  it('pedido pendiente con coords usa marker-trip; leyenda y atribución', () => {
    render(<FleetMapInner drivers={[]} trips={[trip({}), trip({ id: 'u', pickupLat: null })]} now={now} />);
    expect(screen.getAllByTestId('marker')).toHaveLength(1);
    expect(screen.getByTestId('marker')).toHaveClass('marker-trip');
    for (const t of ['Libre', 'En viaje', 'Sin señal', 'Pedido en espera']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getByText(/OpenStreetMap/)).toBeInTheDocument();
  });
});
