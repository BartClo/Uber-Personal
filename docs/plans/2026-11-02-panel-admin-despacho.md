# Panel de despacho del admin — Implementation Plan (v2, Next.js)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Un panel web donde el admin ve a sus taxistas en un mapa en vivo, ve la cola de pedidos, carga pedidos a mano y asigna cada viaje a un taxista.

**Architecture:** Next.js (App Router) + TypeScript estricto. Toda la lógica de negocio vive en `src/domain` (funciones puras, sin React ni Supabase) y el acceso a datos detrás de la interfaz `FleetRepo`, con una implementación en memoria (tests y desarrollo) y otra sobre Supabase (Postgres + Realtime + Auth). La asignación es atómica en la base de datos mediante una función RPC. El panel es una página cliente (`'use client'`); Leaflet se carga con `next/dynamic` y `ssr: false`.

**Tech Stack:** Next.js (última estable, App Router, `src/`), React, TypeScript `strict`, ESLint (config de Next + typescript-eslint), Prettier, Vitest + `@vitejs/plugin-react` + Testing Library + jsdom, Supabase (`@supabase/supabase-js`), Leaflet + `react-leaflet` con tiles de OpenStreetMap.

**Spec:** "Diseño: Despacho para flota de taxis privados" + mockups `Despacho — plataforma de flota.pdf` (panel admin, app taxista, app cliente). Este plan implementa solo la pieza 1 (panel del admin).

**Cambios respecto a v1 (Vite):** Vite → Next.js; `VITE_*` → `NEXT_PUBLIC_*`; `src/main.tsx` → `src/app/layout.tsx` + `src/app/page.tsx`; se añade `taxiNumber` a `Driver`, filtros y contadores del mockup, etiquetas de origen y estado en la cola, y una Task 0 de harness y calidad.

## Global Constraints

- Web en Next.js, sin app nativa; herramientas gratuitas o de bajo costo (Supabase, Leaflet, OpenStreetMap).
- El admin asigna manualmente: no hay asignación automática por cercanía.
- El taxista no puede rechazar: no existe estado ni acción de rechazo.
- Todos los pedidos, vengan de donde vengan, pasan por una sola cola (`trips`, campo `source`).
- Un taxista sin señal reciente se muestra en gris con "última señal hace X".
- Escala: decenas de taxistas, no miles.
- Textos de la interfaz en español (`<html lang="es">`).

## Quality Standards (vinculantes para todas las tareas)

- **ISO/IEC 25010** como marco: corrección funcional (tests), mantenibilidad (dominio puro, archivos con una responsabilidad), seguridad (RLS, sin secretos en el cliente), usabilidad/accesibilidad.
- **ISO 8601**: todas las fechas viajan y se guardan como strings ISO 8601 en UTC (`timestamptz` en Postgres).
- **ITU-T E.164 / ISO 3166**: teléfonos se muestran tal como se ingresan; país por defecto Chile (`+56`).
- **WCAG 2.1 AA** (ISO/IEC 40500): todo input con `<label>`; diálogos con `role="dialog"` y `aria-modal`; banner de conexión con `role="status"`; el estado nunca se comunica solo por color (siempre texto además del color).
- TypeScript `strict` + `noUncheckedIndexedAccess`; prohibido `any` explícito y `@ts-ignore`.
- TDD: test que falla → implementación → test pasa. Tests por comportamiento, no por detalles internos.
- `npm run verify` (typecheck + lint + test) debe pasar antes de cada commit. Commits con Conventional Commits.

## Review Focus

1. Taxista sin ubicación todavía (`lat`/`lng` nulos): aparece en la lista como "sin señal", no en el mapa, sin errores.
2. Taxista con señal vieja (más de 60 s): gris en mapa y lista; asignarle exige confirmación explícita. Un taxista `offline` no se puede asignar.
3. Dos admins asignan el mismo viaje, o a un mismo taxista, a la vez: gana uno; el otro recibe `already_assigned` y la interfaz lo explica sin romperse.
4. Pedido por teléfono sin coordenadas (solo dirección): se crea igual, aparece en la cola sin pin en el mapa, con "Sin ubicación en el mapa" y distancia "—".
5. Se cae la conexión en tiempo real: banner "Reconectando…" y recarga completa de datos al volver, en vez de mostrar datos viejos sin avisar.

