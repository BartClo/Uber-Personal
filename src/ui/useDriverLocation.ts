'use client';

import { useEffect, useState } from 'react';

interface PositionLike {
  coords: { latitude: number; longitude: number };
}

/** Porción de la API de geolocalización que usamos; `navigator.geolocation` la cumple. */
export interface GeolocationLike {
  watchPosition(
    onPosition: (p: PositionLike) => void,
    onError: (e: { code: number }) => void,
    options?: PositionOptions,
  ): number;
  clearWatch(id: number): void;
  getCurrentPosition(
    onPosition: (p: PositionLike) => void,
    onError: (e: { code: number }) => void,
    options?: PositionOptions,
  ): void;
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
/** Sin eventos por este tiempo se pide una posición: varios navegadores callan si no hay movimiento. */
const QUERY_AFTER_MS = 10_000;
const GPS_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 };
/**
 * Tope para seguir reenviando la última posición sin eventos nuevos. Es largo a propósito: un GPS
 * callado suele significar un taxi detenido, y marcar "sin señal" a un taxi que espera viajes
 * daña más al despacho que una posición algo antigua. Las fallas reales se cortan antes (abajo).
 */
const MAX_FIX_AGE_MS = 5 * 60_000;
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;

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
    let querying = false;
    let lastFixAt = Date.now();

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

    function onPosition(p: PositionLike): void {
      denied = false;
      const now = Date.now();
      lastFixAt = now;
      latest = { lat: p.coords.latitude, lng: p.coords.longitude, at: now };
      setState((s) => (s === 'failing' ? s : 'active'));
      if (now - lastSentAt >= REPORT_EVERY_MS) send(latest.lat, latest.lng, now);
    }

    function onError(e: { code: number }): void {
      // Tiempo agotado no cuenta como falla: también ocurre con el taxi detenido.
      if (e.code === PERMISSION_DENIED) {
        denied = true;
        latest = null;
        setState('denied');
      } else if (e.code === POSITION_UNAVAILABLE) {
        latest = null;
        setState('searching');
      }
    }

    const gps = geolocation;
    const start = () => gps.watchPosition(onPosition, onError, GPS_OPTIONS);
    let watchId = start();

    const timer = setInterval(() => {
      // Oculta, la app no sabe dónde está el taxi: el panel debe verlo sin señal.
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (!denied && !querying && now - lastFixAt >= QUERY_AFTER_MS) {
        querying = true;
        gps.getCurrentPosition(
          (p) => {
            querying = false;
            if (active) onPosition(p);
          },
          (e) => {
            querying = false;
            lastFixAt = Date.now(); // reintenta dentro de QUERY_AFTER_MS, no en cada tick
            if (active) onError(e);
          },
          GPS_OPTIONS,
        );
      }
      if (!latest) return;
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
