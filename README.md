# Despacho

Panel de administración para el despacho de una flota de taxis privados. Next.js (App Router), TypeScript estricto, Supabase y Leaflet.

Plan vigente: `docs/plans/2026-11-02-panel-admin-despacho.md`. Reglas para agentes: `CLAUDE.md`.

## Comandos

- `npm run dev` · `npm run build` · `npm run verify`
- `npx vitest run <ruta>`
- `npx supabase start` · `npx supabase db reset` · `npm run simulate`

## Estado de verificación

Verificado contra Supabase local (Postgres real) el 2026-11-03: suite de integración (contrato, asignación concurrente, RLS), simulador y flujo en navegador por `/`: login, bloqueo de cuentas sin rol admin, marcadores en vivo, asignación y banner "Reconectando…" al detener y reiniciar Realtime. **No verificado:** despliegue en un proyecto Supabase remoto. La app del taxista se verificó el mismo día en navegador de escritorio con emulación móvil y GPS simulado; **falta probarla en un teléfono real**. Para repetir la verificación:

```bash
npx supabase start
npx supabase db reset
npx supabase status -o env   # copia API_URL, ANON_KEY, SERVICE_ROLE_KEY
export SUPABASE_TEST_URL=<API_URL> SUPABASE_TEST_ANON_KEY=<ANON_KEY> SUPABASE_TEST_SERVICE_KEY=<SERVICE_ROLE_KEY>
npx vitest run src/data/supabaseRepo.test.ts      # deben pasar todos, incl. caso concurrente y RLS
SUPABASE_URL=<API_URL> SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> timeout 15 npm run simulate
# confirma que last_seen_at cambió para los taxis 01-07 (el 08 queda en null):
curl -s "<API_URL>/rest/v1/drivers?select=taxi_number,lat,lng,last_seen_at" -H "apikey: <SERVICE_ROLE_KEY>" -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
unset SUPABASE_TEST_URL; npm run verify
```

## App del taxista (`/taxista`)

Pantalla móvil donde el taxista ve su viaje, avanza sus estados y envía su ubicación. No existe la opción de rechazar un viaje.

- **La ubicación solo se envía con la app abierta.** Es una app web: si se cierra o queda en segundo plano, el panel verá al taxi sin señal. La app lo avisa en pantalla y, donde el navegador lo permite, mantiene la pantalla encendida (Wake Lock).
- **El GPS y Wake Lock requieren HTTPS o `localhost`.** Por `http://` a una IP de la red local (por ejemplo, abrir desde el teléfono `http://192.168.x.x:3000`) el navegador bloquea la ubicación: usa HTTPS para probar en un teléfono real.

### Crear un taxista

Crea el usuario de Auth con `app_metadata.role = 'driver'` y lo vincula a la fila del taxi con ese número; si no existe, la crea. Se niega si el taxi ya tiene otra cuenta vinculada. La contraseña se lee de una variable de entorno, nunca de los argumentos, para que no quede en el historial de comandos ni en la lista de procesos.

```bash
export SUPABASE_URL=<API_URL> SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
read -rs DRIVER_PASSWORD && export DRIVER_PASSWORD
npm run create-driver -- --email carlos@ejemplo.com --name "Carlos Rojas" --taxi 07 --phone "+56 9 5555 0100"
unset DRIVER_PASSWORD
```

## Crear el primer usuario admin

1. Crea el usuario desde el panel de Supabase (Authentication > Users) o por el flujo de registro.
2. Asígnale el rol admin en `app_metadata`, desde el SQL Editor:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
where email = 'admin@ejemplo.com';
```

3. El usuario debe cerrar sesión y volver a entrar para que el JWT incluya el rol.

## App del cliente (`/pedir`)

Los clientes piden taxi sin cuenta en `/pedir` y siguen su viaje en `/pedir/<token>` (el token va en la URL, así que pueden recargar). El pedido entra como `pending` con origen `client_app` y aparece en la cola del panel admin por Realtime, sin cambios.

- Migración `supabase/migrations/0003_client_app.sql`: columna `trips.tracking_token` y dos funciones `security definer` (`request_trip`, `get_trip_status`) ejecutables por `anon`. Los anónimos no tienen acceso directo a `trips` ni `drivers`; el seguimiento solo devuelve estado, direcciones, nombre de pila y número de taxi (nunca teléfonos ni coordenadas).
- Prueba de integración: `src/data/clientRepo.supabase.test.ts` (se omite sin `SUPABASE_TEST_URL`).
- **Antes de publicar:** el formulario público solo tiene un límite básico (máx. 3 viajes activos por teléfono). Hace falta CAPTCHA y rate limiting (por IP, en el borde o en una Edge Function) antes de exponerlo a Internet.
