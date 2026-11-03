-- Esquema inicial: taxistas, viajes, asignación atómica, RLS y realtime.

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  taxi_number text not null,
  phone text not null,
  status text not null default 'offline' check (status in ('free', 'busy', 'offline')),
  lat double precision,
  lng double precision,
  last_seen_at timestamptz
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'admin' check (source in ('admin', 'client_app')),
  customer_name text not null,
  customer_phone text not null,
  pickup_address text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_address text not null,
  status text not null default 'pending'
    check (status in ('pending', 'assigned', 'en_route', 'on_board', 'completed', 'cancelled')),
  driver_id uuid references public.drivers (id) on delete set null,
  created_at timestamptz not null default now(),
  assigned_at timestamptz
);

create index trips_driver_id_idx on public.trips (driver_id);

alter table public.drivers enable row level security;
alter table public.trips enable row level security;

create policy drivers_admin_all on public.drivers
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy trips_admin_all on public.trips
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Asignación atómica. security invoker: aplica RLS del llamante.
-- Orden de bloqueo fijo (viaje, luego taxista) para evitar interbloqueos.
create or replace function public.assign_trip(p_trip_id uuid, p_driver_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_trip public.trips;
  v_driver public.drivers;
begin
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'trip_not_found');
  end if;
  if v_trip.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'already_assigned');
  end if;

  select * into v_driver from public.drivers where id = p_driver_id for update;
  if not found or v_driver.status <> 'free' then
    return jsonb_build_object('ok', false, 'error', 'driver_unavailable');
  end if;

  update public.trips
     set status = 'assigned', driver_id = p_driver_id, assigned_at = now()
   where id = p_trip_id and status = 'pending'
  returning * into v_trip;

  update public.drivers
     set status = 'busy'
   where id = p_driver_id and status = 'free';

  return jsonb_build_object('ok', true, 'trip', to_jsonb(v_trip));
end;
$$;

revoke all on function public.assign_trip(uuid, uuid) from public;
revoke all on function public.assign_trip(uuid, uuid) from anon;
grant execute on function public.assign_trip(uuid, uuid) to authenticated;

alter publication supabase_realtime add table public.drivers, public.trips;
