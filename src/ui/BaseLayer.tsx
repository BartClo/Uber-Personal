'use client';

import L from 'leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useState } from 'react';
import { TileLayer, useMap } from 'react-leaflet';

// Copiado a public/ por scripts/copy-maplibre-worker.mjs.
setWorkerUrl('/maplibre-gl-worker.mjs');

/** Base vectorial limpia, gratuita y sin API key. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

function hasWebGL(): boolean {
  return document.createElement('canvas').getContext('webgl2') !== null;
}

function isAlive(map: L.Map): boolean {
  return map.getPane('mapPane') !== undefined;
}

export function VectorLayer() {
  const map = useMap();
  useEffect(() => {
    // Al remontar, React puede entregar un mapa ya destruido (sin paneles); tocarlo lanza
    // "reading '_leaflet_pos'". El MapContainer vivo vuelve a montar esta capa con su mapa.
    if (!isAlive(map)) return;
    // El plugin añade la atribución del estilo (OpenFreeMap, OpenMapTiles, OpenStreetMap).
    const layer = L.maplibreGL({ style: STYLE_URL });
    layer.addTo(map);
    return () => {
      if (isAlive(map)) map.removeLayer(layer);
    };
  }, [map]);
  return null;
}

/** Usa la base vectorial y, sin WebGL, cae a los tiles estándar de OpenStreetMap. */
export function BaseLayer() {
  const [webgl] = useState(hasWebGL);
  if (webgl) return <VectorLayer />;
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  );
}
