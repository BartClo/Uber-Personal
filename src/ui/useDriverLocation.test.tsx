import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useDriverLocation,
  useWakeLock,
  type GeolocationLike,
  type WakeLockLike,
} from './useDriverLocation';

type OnPosition = Parameters<GeolocationLike['watchPosition']>[0];
type OnError = Parameters<GeolocationLike['watchPosition']>[1];

function fakeGeo() {
  let onPosition: OnPosition = () => undefined;
  let onError: OnError = () => undefined;
  const geo = {
    watchPosition: vi.fn<GeolocationLike['watchPosition']>((ok, err) => {
      onPosition = ok;
      onError = err;
      return 1;
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn<GeolocationLike['getCurrentPosition']>(),
  };
  return {
    geo,
    fix: (lat: number, lng: number) =>
      act(() => onPosition({ coords: { latitude: lat, longitude: lng } })),
    fail: (code: number) => act(() => onError({ code })),
  };
}

const ok = () =>
  vi.fn<(lat: number, lng: number) => Promise<{ ok: boolean }>>(() =>
    Promise.resolve({ ok: true }),
  );

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  setVisibility('visible');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-03T10:00:00.000Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useDriverLocation', () => {
  it('sin geolocalización informa que no hay GPS', () => {
    const report = ok();
    const { result } = renderHook(() =>
      useDriverLocation({ geolocation: null, report, enabled: true }),
    );
    expect(result.current).toBe('unsupported');
  });

  it('busca hasta recibir posición; entonces activa y reporta de inmediato', async () => {
    const { geo, fix } = fakeGeo();
    const report = ok();
    const { result } = renderHook(() =>
      useDriverLocation({ geolocation: geo, report, enabled: true }),
    );
    expect(result.current).toBe('searching');
    fix(-33.4, -70.6);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current).toBe('active');
    expect(report).toHaveBeenCalledWith(-33.4, -70.6);
  });

  it('limita a un reporte cada 5 s y envía la última posición', async () => {
    const { geo, fix } = fakeGeo();
    const report = ok();
    renderHook(() => useDriverLocation({ geolocation: geo, report, enabled: true }));
    fix(1, 1);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    fix(2, 2);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    fix(3, 3);
    expect(report).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith(3, 3);
  });

  it('detenido, sigue reportando: el panel no debe verlo sin señal', async () => {
    const { geo, fix } = fakeGeo();
    const report = ok();
    renderHook(() => useDriverLocation({ geolocation: geo, report, enabled: true }));
    fix(1, 1);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(report).toHaveBeenCalledTimes(3);
  });

  it('estacionado sin eventos del GPS: pide una posición y sigue activo y reportando', async () => {
    const { geo, fix } = fakeGeo();
    geo.getCurrentPosition.mockImplementation((ok) =>
      ok({ coords: { latitude: 5, longitude: 5 } }),
    );
    const report = ok();
    const { result } = renderHook(() =>
      useDriverLocation({ geolocation: geo, report, enabled: true }),
    );
    fix(1, 1);
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(geo.getCurrentPosition).toHaveBeenCalled();
    expect(result.current).toBe('active');
    expect(report).toHaveBeenLastCalledWith(5, 5);
    expect(report.mock.calls.length).toBeGreaterThan(20);
  });

  it('tras perder la señal se recupera cuando una consulta vuelve a dar posición', async () => {
    const { geo, fix } = fakeGeo();
    const report = ok();
    const { result } = renderHook(() =>
      useDriverLocation({ geolocation: geo, report, enabled: true }),
    );
    fix(1, 1);
    geo.getCurrentPosition.mockImplementation((_ok, err) => err({ code: 2 }));
    await act(() => vi.advanceTimersByTimeAsync(40_000));
    expect(result.current).toBe('searching');
    expect(geo.getCurrentPosition.mock.calls.length).toBeGreaterThan(1);
    geo.getCurrentPosition.mockImplementation((ok) =>
      ok({ coords: { latitude: 7, longitude: 7 } }),
    );
    await act(() => vi.advanceTimersByTimeAsync(11_000));
    expect(result.current).toBe('active');
    expect(report).toHaveBeenLastCalledWith(7, 7);
  });

  it('una consulta denegada informa el permiso', async () => {
    const { geo, fix } = fakeGeo();
    geo.getCurrentPosition.mockImplementation((_ok, err) => err({ code: 1 }));
    const report = ok();
    const { result } = renderHook(() =>
      useDriverLocation({ geolocation: geo, report, enabled: true }),
    );
    fix(1, 1);
    await act(() => vi.advanceTimersByTimeAsync(11_000));
    expect(result.current).toBe('denied');
  });

  it('GPS callado (solo tiempos agotados): sigue reportando, es un taxi detenido', async () => {
    const { geo, fix } = fakeGeo();
    geo.getCurrentPosition.mockImplementation((_ok, err) => err({ code: 3 }));
    const report = ok();
    const { result } = renderHook(() =>
      useDriverLocation({ geolocation: geo, report, enabled: true }),
    );
    fix(1, 1);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(result.current).toBe('active');
    report.mockClear();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(report).toHaveBeenCalledWith(1, 1);
  });

  it('señal no disponible: deja de reportar de inmediato', async () => {
    const { geo, fix, fail } = fakeGeo();
    const report = ok();
    const { result } = renderHook(() =>
      useDriverLocation({ geolocation: geo, report, enabled: true }),
    );
    fix(1, 1);
    fail(2);
    expect(result.current).toBe('searching');
    report.mockClear();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(report).not.toHaveBeenCalled();
  });

  it('con la app oculta no reenvía la última posición', async () => {
    const { geo, fix } = fakeGeo();
    const report = ok();
    renderHook(() => useDriverLocation({ geolocation: geo, report, enabled: true }));
    fix(1, 1);
    report.mockClear();
    act(() => setVisibility('hidden'));
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(report).not.toHaveBeenCalled();
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    act(() => setVisibility('visible'));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(report).toHaveBeenCalled();
  });

  it('sin posiciones nuevas por 5 min deja de reportar y vuelve a buscar', async () => {
    const { geo, fix } = fakeGeo();
    const report = ok();
    const { result } = renderHook(() =>
      useDriverLocation({ geolocation: geo, report, enabled: true }),
    );
    fix(1, 1);
    await act(() => vi.advanceTimersByTimeAsync(301_000));
    expect(result.current).toBe('searching');
    const calls = report.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(report.mock.calls.length).toBe(calls);
  });

  it('permiso denegado informa, deja de reportar y reintenta al volver a la app', async () => {
    const { geo, fix, fail } = fakeGeo();
    const report = ok();
    const { result } = renderHook(() =>
      useDriverLocation({ geolocation: geo, report, enabled: true }),
    );
    fix(1, 1);
    fail(1);
    expect(result.current).toBe('denied');
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(report).toHaveBeenCalledTimes(1);

    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(geo.clearWatch).toHaveBeenCalledWith(1);
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    fix(2, 2);
    expect(result.current).toBe('active');
  });

  it('un error transitorio no cambia el estado', () => {
    const { geo, fix, fail } = fakeGeo();
    const report = ok();
    const { result } = renderHook(() =>
      useDriverLocation({ geolocation: geo, report, enabled: true }),
    );
    fix(1, 1);
    fail(3);
    expect(result.current).toBe('active');
  });

  it.each([
    ['rechazo', () => Promise.reject(new Error('red'))],
    ['ok: false', () => Promise.resolve({ ok: false })],
    ['excepción síncrona', () => { throw new Error('boom'); }],
  ])('un reporte fallido (%s) no rompe y se informa; se recupera', async (_name, failing) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { geo, fix } = fakeGeo();
    const report = vi.fn<(lat: number, lng: number) => Promise<{ ok: boolean }>>(failing);
    const { result } = renderHook(() =>
      useDriverLocation({ geolocation: geo, report, enabled: true }),
    );
    fix(1, 1);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current).toBe('failing');
    report.mockImplementation(() => Promise.resolve({ ok: true }));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current).toBe('active');
  });

  it('deshabilitado no observa ni reporta; al desmontar limpia', async () => {
    const { geo, fix } = fakeGeo();
    const report = ok();
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useDriverLocation({ geolocation: geo, report, enabled }),
      { initialProps: { enabled: false } },
    );
    expect(result.current).toBe('paused');
    expect(geo.watchPosition).not.toHaveBeenCalled();
    rerender({ enabled: true });
    fix(1, 1);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current).toBe('active');
    rerender({ enabled: false });
    expect(result.current).toBe('paused');
    expect(geo.clearWatch).toHaveBeenCalledTimes(1);
    const calls = report.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(report.mock.calls.length).toBe(calls);
    rerender({ enabled: true });
    expect(result.current).toBe('searching');
    unmount();
    expect(geo.clearWatch).toHaveBeenCalledTimes(2);
  });
});

