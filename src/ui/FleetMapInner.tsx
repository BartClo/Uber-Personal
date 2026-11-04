'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { driverStatusLabel } from '@/domain/labels';
import { isStale } from '@/domain/freshness';
import type { Driver, Trip } from '@/domain/types';
import styles from './FleetMapInner.module.css';

export type MarkerClass = 'marker-free' | 'marker-busy' | 'marker-stale';

export function driverMarkerClass(driver: Driver, now: Date): MarkerClass {
  if (isStale(driver.lastSeenAt, now) || driver.status === 'offline') return 'marker-stale';
  return driver.status === 'busy' ? 'marker-busy' : 'marker-free';
}

const iconCache = new Map<string, L.DivIcon>();
function cachedIcon(className: string, html: string, size: number): L.DivIcon {
  const key = `${className}|${html}|${size}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({ className, html, iconSize: [size, size] });
    iconCache.set(key, icon);
  }
  return icon;
}

function markerLabel(d: Driver, now: Date): string {
  return isStale(d.lastSeenAt, now) ? 'Sin señal' : driverStatusLabel(d.status);
}

const SANTIAGO: [number, number] = [-33.4489, -70.6693];

/** Encuadra la flota una sola vez, al llegar los primeros datos; después manda el operador. */
function FitOnce({ points }: { points: [number, number][] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    map.fitBounds(points, { padding: [56, 56], maxZoom: 15 });
  }, [map, points]);
  return null;
}

/** Lleva el mapa al taxista elegido; no lo persigue en cada actualización de posición. */
function PanToSelected({
  id,
  position,
}: {
  id: string | null | undefined;
  position: [number, number] | null;
}) {
  const map = useMap();
  const latest = useRef(position);
  useEffect(() => {
    latest.current = position;
  });
  useEffect(() => {
    if (id && latest.current) map.panTo(latest.current);
  }, [map, id]);
  return null;
}

interface Props {
  drivers: Driver[];
  trips: Trip[];
  now: Date;
  selectedDriverId?: string | null;
  onSelectDriver?: (id: string) => void;
}

export function FleetMapInner({ drivers, trips, now, selectedDriverId, onSelectDriver }: Props) {
  const points: [number, number][] = [
    ...drivers.flatMap((d): [number, number][] =>
      d.lat === null || d.lng === null ? [] : [[d.lat, d.lng]],
    ),
    ...trips.flatMap((t): [number, number][] =>
      t.status !== 'pending' || t.pickupLat === null || t.pickupLng === null
        ? []
        : [[t.pickupLat, t.pickupLng]],
    ),
  ];
  const selected = drivers.find((d) => d.id === selectedDriverId);
  const selectedPos: [number, number] | null =
    selected && selected.lat !== null && selected.lng !== null
      ? [selected.lat, selected.lng]
      : null;

  return (
    <div className={styles.wrapper}>
      <MapContainer center={SANTIAGO} zoom={12} className={styles.map}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitOnce points={points} />
        <PanToSelected id={selectedDriverId} position={selectedPos} />
        {drivers.map((d) =>
          d.lat === null || d.lng === null ? null : (
            <Marker
              key={d.id}
              position={[d.lat, d.lng]}
              zIndexOffset={d.id === selectedDriverId ? 1000 : 0}
              title={`Taxi ${d.taxiNumber} · ${markerLabel(d, now)}`}
              icon={cachedIcon(
                `${driverMarkerClass(d, now)}${d.id === selectedDriverId ? ' marker-selected' : ''}`,
                d.taxiNumber,
                36,
              )}
              eventHandlers={{ click: () => onSelectDriver?.(d.id) }}
            />
          ),
        )}
        {trips.map((t) =>
          t.status !== 'pending' || t.pickupLat === null || t.pickupLng === null ? null : (
            <Marker
              key={t.id}
              position={[t.pickupLat, t.pickupLng]}
              title={`Pedido en espera: ${t.customerName}`}
              icon={cachedIcon('marker-trip', '!', 30)}
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
