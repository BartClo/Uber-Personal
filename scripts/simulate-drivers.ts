/**
 * Simulador de taxistas para desarrollo local.
 * Inserta (o reutiliza) 8 taxistas en Santiago con taxi_number "01".."08" y cada 5 s
 * actualiza lat, lng y last_seen_at con un paseo aleatorio.
 * - El taxi "08" nunca envía señal (last_seen_at queda null).
 * - El taxi "07" deja de enviar señal a los 2 minutos.
 *
 * Variables: SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TICK_MS = 5_000;
const STOPS_AFTER_MS = 2 * 60_000;
const SILENT = '08';
const STOPS = '07';
const CENTER = { lat: -33.4489, lng: -70.6693 };
const NAMES = ['Luis', 'Carmen', 'Jorge', 'Paula', 'Andrés', 'Rosa', 'Diego', 'Elena'];

interface SimDriver {
  id: string;
  taxiNumber: string;
  lat: number;
  lng: number;
}

function jitter(scale: number): number {
  return (Math.random() - 0.5) * scale;
}

async function ensureDrivers(): Promise<SimDriver[]> {
  const numbers = NAMES.map((_, i) => String(i + 1).padStart(2, '0'));
  const { data: existing, error } = await supabase
    .from('drivers')
    .select('id, taxi_number, lat, lng')
    .in('taxi_number', numbers);
  if (error) throw new Error(error.message);
  const byNumber = new Map(existing.map((r) => [r.taxi_number as string, r]));
  const missing = numbers
    .filter((n) => !byNumber.has(n))
    .map((n, i) => ({
      name: NAMES[Number(n) - 1] ?? `Conductor ${i}`,
      taxi_number: n,
      phone: `+56 9 5555 00${n}`,
      status: 'free',
      lat: n === SILENT ? null : CENTER.lat + jitter(0.06),
      lng: n === SILENT ? null : CENTER.lng + jitter(0.06),
    }));
  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from('drivers')
      .insert(missing)
      .select('id, taxi_number, lat, lng');
    if (insertError) throw new Error(insertError.message);
    for (const r of inserted) byNumber.set(r.taxi_number as string, r);
  }
  return numbers.map((n) => {
    const r = byNumber.get(n);
    if (!r) throw new Error(`No se pudo crear el taxi ${n}`);
    return {
      id: r.id as string,
      taxiNumber: n,
      lat: (r.lat as number | null) ?? CENTER.lat + jitter(0.06),
      lng: (r.lng as number | null) ?? CENTER.lng + jitter(0.06),
    };
  });
}

async function tick(drivers: SimDriver[], elapsedMs: number): Promise<void> {
  const now = new Date().toISOString();
  const active = drivers.filter(
    (d) => d.taxiNumber !== SILENT && !(d.taxiNumber === STOPS && elapsedMs >= STOPS_AFTER_MS),
  );
  await Promise.all(
    active.map(async (d) => {
      d.lat += jitter(0.002);
      d.lng += jitter(0.002);
      const { error } = await supabase
        .from('drivers')
        .update({ lat: d.lat, lng: d.lng, last_seen_at: now })
        .eq('id', d.id);
      if (error) console.error(`[taxi ${d.taxiNumber}]`, error.message);
    }),
  );
  console.log(`${now} · ${active.length} taxis enviaron posición`);
}

async function main(): Promise<void> {
  const drivers = await ensureDrivers();
  console.log(`Simulando ${drivers.length} taxis (Ctrl+C para salir).`);
  const start = Date.now();
  await tick(drivers, 0);
  setInterval(() => {
    tick(drivers, Date.now() - start).catch((e: unknown) => console.error(e));
  }, TICK_MS);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
