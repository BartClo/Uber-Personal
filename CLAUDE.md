# Despacho — panel de flota de taxis privados

Next.js (App Router) + TypeScript estricto + Supabase + Leaflet. Plan vigente: `docs/plans/2026-11-02-panel-admin-despacho.md`.

## Reglas para agentes (obligatorias)

- Trabaja **solo** dentro de este repositorio. No edites archivos fuera de él.
- Haz **solo** la tarea asignada. No toques archivos que tu tarea no nombra salvo que sea imprescindible, y explícalo en tu reporte.
- No hagas `git push`, `git reset --hard`, `git clean`, `git rebase`, ni reescribas historia. No uses `git stash` sin nombre.
- No instales dependencias fuera de las que el plan nombra sin justificarlo en el reporte.
- Nunca escribas secretos (keys, contraseñas) en el código ni en commits. Usa variables de entorno y `.env.example`.
- No lances subagentes.

## Calidad

- TDD: test que falla → implementación → test pasa.
- Antes de cada commit: `npm run verify` (typecheck + lint + test) debe pasar con salida limpia.
- TypeScript `strict`; prohibido `any` explícito, `@ts-ignore` y `eslint-disable` sin justificación.
- `src/domain` es puro: sin React, sin Supabase, sin `Date.now()` (el tiempo entra como parámetro `now`).
- Fechas en ISO 8601 UTC. Textos de UI en español. Accesibilidad WCAG 2.1 AA (labels, roles, el estado nunca solo por color).
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`).

## Comandos

- `npm run dev` · `npm run build` · `npm run verify` · `npx vitest run <ruta>`
- `npx supabase start` · `npx supabase db reset` · `npm run simulate`
