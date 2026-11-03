'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { isStale } from '@/domain/freshness';
import type { Driver, Trip } from '@/domain/types';
import styles from './FleetMapInner.module.css';

export type MarkerClass = 'marker-free' | 'marker-busy' | 'marker-stale';

export function driverMarkerClass(driver: Driver, now: Date): MarkerClass {
  if (isStale(driver.lastSeenAt, now) || driver.status === 'offline') return 'marker-stale';
  return driver.status === 'busy' ? 'marker-busy' : 'marker-free';
}

const SANTIAGO: [number, number] = [-33.4489, -70.6693];

interface Props {
  drivers: Driver[];
  trips: Trip[];
  now: Date;
  selectedDriverId?: string | null;
  onSelectDriver?: (id: string) => void;
}

export function FleetMapInner({ drivers, trips, now, selectedDriverId, onSelectDriver }: Props) {
  return (
    <div className={styles.wrapper}>
      <MapContainer center={SANTIAGO} zoom={12} className={styles.map}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {drivers.map((d) =>
          d.lat === null || d.lng === null ? null : (
            <Marker
              key={d.id}
              position={[d.lat, d.lng]}
              zIndexOffset={d.id === selectedDriverId ? 1000 : 0}
              icon={L.divIcon({
                className: `${driverMarkerClass(d, now)}${d.id === selectedDriverId ? ' marker-selected' : ''}`,
                html: d.taxiNumber,
                iconSize: [36, 36],
              })}
              eventHandlers={{ click: () => onSelectDriver?.(d.id) }}
            />
          ),
        )}
        {trips.map((t) =>
          t.status !== 'pending' || t.pickupLat === null || t.pickupLng === null ? null : (
            <Marker
              key={t.id}
              position={[t.pickupLat, t.pickupLng]}
              icon={L.divIcon({ className: 'marker-trip', html: '!', iconSize: [30, 30] })}
            />
          ),
        )}
      </MapContainer>
      <ul className={styles.legend} aria-label="Leyenda del mapa">
        <li><span className="legend-dot marker-free" aria-hidden="true" />Libre</li>
        <li><span className="legend-dot marker-busy" aria-hidden="true" />En viaje</li>
        <li><span className="legend-dot marker-stale" aria-hidden="true" />Sin señal</li>
        <li><span className="legend-dot marker-trip" aria-hidden="true" />Pedido en espera</li>
      </ul>
    </div>
  );
}