---

## File Structure

```
CLAUDE.md, .claude/settings.json                 # harness para agentes
package.json, next.config.ts, tsconfig.json, eslint.config.mjs, .prettierrc, vitest.config.mts, vitest.setup.ts
src/app/layout.tsx, src/app/page.tsx, src/app/globals.css
src/domain/types.ts, freshness.ts, distance.ts, rankDrivers.ts, labels.ts
src/data/repo.ts, fakeRepo.ts, repo.contract.ts, supabaseRepo.ts
supabase/migrations/0001_init.sql
scripts/simulate-drivers.ts
src/ui/FleetMap.tsx, FleetMapInner.tsx, DriverList.tsx, TripQueue.tsx,
       NewTripForm.tsx, AssignDialog.tsx, ConnectionBanner.tsx, Header.tsx
src/ui/Dashboard.tsx, src/auth/AuthGate.tsx
```

---

### Task 0: Harness, scaffold Next.js y puertas de calidad

**Files:**
- Create: `CLAUDE.md`, `.claude/settings.json`, scaffold Next.js, `vitest.config.mts`, `vitest.setup.ts`, `.prettierrc`, `.gitattributes`
- Test: `src/smoke.test.ts`

- [ ] **Step 1: Scaffold** con `npx create-next-app@latest . --ts --eslint --app --src-dir --no-tailwind --import-alias "@/*" --use-npm --yes` (el directorio solo tiene `.git`, `CLAUDE.md`, `docs/` y `.claude/`; si el CLI se niega por archivos existentes, scaffoldear en un directorio temporal dentro del repo y mover). Eliminar contenido de ejemplo de `page.tsx` y `globals.css`.
- [ ] **Step 2: Calidad.** En `tsconfig.json` añadir `"noUncheckedIndexedAccess": true`. Instalar `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event vite-tsconfig-paths prettier eslint-config-prettier`. `vitest.config.mts` con `environment: 'jsdom'`, `setupFiles: ['./vitest.setup.ts']` (importa `@testing-library/jest-dom/vitest`), plugins react y tsconfig-paths. ESLint: añadir regla `@typescript-eslint/no-explicit-any: error` y `eslint-config-prettier`. Scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`, `"lint": "eslint ."`, `"format": "prettier --write ."`, `"verify": "npm run typecheck && npm run lint && npm run test"`.
- [ ] **Step 3:** `src/smoke.test.ts` con `expect(1 + 1).toBe(2)`; `npm run verify` — Expected: PASS. `npm run build` — Expected: PASS.
- [ ] **Step 4: Commit** `chore: scaffold next.js, harness y puertas de calidad`

(`CLAUDE.md` y `.claude/settings.json` los escribe el controlador antes de esta tarea; el implementador solo verifica que siguen ahí.)

---

### Task 1: Funciones de dominio

**Files:**
- Create: `src/domain/types.ts`, `src/domain/freshness.ts`, `src/domain/distance.ts`, `src/domain/labels.ts`
- Test: `src/domain/freshness.test.ts`, `src/domain/distance.test.ts`, `src/domain/labels.test.ts`

**Interfaces — Produces:**
- `type DriverStatus = 'free' | 'busy' | 'offline'`
- `type TripStatus = 'pending' | 'assigned' | 'en_route' | 'on_board' | 'completed' | 'cancelled'`
- `type TripSource = 'admin' | 'client_app'`
- `interface Driver { id: string; name: string; taxiNumber: string; phone: string; status: DriverStatus; lat: number | null; lng: number | null; lastSeenAt: string | null }`
- `interface Trip { id: string; source: TripSource; customerName: string; customerPhone: string; pickupAddress: string; pickupLat: number | null; pickupLng: number | null; dropoffAddress: string; status: TripStatus; driverId: string | null; createdAt: string; assignedAt: string | null }`
- `const STALE_AFTER_MS = 60_000`
- `isStale(lastSeenAt: string | null, now: Date): boolean` — `null` cuenta como vieja.
- `formatLastSeen(lastSeenAt: string | null, now: Date): string` — `"sin señal"`, `"hace 20 s"`, `"hace 3 min"`.
- `haversineKm(a: {lat: number; lng: number}, b: {lat: number; lng: number}): number`
- `formatDistanceKm(km: number | null): string` — `null` → `"—"`; `1.2` → `"1,2 km"` (coma decimal, locale `es-CL`).
- `driverStatusLabel(s: DriverStatus): string` — `free` → `"Libre"`, `busy` → `"En viaje"`, `offline` → `"Desconectado"`.
- `tripStatusLabel(s: TripStatus): string` — `pending` → `"En espera"`, `assigned` → `"Asignado"`, `en_route` → `"En camino al cliente"`, `on_board` → `"Cliente a bordo"`, `completed` → `"Finalizado"`, `cancelled` → `"Cancelado"`.
- `tripSourceLabel(s: TripSource): string` — `admin` → `"Cargado por admin"`, `client_app` → `"App del cliente"`.

- [ ] **Step 1: Tests que fallan.** `freshness.test.ts`: `isStale(null, now) === true`; hace 59 s → `false`; hace 61 s → `true`; `formatLastSeen` devuelve `"hace 20 s"`, `"hace 3 min"` y `"sin señal"`. `distance.test.ts`: `haversineKm(p, p) === 0`; Plaza de Armas de Santiago (-33.4378, -70.6505) a Costanera Center (-33.4173, -70.6064) ≈ 4.7 km (tolerancia ±0.3; el plan v1 decía ≈4 km, que es geométricamente incorrecto); `formatDistanceKm(null) === "—"`, `formatDistanceKm(1.2) === "1,2 km"`. `labels.test.ts`: cada etiqueta de arriba.
- [ ] **Step 2: Run** `npx vitest run src/domain` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Run** `npx vitest run src/domain` — Expected: PASS; luego `npm run verify`.
- [ ] **Step 5: Commit** `feat: helpers de dominio`

---

### Task 2: Interfaz de datos, repo en memoria y tests de contrato

**Files:**
- Create: `src/data/repo.ts`, `src/data/fakeRepo.ts`, `src/data/repo.contract.ts`
- Test: `src/data/fakeRepo.test.ts` (llama a `runRepoContract(async () => new FakeRepo())`)

**Interfaces:**
- Consumes: tipos de Task 1.
- Produces:
  - `type AssignError = 'already_assigned' | 'driver_unavailable' | 'trip_not_found'`
  - `type AssignResult = { ok: true; trip: Trip } | { ok: false; error: AssignError }`
  - `type NewTripInput = Pick<Trip, 'customerName' | 'customerPhone' | 'pickupAddress' | 'pickupLat' | 'pickupLng' | 'dropoffAddress'>`
  - `type Unsubscribe = () => void`
  - `type ConnectionState = 'connected' | 'reconnecting'`
  - `interface FleetRepo { listDrivers(): Promise<Driver[]>; listTrips(): Promise<Trip[]>; subscribeDrivers(cb: (d: Driver[]) => void): Unsubscribe; subscribeTrips(cb: (t: Trip[]) => void): Unsubscribe; subscribeConnection(cb: (s: ConnectionState) => void): Unsubscribe; createTrip(input: NewTripInput): Promise<Trip>; assignTrip(tripId: string, driverId: string): Promise<AssignResult> }`
  - `class FakeRepo implements FleetRepo` con helpers de prueba `seed({drivers, trips})` y `setConnection(s: ConnectionState)`.
  - `runRepoContract(makeRepo: () => Promise<FleetRepo & { seed(...): Promise<void> | void }>)` — `makeRepo` asíncrono desde el inicio para que Task 3 lo reutilice sin cambios.

- [ ] **Step 1: Escribir `runRepoContract(makeRepo)`** con estos casos (nombres exactos):
  - `createTrip creates a pending trip with source 'admin' and null driverId`
  - `createTrip accepts null pickup coordinates`
  - `assignTrip assigns a pending trip to a free driver: trip → 'assigned', driver → 'busy'`
  - `assignTrip returns already_assigned when the trip is not pending`
  - `assignTrip returns driver_unavailable when the driver is busy`
  - `assignTrip returns driver_unavailable when the driver is offline`
  - `assignTrip returns trip_not_found for an unknown id`
  - `two concurrent assignTrip calls for the same trip: exactly one ok, one already_assigned` (con `Promise.all`)
  - `subscribeTrips calls back after createTrip; unsubscribe stops callbacks`
- [ ] **Step 2: Run** `npx vitest run src/data` — Expected: FAIL.
- [ ] **Step 3: Implementar `FakeRepo`.** Estado en memoria; verificación y cambio de `assignTrip` en un solo bloque síncrono (atómico). `createTrip` genera `id` con `crypto.randomUUID()` y `createdAt` ISO 8601. Asignar a un `free` con señal vieja es válido. Los callbacks reciben copias, no el estado interno.
- [ ] **Step 4: Run** `npx vitest run src/data` — Expected: PASS; `npm run verify`.
- [ ] **Step 5: Commit** `feat: interfaz FleetRepo y repo en memoria`

---

### Task 3: Esquema Supabase, repo real y simulador de taxistas

**Files:**
- Create: `supabase/config.toml` (vía `npx supabase init`), `supabase/migrations/0001_init.sql`, `src/data/supabaseRepo.ts`, `scripts/simulate-drivers.ts`
- Test: `src/data/supabaseRepo.test.ts` (corre el contrato contra Supabase local; `describe.skip` si falta `SUPABASE_TEST_URL`)

**Interfaces:**
- Consumes: `FleetRepo`, `runRepoContract` (Task 2).
- Produces:
  - `createSupabaseRepo(client: SupabaseClient): FleetRepo`
  - Tablas `drivers` (incluye `taxi_number text not null`) y `trips` con las columnas de `Driver` y `Trip` en snake_case, `uuid` con `gen_random_uuid()`, `timestamptz` para fechas, `check` sobre `status` y `trips.source in ('admin','client_app')`.
  - Función SQL `assign_trip(p_trip_id uuid, p_driver_id uuid) returns jsonb` (`security invoker`) que, en una sola transacción con `select … for update` sobre ambas filas, hace `update trips … where id = p_trip_id and status = 'pending'` y `update drivers … where id = p_driver_id and status = 'free'`, y devuelve `{ok:true,trip}` o `{ok:false,error}` con los códigos de `AssignError`.
  - RLS habilitado: solo usuarios autenticados con `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` leen y escriben `drivers` y `trips`.
  - Realtime: `alter publication supabase_realtime add table drivers, trips`.

- [ ] **Step 1: Escribir la migración.**
- [ ] **Step 2: Levantar Supabase local** con `npx supabase start` (Docker disponible) y `npx supabase db reset`.
- [ ] **Step 3: Escribir `supabaseRepo.test.ts`** reutilizando `runRepoContract`; limpia tablas antes de cada caso usando la service-role key local (`SUPABASE_TEST_SERVICE_KEY`) solo en el test; el repo bajo prueba usa un usuario admin de prueba. Run con las variables — Expected: FAIL.
- [ ] **Step 4: Implementar `createSupabaseRepo`.** Mapeo snake_case ↔ camelCase en funciones puras. `assignTrip` llama al RPC. Suscripciones con `channel().on('postgres_changes', …)`; ante cada cambio vuelven a listar. `subscribeConnection` traduce el estado del canal a `ConnectionState`; ante un nuevo `SUBSCRIBED` tras una caída, vuelve a listar todo. Errores de red se lanzan, no se tragan.
- [ ] **Step 5: Run** el test — Expected: PASS, incluido el caso concurrente.
- [ ] **Step 6: `scripts/simulate-drivers.ts`**: inserta 8 taxistas en Santiago (con `taxi_number` "01".."08") y cada 5 s actualiza `lat`, `lng`, `last_seen_at` con paseo aleatorio. Uno nunca envía señal y otro deja de hacerlo a los 2 minutos. Usa la service-role key de variable de entorno; nunca la hardcodea. Script `"simulate": "tsx scripts/simulate-drivers.ts"`. Añadir `.env.example` con todas las variables sin valores.
- [ ] **Step 7: Commit** `feat: esquema supabase, repo real y simulador`

---

### Task 4: Mapa y lista de taxistas

**Files:**
- Create: `src/ui/FleetMap.tsx` (wrapper con `next/dynamic`, `ssr: false`), `src/ui/FleetMapInner.tsx`, `src/ui/DriverList.tsx`
- Test: `src/ui/DriverList.test.tsx`, `src/ui/FleetMapInner.test.tsx`

**Interfaces:**
- Consumes: `Driver`, `Trip`, `isStale`, `formatLastSeen`, `driverStatusLabel`.
- Produces:
  - `DriverList(props: { drivers: Driver[]; now: Date })`: encabezado "Taxistas" con "N en la flota"; filtros "Todos", "Libres", "En viaje" (botones con `aria-pressed`); una fila por taxista con número de taxi, nombre, `driverStatusLabel` · `formatLastSeen`. Filas con señal vieja llevan `data-stale="true"` y el texto "Sin señal" en vez del estado.
  - `FleetMapInner(props: { drivers: Driver[]; trips: Trip[]; now: Date; selectedDriverId?: string | null; onSelectDriver?: (id: string) => void })`: un marcador por taxista con `lat`/`lng` no nulos, mostrando su número de taxi; gris si `isStale`. Centro inicial Santiago (-33.4489, -70.6693). Atribución de OpenStreetMap obligatoria.

- [ ] **Step 1: Tests que fallan.**
  - `DriverList`: un taxista con `lastSeenAt: null` muestra "sin señal" y `data-stale="true"`.
  - `DriverList`: uno visto hace 20 s muestra "hace 20 s" y no es stale.
  - `DriverList`: el filtro "Libres" oculta a los `busy` y `offline`.
  - `FleetMapInner` (con `react-leaflet` mockeado): con 3 taxistas, 1 con `lat: null`, se renderizan 2 marcadores; el de señal vieja recibe la clase `marker-stale`.
- [ ] **Step 2: Run** `npx vitest run src/ui` — Expected: FAIL.
- [ ] **Step 3: Implementar.** Marcadores con `L.divIcon` (clases `marker-free`, `marker-busy`, `marker-stale`), sin imágenes externas. Pedidos pendientes con coordenadas: pin distinto (`marker-trip`). Leyenda: "Libre", "En viaje", "Sin señal", "Pedido en espera". Importar `leaflet/dist/leaflet.css`.
- [ ] **Step 4: Run** — Expected: PASS; `npm run verify`.
- [ ] **Step 5: Commit** `feat: mapa y lista de taxistas`

---

### Task 5: Cola de pedidos y formulario de pedido manual

**Files:**
- Create: `src/ui/TripQueue.tsx`, `src/ui/NewTripForm.tsx`
- Test: `src/ui/TripQueue.test.tsx`, `src/ui/NewTripForm.test.tsx`

**Interfaces:**
- Consumes: `Trip`, `Driver`, `NewTripInput`, `tripStatusLabel`, `tripSourceLabel`.
- Produces:
  - `TripQueue(props: { trips: Trip[]; drivers: Driver[]; now: Date; onAssignClick: (trip: Trip) => void })`: sección "Pedidos" con "N en espera"; primero los `pending` (orden por `createdAt` ascendente) con nombre, teléfono, origen, destino, `tripSourceLabel`, "En espera · hace X" y botón "Asignar"; si no tiene coordenadas muestra "Sin ubicación en el mapa". Luego sección "En curso" con los `assigned`/`en_route`/`on_board`: cliente, "Nombre taxista · taxi NN" y `tripStatusLabel`.
  - `NewTripForm(props: { onSubmit: (input: NewTripInput) => Promise<void> })`: campos nombre, teléfono, dirección de origen, dirección de destino (todos con `<label>`). Coordenadas quedan `null`. Errores: "Falta el nombre del cliente", "Falta el teléfono", "Falta la dirección de origen", "Falta la dirección de destino". Si `onSubmit` rechaza, muestra "No se pudo crear el pedido. Intenta de nuevo." y conserva los datos.

- [ ] **Step 1: Tests que fallan.**
  - `TripQueue`: con 3 pendientes desordenados, aparecen del más antiguo al más nuevo.
  - `TripQueue`: un pedido sin coordenadas se muestra con "Sin ubicación en el mapa" y no lanza error.
  - `TripQueue`: clic en "Asignar" llama `onAssignClick` con ese viaje.
  - `TripQueue`: un viaje `on_board` aparece en "En curso" con "Cliente a bordo" y el nombre del taxista.
  - `NewTripForm`: con nombre vacío no llama `onSubmit` y muestra "Falta el nombre del cliente".
  - `NewTripForm`: con todo lleno llama `onSubmit` con `pickupLat: null` y `pickupLng: null`, y se limpia.
  - `NewTripForm`: si `onSubmit` rechaza, muestra el mensaje de error y conserva los datos.
- [ ] **Step 2: Run** `npx vitest run src/ui/TripQueue src/ui/NewTripForm` — Expected: FAIL.
- [ ] **Step 3: Implementar.** Botón de envío deshabilitado mientras se envía.
- [ ] **Step 4: Run** — Expected: PASS; `npm run verify`.
- [ ] **Step 5: Commit** `feat: cola de pedidos y formulario manual`

---

### Task 6: Flujo de asignación

**Files:**
- Create: `src/ui/AssignDialog.tsx`, `src/domain/rankDrivers.ts`
- Test: `src/ui/AssignDialog.test.tsx`, `src/domain/rankDrivers.test.ts`

**Interfaces:**
- Consumes: `Driver`, `Trip`, `haversineKm`, `isStale`, `formatDistanceKm`, `formatLastSeen`, `AssignResult`.
- Produces:
  - `rankDrivers(drivers: Driver[], trip: Trip, now: Date): RankedDriver[]` con `interface RankedDriver { driver: Driver; distanceKm: number | null; stale: boolean; assignable: boolean }`. `assignable` = `status === 'free'`. Orden: asignables con señal vigente por distancia (`null` al final del grupo), luego asignables con señal vieja, luego el resto; orden estable. Solo ayuda visual: nunca asigna.
  - `AssignDialog(props: { trip: Trip; drivers: Driver[]; now: Date; onAssign: (driverId: string) => Promise<AssignResult>; onClose: () => void })`: título "Asignar a", subtítulo "Más cerca primero"; por taxista: número, nombre, estado, `formatDistanceKm` y botón "Asignar". `role="dialog"`, `aria-modal="true"`, cierra con Escape.

- [ ] **Step 1: Tests que fallan.**
  - `rankDrivers`: un `free` a 1 km va antes que otro `free` a 3 km.
  - `rankDrivers`: un `offline` tiene `assignable: false`; un `busy` también.
  - `rankDrivers`: pedido sin coordenadas → todas las `distanceKm` son `null` y el orden es estable.
  - `AssignDialog`: asignar a un taxista con señal vieja pide confirmar ("Sin señal hace 3 min. ¿Asignar igual?") y solo llama `onAssign` tras confirmar.
  - `AssignDialog`: los no asignables aparecen con el botón deshabilitado.
  - `AssignDialog`: `{ok:false, error:'already_assigned'}` → "Este viaje ya fue asignado por otra persona" y no se cierra.
  - `AssignDialog`: `driver_unavailable` → "Ese taxista ya no está disponible" y mantiene la lista abierta.
  - `AssignDialog`: `trip_not_found` → "Este pedido ya no existe".
- [ ] **Step 2: Run** `npx vitest run src/domain/rankDrivers src/ui/AssignDialog` — Expected: FAIL.
- [ ] **Step 3: Implementar.** El diálogo cierra solo con `ok: true`. La confirmación es inline dentro del diálogo (no `window.confirm`).
- [ ] **Step 4: Run** — Expected: PASS; `npm run verify`.
- [ ] **Step 5: Commit** `feat: flujo de asignación manual`

---

### Task 7: Dashboard, acceso del admin y estado de conexión

**Files:**
- Create: `src/ui/Dashboard.tsx`, `src/ui/Header.tsx`, `src/ui/ConnectionBanner.tsx`, `src/auth/AuthGate.tsx`, `src/lib/supabaseClient.ts`
- Modify: `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`
- Test: `src/ui/Dashboard.test.tsx`, `src/ui/ConnectionBanner.test.tsx`, `src/ui/Header.test.tsx`, `src/auth/AuthGate.test.tsx`

**Interfaces:**
- Consumes: todos los componentes anteriores y `FleetRepo`.
- Produces:
  - `Dashboard(props: { repo: FleetRepo })`: carga inicial con `listDrivers`/`listTrips`, se suscribe a taxistas, viajes y conexión; temporizador de 1 s que actualiza `now`; limpia suscripciones y temporizador al desmontar; compone header, mapa, lista, cola, formulario ("Nuevo pedido") y diálogo.
  - `Header(props: { drivers: Driver[]; now: Date; connection: ConnectionState })`: título "Despacho" y contadores "N libres", "N en viaje", "N sin señal" (sin señal = `isStale`), e indicador "En vivo" cuando está conectado.
  - `AuthGate(props: { client: SupabaseClient; children: ReactNode })`: formulario correo y contraseña; deja pasar solo si `session.user.app_metadata.role === 'admin'`; si no, "Esta cuenta no tiene acceso de administrador" y botón "Cerrar sesión".
  - `ConnectionBanner(props: { state: ConnectionState })`: nada si `connected`; con `reconnecting` muestra "Reconectando…" con `role="status"`.
  - `src/lib/supabaseClient.ts`: crea el cliente con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`; error claro si faltan.
  - `page.tsx` (`'use client'`): `AuthGate` → `Dashboard` con `createSupabaseRepo`.