describe('useWakeLock', () => {
  function fakeWake() {
    const sentinels: Array<{ released: boolean; release: ReturnType<typeof vi.fn> }> = [];
    const wake: WakeLockLike = {
      request: vi.fn(() => {
        const s = { released: false, release: vi.fn(() => Promise.resolve()) };
        sentinels.push(s);
        return Promise.resolve(s);
      }),
    };
    return { wake, sentinels };
  }

  it('sin soporte no hace nada', () => {
    expect(() => renderHook(() => useWakeLock(null, true))).not.toThrow();
  });

  it('adquiere, re-adquiere al volver visible y libera al desmontar', async () => {
    const { wake, sentinels } = fakeWake();
    const { unmount } = renderHook(() => useWakeLock(wake, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(wake.request).toHaveBeenCalledWith('screen');

    const first = sentinels[0];
    if (first) first.released = true; // el navegador lo suelta al ocultarse
    act(() => setVisibility('hidden'));
    expect(wake.request).toHaveBeenCalledTimes(1);
    act(() => setVisibility('visible'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(wake.request).toHaveBeenCalledTimes(2);

    unmount();
    expect(sentinels[1]?.release).toHaveBeenCalled();
  });

  it('no re-adquiere si el bloqueo sigue vigente', async () => {
    const { wake } = fakeWake();
    renderHook(() => useWakeLock(wake, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => setVisibility('visible'));
    expect(wake.request).toHaveBeenCalledTimes(1);
  });

  it('ignora el rechazo del navegador', async () => {
    const wake: WakeLockLike = { request: () => Promise.reject(new Error('NotAllowed')) };
    renderHook(() => useWakeLock(wake, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
  });

  it('libera si se desmonta antes de que resuelva la solicitud', async () => {
    const { wake, sentinels } = fakeWake();
    const { unmount } = renderHook(() => useWakeLock(wake, true));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(sentinels[0]?.release).toHaveBeenCalled();
  });

  it('deshabilitado no solicita', () => {
    const { wake } = fakeWake();
    renderHook(() => useWakeLock(wake, false));
    expect(wake.request).not.toHaveBeenCalled();
  });
});
