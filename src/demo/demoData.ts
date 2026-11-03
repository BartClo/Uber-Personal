import type { Driver, Trip } from "@/domain/types";

/** Datos de demostración (Santiago). Solo para la ruta /demo; nunca toca Supabase. */

const BASE = [
  {
    name: "Carlos Rojas",
    taxi: "07",
    lat: -33.4372,
    lng: -70.6341,
    status: "free",
  },
  {
    name: "Patricia Soto",
    taxi: "12",
    lat: -33.4255,
    lng: -70.6142,
    status: "free",
  },
  {
    name: "Jorge Valdés",
    taxi: "03",
    lat: -33.4489,
    lng: -70.6693,
    status: "free",
  },
  {
    name: "Miguel Araya",
    taxi: "09",
    lat: -33.4183,
    lng: -70.6003,
    status: "busy",
  },
  {
    name: "Ana Fuentes",
    taxi: "15",
    lat: -33.4569,
    lng: -70.6483,
    status: "busy",
  },
  {
    name: "Luis Contreras",
    taxi: "05",
    lat: -33.4401,
    lng: -70.6206,
    status: "free",
  },
  { name: "Sandra Mella", taxi: "11", lat: null, lng: null, status: "offline" },
] as const;

/** Taxi que deja de enviar señal en la demo (aparece gris tras 60 s). */
export const SILENT_TAXI = "05";

function ago(now: Date, ms: number): string {
  return new Date(now.getTime() - ms).toISOString();
}

export function demoDrivers(now: Date): Driver[] {
  return BASE.map((b, i) => ({
    id: `00000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`,
    name: b.name,
    taxiNumber: b.taxi,
    phone: `+56 9 5555 00${String(i + 1).padStart(2, "0")}`,
    status: b.status,
    lat: b.lat,
    lng: b.lng,
    // Luis empieza con señal vieja (3 min) para mostrar el estado gris.
    lastSeenAt:
      b.status === "offline"
        ? null
        : ago(now, b.taxi === SILENT_TAXI ? 180_000 : 5_000),
  }));
}

export function demoTrips(now: Date, drivers: Driver[]): Trip[] {
  const byTaxi = (t: string) =>
    drivers.find((d) => d.taxiNumber === t)?.id ?? null;
  const trip = (
    n: number,
    t: Omit<Trip, "id" | "assignedAt" | "createdAt"> & { createdMsAgo: number },
  ): Trip => {
    const { createdMsAgo, ...rest } = t;
    return {
      ...rest,
      id: `10000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
      createdAt: ago(now, createdMsAgo),
      assignedAt: rest.driverId ? ago(now, createdMsAgo - 60_000) : null,
    };
  };
  return [
    trip(1, {
      source: "admin",
      customerName: "Valentina Gómez",
      customerPhone: "+56 9 1234 5678",
      pickupAddress: "Av. Providencia 1234, Providencia",
      pickupLat: -33.4296,
      pickupLng: -70.6197,
      dropoffAddress: "Aeropuerto Arturo Merino Benítez, Pudahuel",
      status: "pending",
      driverId: null,
      createdMsAgo: 240_000,
    }),
    trip(2, {
      source: "admin",
      customerName: "Rodrigo Pinto",
      customerPhone: "+56 9 8765 4321",
      pickupAddress: "Los Leones 1650, Providencia",
      pickupLat: null,
      pickupLng: null,
      dropoffAddress: "Mall Costanera Center",
      status: "pending",
      driverId: null,
      createdMsAgo: 120_000,
    }),
    trip(3, {
      source: "client_app",
      customerName: "Teresa Molina",
      customerPhone: "+56 9 2222 3333",
      pickupAddress: "Lota 2310, Providencia",
      pickupLat: -33.4205,
      pickupLng: -70.6075,
      dropoffAddress: "Plaza Ñuñoa",
      status: "pending",
      driverId: null,
      createdMsAgo: 40_000,
    }),
    trip(4, {
      source: "admin",
      customerName: "Camila Reyes",
      customerPhone: "+56 9 4444 5555",
      pickupAddress: "Apoquindo 3000, Las Condes",
      pickupLat: -33.4167,
      pickupLng: -70.6006,
      dropoffAddress: "Estación Central",
      status: "en_route",
      driverId: byTaxi("09"),
      createdMsAgo: 600_000,
    }),
    trip(5, {
      source: "client_app",
      customerName: "Hernán Lagos",
      customerPhone: "+56 9 6666 7777",
      pickupAddress: "Av. Matta 500, Santiago",
      pickupLat: -33.4569,
      pickupLng: -70.6483,
      dropoffAddress: "Parque Arauco",
      status: "on_board",
      driverId: byTaxi("15"),
      createdMsAgo: 900_000,
    }),
  ];
}

/**
 * Un paso de la simulación: los taxistas con señal (excepto el silencioso y los offline)
 * se mueven un poco y renuevan `lastSeenAt`. `rand` se inyecta para poder testear.
 */
export function stepDrivers(
  drivers: Driver[],
  now: Date,
  rand: () => number,
): Driver[] {
  return drivers.map((d) => {
    if (
      d.status === "offline" ||
      d.taxiNumber === SILENT_TAXI ||
      d.lat === null ||
      d.lng === null
    ) {
      return d;
    }
    const jitter = () => (rand() - 0.5) * 0.002;
    return {
      ...d,
      lat: d.lat + jitter(),
      lng: d.lng + jitter(),
      lastSeenAt: now.toISOString(),
    };
  });
}