- [ ] **Step 1: Tests que fallan** (con `FakeRepo`):
  - `Dashboard`: carga y muestra los taxistas y pedidos sembrados.
  - `Dashboard`: crear un pedido en el formulario lo muestra en la cola.
  - `Dashboard`: asignar un pedido a un taxista libre lo mueve a "En curso" y marca al taxista como "En viaje".
  - `Dashboard`: `repo.setConnection('reconnecting')` muestra "Reconectando…"; al volver a `connected` desaparece.
  - `Header`: con 2 libres, 1 ocupado y 1 sin señal muestra "2 libres", "1 en viaje", "1 sin señal".
  - `ConnectionBanner`: sin texto cuando `state === 'connected'`.
  - `AuthGate`: una sesión con rol distinto de `admin` no renderiza `children`.
- [ ] **Step 2: Run** `npx vitest run` — Expected: FAIL en los tests nuevos.
- [ ] **Step 3: Implementar.** Diseño responsivo: escritorio en tres columnas (taxistas | mapa | pedidos), en pantallas angostas el mapa arriba y la cola abajo. CSS plano (CSS Modules o `globals.css`), sin librerías de UI.
- [ ] **Step 4: Run** `npm run verify` y `npm run build` — Expected: PASS.
- [ ] **Step 5: Verificación manual**: `npx supabase start`, `npm run simulate`, `npm run dev`. Taxistas se mueven, el sin señal sale gris, un pedido manual se asigna, al cortar la red aparece el banner.
- [ ] **Step 6: Commit** `feat: dashboard del admin con acceso y estado de conexión`

---

## Self-Review

- **Cobertura (pieza 1 + mockup):** mapa en vivo (T4), estado y número de taxi (T1, T4), filtros y contadores (T4, T7), cola con origen y estado (T5), carga manual (T5), asignación manual sin rechazo con "Más cerca primero" (T2, T6), señal vieja (T1, T4), una sola cola con `source` (T3). Piezas 2 (app taxista) y 3 (app cliente) fuera de este plan.
- **Decisiones del plan:** umbral 60 s; `rankDrivers` es solo ayuda visual; RLS por `app_metadata.role = 'admin'`; coordenadas del pedido manual opcionales (sin geocodificación).
