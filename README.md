# Despacho

Panel de administración para el despacho de una flota de taxis privados. Next.js (App Router), TypeScript estricto, Supabase y Leaflet.

Plan vigente: `docs/plans/2026-11-02-panel-admin-despacho.md`. Reglas para agentes: `CLAUDE.md`.

## Comandos

- `npm run dev` · `npm run build` · `npm run verify`
- `npx vitest run <ruta>`
- `npx supabase start` · `npx supabase db reset` · `npm run simulate`

## Estado de verificación

Verificado contra Supabase local (Postgres real) el 2026-11-03: suite de integración (contrato, asignación concurrente, RLS), simulador y flujo en navegador por `/`: login, bloqueo de cuentas sin rol admin, marcadores en vivo, asignación y banner "Reconectando…" al detener y reiniciar Realtime. **No verificado:** despliegue en un proyecto Supabase remoto. Para repetir la verificación:

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

## Crear el primer usuario admin

1. Crea el usuario desde el panel de Supabase (Authentication > Users) o por el flujo de registro.
2. Asígnale el rol admin en `app_metadata`, desde el SQL Editor:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
where email = 'admin@ejemplo.com';
```

3. El usuario debe cerrar sesión y volver a entrar para que el JWT incluya el rol.
