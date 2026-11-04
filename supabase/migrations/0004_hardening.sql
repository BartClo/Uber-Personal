-- Endurecimiento: datos del cliente, token de seguimiento, cancelación, límite de pedidos y permisos.

-- ---------------------------------------------------------------------------------------------
-- El taxista solo ve sus viajes mientras están en curso. Realtime aplica esta misma política, así
-- que NO recibe el evento cuando un viaje sale de estos estados: la app relee con un temporizador.
-- ---------------------------------------------------------------------------------------------
drop policy trips_driver_select_own on public.trips;
create policy trips_driver_select_own on public.trips
  for select to authenticated
  using (
    status in ('assigned', 'en_route', 'on_board')
    and driver_id in (select d.id from public.drivers d where d.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------------------------
-- Token de seguimiento en su propia tabla: RLS sin políticas y fuera de la publicación de Realtime.
-- Un revoke por columna rompería los `select *` del panel, y sacarlo de trips también lo saca de
-- las filas que Realtime entrega a los taxistas.
-- ---------------------------------------------------------------------------------------------
create table public.trip_tracking (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  token uuid not null unique default gen_random_uuid()
);
alter table public.trip_tracking enable row level security;
revoke all on public.trip_tracking from public, anon, authenticated;

-- Solo los pedidos de la app del cliente tienen enlace de seguimiento.
insert into public.trip_tracking (trip_id, token)
select id, tracking_token from public.trips where source = 'client_app';

alter table public.trips drop column tracking_token;

-- ---------------------------------------------------------------------------------------------
-- Momento en que terminó el viaje, sea cual sea la vía de escritura (RPC o RLS del admin).
-- ---------------------------------------------------------------------------------------------
alter table public.trips add column finished_at timestamptz;

update public.trips
   set finished_at = coalesce(assigned_at, created_at)
 where status in ('completed', 'cancelled');

create or replace function public.trips_set_finished_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status not in ('completed', 'cancelled') then
    new.finished_at := null;
  elsif tg_op = 'INSERT' or old.status not in ('completed', 'cancelled') then
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end;
$$;

revoke all on function public.trips_set_finished_at() from public, anon, authenticated;

create trigger trips_set_finished_at
  before insert or update of status on public.trips
  for each row execute function public.trips_set_finished_at();

-- ---------------------------------------------------------------------------------------------
-- Solicitud pública: rechaza caracteres invisibles y limita por teléfono normalizado a dígitos.
-- ---------------------------------------------------------------------------------------------
create index trips_active_phone_digits_idx on public.trips
  (regexp_replace(customer_phone, '[^0-9]', '', 'g'), created_at)
  where status not in ('completed', 'cancelled');

create or replace function public.request_trip(
  p_name text, p_phone text, p_pickup text, p_dropoff text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Mismo conjunto que UNSAFE_TEXT_RE en src/domain/clientTrip.ts: controles C0/C1, guion suave y
  -- marcas de formato (ancho cero, bidi, BOM).
  c_unsafe constant text :=
    '[\x01-\x1f\x7f-\x9f­؜᠎​-‏ -‮⁠-⁯﻿]';
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_pickup text := btrim(coalesce(p_pickup, ''));
  v_dropoff text := btrim(coalesce(p_dropoff, ''));
  v_digits text;
  v_active int;
  v_trip_id uuid;
  v_token uuid;
begin
  if v_name = '' or v_phone = '' or v_pickup = '' or v_dropoff = ''
     or char_length(v_name) > 80
     or char_length(v_phone) > 20
     or char_length(v_pickup) > 200
     or char_length(v_dropoff) > 200
     or v_phone !~ '^[0-9+()./ -]+$'
     or v_phone !~ '[0-9]'
     or v_name ~ c_unsafe
     or v_pickup ~ c_unsafe
     or v_dropoff ~ c_unsafe then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');

  -- Serializa por teléfono: sin esto, peticiones simultáneas contarían lo mismo y pasarían todas.
  perform pg_advisory_xact_lock(hashtext(v_digits));

  -- Solo lo reciente: un pedido olvidado no bloquea el teléfono para siempre.
  select count(*) into v_active from public.trips
   where regexp_replace(customer_phone, '[^0-9]', '', 'g') = v_digits
     and status not in ('completed', 'cancelled')
     and created_at > now() - interval '2 hours';
  if v_active >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many_requests');
  end if;

  insert into public.trips (source, customer_name, customer_phone, pickup_address, dropoff_address, status)
  values ('client_app', v_name, v_phone, v_pickup, v_dropoff, 'pending')
  returning id into v_trip_id;

  insert into public.trip_tracking (trip_id) values (v_trip_id)
  returning token into v_token;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Seguimiento: el enlace deja de mostrar datos 12 horas después de terminar el viaje.
-- ---------------------------------------------------------------------------------------------
create or replace function public.get_trip_status(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_driver public.drivers;
  v_result jsonb;
begin
  if p_token is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select t.* into v_trip
    from public.trip_tracking k
    join public.trips t on t.id = k.trip_id
   where k.token = p_token;
  if not found or v_trip.finished_at < now() - interval '12 hours' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'status', v_trip.status,
    'pickup_address', v_trip.pickup_address,
    'dropoff_address', v_trip.dropoff_address,
    'created_at', v_trip.created_at
  );

  if v_trip.driver_id is not null and v_trip.status in ('assigned', 'en_route', 'on_board', 'completed') then
    select * into v_driver from public.drivers where id = v_trip.driver_id;
    if found then
      v_result := v_result || jsonb_build_object(
        'driver_first_name', split_part(btrim(v_driver.name), ' ', 1),
        'taxi_number', v_driver.taxi_number
      );
    end if;
  end if;
  return v_result;
end;
$$;

revoke all on function public.request_trip(text, text, text, text) from public;
revoke all on function public.get_trip_status(uuid) from public;
grant execute on function public.request_trip(text, text, text, text) to anon, authenticated;
grant execute on function public.get_trip_status(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Avance del taxista: exige el estado que estaba viendo, para que un doble toque o una pantalla
-- atrasada no se salte un paso. Mismo orden de bloqueo que assign_trip (viaje, luego taxista).
-- ---------------------------------------------------------------------------------------------
drop function public.driver_advance_trip(uuid);

create function public.driver_advance_trip(p_trip_id uuid, p_expected_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_trip public.trips;
  v_next text;
begin
  select id into v_driver_id from public.drivers where user_id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'driver_not_found');
  end if;

  select * into v_trip from public.trips
   where id = p_trip_id and driver_id = v_driver_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'trip_not_found');
  end if;

  if v_trip.status is distinct from p_expected_status then
    return jsonb_build_object('ok', false, 'error', 'not_advanceable');
  end if;

  v_next := case v_trip.status
    when 'assigned' then 'en_route'
    when 'en_route' then 'on_board'
    when 'on_board' then 'completed'
  end;
  if v_next is null then
    return jsonb_build_object('ok', false, 'error', 'not_advanceable');
  end if;

  update public.trips set status = v_next where id = p_trip_id returning * into v_trip;

  if v_next = 'completed' then
    update public.drivers set status = 'free' where id = v_driver_id;
  end if;

  -- Columnas explícitas: lo que se añada a trips no llega al taxista por accidente.
  return jsonb_build_object('ok', true, 'trip', jsonb_build_object(
    'id', v_trip.id,
    'source', v_trip.source,
    'customer_name', v_trip.customer_name,
    'customer_phone', v_trip.customer_phone,
    'pickup_address', v_trip.pickup_address,
    'pickup_lat', v_trip.pickup_lat,
    'pickup_lng', v_trip.pickup_lng,
    'dropoff_address', v_trip.dropoff_address,
    'status', v_trip.status,
    'driver_id', v_trip.driver_id,
    'created_at', v_trip.created_at,
    'assigned_at', v_trip.assigned_at
  ));
end;
$$;

revoke all on function public.driver_advance_trip(uuid, text) from public, anon;
grant execute on function public.driver_advance_trip(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Cancelación por el admin. security invoker: un no admin no ve la fila (la política de update se
-- aplica a FOR UPDATE) y recibe trip_not_found. Orden de bloqueo fijo: viaje, luego taxista.
-- ---------------------------------------------------------------------------------------------
create function public.cancel_trip(p_trip_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_trip public.trips;
begin
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'trip_not_found');
  end if;
  if v_trip.status not in ('pending', 'assigned', 'en_route', 'on_board') then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable');
  end if;

  if v_trip.driver_id is not null then
    perform 1 from public.drivers where id = v_trip.driver_id for update;
    update public.drivers set status = 'free'
     where id = v_trip.driver_id and status = 'busy';
  end if;

  update public.trips set status = 'cancelled' where id = p_trip_id returning * into v_trip;

  return jsonb_build_object('ok', true, 'trip', to_jsonb(v_trip));
end;
$$;

revoke all on function public.cancel_trip(uuid) from public, anon;
grant execute on function public.cancel_trip(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Privilegios: anon solo llega a los datos por RPC; nadie necesita truncar ni crear triggers desde
-- la API. Las escrituras del admin siguen pasando por RLS con los grants de `authenticated`.
-- ---------------------------------------------------------------------------------------------
revoke insert, update, delete, truncate, trigger, references
  on public.trips, public.drivers from anon;
revoke truncate, trigger on public.trips, public.drivers from authenticated;
