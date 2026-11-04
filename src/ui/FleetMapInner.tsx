'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { MapContainer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import { formatDistanceKm } from '@/domain/distance';
import { nearestCandidates } from '@/domain/rankDrivers';
import { driverStatusLabel } from '@/domain/labels';
import { isStale } from '@/domain/freshness';
import type { Driver, Trip } from '@/domain/types';
import { BaseLayer } from './BaseLayer';
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

/** Encuadra el pedido y sus candidatos al abrir la asignación de ese pedido. */
function FitFocus({ id, points }: { id: string | null; points: [number, number][] }) {
  const map = useMap();
  const latest = useRef(points);
  useEffect(() => {
    latest.current = points;
  });
  useEffect(() => {
    if (!id || latest.current.length === 0) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    map.fitBounds(latest.current, { padding: [72, 72], maxZoom: 15, animate: !reduced });
  }, [map, id]);
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
  /** Pedido que se está asignando: el mapa muestra sus candidatos más cercanos. */
  focusTrip?: Trip | null;
}

export function FleetMapInner({
  drivers,
  trips,
  now,
  selectedDriverId,
  onSelectDriver,
  focusTrip,
}: Props) {
  const pickup: [number, number] | null =
    focusTrip && focusTrip.pickupLat !== null && focusTrip.pickupLng !== null
      ? [focusTrip.pickupLat, focusTrip.pickupLng]
      : null;
  const candidates = pickup && focusTrip ? nearestCandidates(drivers, focusTrip, now) : [];
  const distanceById = new Map(candidates.map((c) => [c.driver.id, c.distanceKm]));
  const focusPoints: [number, number][] = pickup
    ? [
        pickup,
        ...candidates.flatMap(({ driver: d }): [number, number][] =>
          d.lat === null || d.lng === null ? [] : [[d.lat, d.lng]],
        ),
      ]
    : [];
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
        <BaseLayer />
        <FitOnce points={points} />
        <FitFocus id={pickup ? (focusTrip?.id ?? null) : null} points={focusPoints} />
        {pickup &&
          candidates.map(({ driver: d }, i) =>
            d.lat === null || d.lng === null ? null : (
              <Polyline
                key={d.id}
                positions={[pickup, [d.lat, d.lng]]}
                pathOptions={
                  i === 0
                    ? { color: '#15803d', weight: 4 }
                    : { color: '#475569', weight: 2, dashArray: '6 6' }
                }
              />
            ),
          )}
        <PanToSelected id={selectedDriverId} position={selectedPos} />
        {drivers.map((d) =>
          d.lat === null || d.lng === null ? null : (
            <Marker
              key={d.id}
              position={[d.lat, d.lng]}
              zIndexOffset={d.id === selectedDriverId ? 1000 : 0}
              title={`Taxi ${d.taxiNumber} · ${markerLabel(d, now)}`}
              icon={cachedIcon(
                `${driverMarkerClass(d, now)}${d.id === selectedDriverId ? ' marker-selected' : ''}${
                  pickup && !distanceById.has(d.id) ? ' marker-dim' : ''
                }`,
                d.taxiNumber,
                36,
              )}
              eventHandlers={{ click: () => onSelectDriver?.(d.id) }}
            >
              {distanceById.has(d.id) && (
                <Tooltip permanent direction="top" offset={[0, -18]}>
                  {formatDistanceKm(distanceById.get(d.id) ?? null)}
                </Tooltip>
              )}
            </Marker>
          ),
        )}
        {trips.map((t) =>
          t.status !== 'pending' || t.pickupLat === null || t.pickupLng === null ? null : (
            <Marker
              key={t.id}
              position={[t.pickupLat, t.pickupLng]}
              title={`Pedido en espera: ${t.customerName}`}
              icon={cachedIcon(
                `marker-trip${pickup ? (t.id === focusTrip?.id ? ' marker-focus' : ' marker-dim') : ''}`,
                '!',
                30,
              )}
              zIndexOffset={t.id === focusTrip?.id ? 2000 : 0}
            >
              {t.id === focusTrip?.id && (
                <Tooltip permanent direction="bottom" offset={[0, 18]}>
                  {t.customerName}
                </Tooltip>
              )}
            </Marker>
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
