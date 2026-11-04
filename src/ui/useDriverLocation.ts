'use client';

import { useEffect, useState } from 'react';

/** Porción de la API de geolocalización que usamos; `navigator.geolocation` la cumple. */
export interface GeolocationLike {
  watchPosition(
    onPosition: (p: { coords: { latitude: number; longitude: number } }) => void,
    onError: (e: { code: number }) => void,
    options?: PositionOptions,
  ): number;
  clearWatch(id: number): void;
}

export interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<unknown>;
}

/** Porción de Wake Lock que usamos; `navigator.wakeLock` la cumple. */
export interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

export type LocationState =
  | 'active'
  | 'searching'
  | 'denied'
  | 'unsupported'
  | 'paused'
  | 'failing';

export const LOCATION_LABELS: Record<LocationState, string> = {
  active: 'Ubicación activa',
  searching: 'Buscando ubicación…',
  denied: 'Ubicación desactivada: activa el permiso del navegador',
  unsupported: 'Este dispositivo no tiene GPS',
  paused: 'Ubicación en pausa: estás desconectado',
  failing: 'No se pudo enviar la ubicación: reintentando…',
};

const REPORT_EVERY_MS = 5_000;
const TICK_MS = 1_000;
/** Más allá de esto la última posición ya no representa dónde está el taxi. */
const MAX_FIX_AGE_MS = 30_000;
const PERMISSION_DENIED = 1;

/**
 * Observa el GPS y reporta como máximo una vez cada 5 s. El temporizador también reenvía la
 * última posición: un taxi detenido casi no genera posiciones nuevas y el panel lo vería sin
 * señal. `report` debe ser estable entre renders.
 */
export function useDriverLocation({
  geolocation,
  report,
  enabled,
}: {
  geolocation: GeolocationLike | null;
  report: (lat: number, lng: number) => Promise<{ ok: boolean }>;
  enabled: boolean;
}): LocationState {
  const [state, setState] = useState<LocationState>('searching');

  useEffect(() => {
    if (!geolocation || !enabled) return;
    let active = true;
    let latest: { lat: number; lng: number; at: number } | null = null;
    let lastSentAt = -Infinity;
    let denied = false;

    function send(lat: number, lng: number, now: number): void {
      lastSentAt = now;
      const failed = (e: unknown) => {
        console.error('[useDriverLocation] report', e);
        if (active && !denied) setState('failing');
      };
      try {
        report(lat, lng).then((res) => {
          if (!res.ok) failed(res);
          else if (active && !denied) setState('active');
        }, failed);
      } catch (e) {
        failed(e);
      }
    }

    function start(): number {
      return (geolocation as GeolocationLike).watchPosition(
        (p) => {
          denied = false;
          const now = Date.now();
          latest = { lat: p.coords.latitude, lng: p.coords.longitude, at: now };
          setState((s) => (s === 'failing' ? s : 'active'));
          if (now - lastSentAt >= REPORT_EVERY_MS) send(latest.lat, latest.lng, now);
        },
        (e) => {
          // Los demás errores (sin señal, tiempo agotado) son transitorios: los cubre MAX_FIX_AGE_MS.
          if (e.code !== PERMISSION_DENIED) return;
          denied = true;
          latest = null;
          setState('denied');
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
      );
    }

    let watchId = start();

    const timer = setInterval(() => {
      if (!latest) return;
      const now = Date.now();
      if (now - latest.at > MAX_FIX_AGE_MS) {
        latest = null;
        setState('searching');
      } else if (now - lastSentAt >= REPORT_EVERY_MS) {
        send(latest.lat, latest.lng, now);
      }
    }, TICK_MS);

    // Un permiso concedido en los ajustes no revive una observación ya rechazada.
    const onVisibility = () => {
      if (!denied || document.visibilityState !== 'visible') return;
      geolocation.clearWatch(watchId);
      watchId = start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      geolocation.clearWatch(watchId);
      setState('searching');
    };
  }, [geolocation, report, enabled]);

  if (!geolocation) return 'unsupported';
  if (!enabled) return 'paused';
  return state;
}

/** Mantiene la pantalla encendida si el navegador lo permite; si no, no hace nada. */
export function useWakeLock(wakeLock: WakeLockLike | null, enabled: boolean): void {
  useEffect(() => {
    if (!wakeLock || !enabled) return;
    let active = true;
    let requesting = false;
    let sentinel: WakeLockSentinelLike | null = null;

    function release(s: WakeLockSentinelLike): void {
      s.release().catch(() => undefined);
    }

    function acquire(): void {
      if (requesting || document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      requesting = true;
      (wakeLock as WakeLockLike).request('screen').then(
        (s) => {
          requesting = false;
          if (active) sentinel = s;
          else release(s);
        },
        () => {
          // Rechazado (batería baja, pestaña oculta): la app sigue sin bloqueo.
          requesting = false;
        },
      );
    }

    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', acquire);
      if (sentinel && !sentinel.released) release(sentinel);
    };
  }, [wakeLock, enabled]);
}
