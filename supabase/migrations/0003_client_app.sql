-- App del cliente: solicitud pública de viaje y seguimiento por token.
-- Los anónimos NO tienen acceso directo a tablas (RLS); solo estas funciones.

alter table public.trips
  add column tracking_token uuid not null default gen_random_uuid();
alter table public.trips
  add constraint trips_tracking_token_key unique (tracking_token);

create or replace function public.request_trip(
  p_name text, p_phone text, p_pickup text, p_dropoff text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_pickup text := btrim(coalesce(p_pickup, ''));
  v_dropoff text := btrim(coalesce(p_dropoff, ''));
  v_active int;
  v_token uuid;
begin
  if v_name = '' or v_phone = '' or v_pickup = '' or v_dropoff = ''
     or char_length(v_name) > 80
     or char_length(v_phone) > 20
     or char_length(v_pickup) > 200
     or char_length(v_dropoff) > 200
     or v_phone !~ '^[0-9+()./ -]+$'
     or v_phone !~ '[0-9]' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  select count(*) into v_active from public.trips
   where customer_phone = v_phone and status not in ('completed', 'cancelled');
  if v_active >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many_requests');
  end if;

  insert into public.trips (source, customer_name, customer_phone, pickup_address, dropoff_address, status)
  values ('client_app', v_name, v_phone, v_pickup, v_dropoff, 'pending')
  returning tracking_token into v_token;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

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
  select * into v_trip from public.trips where tracking_token = p_token;
  if not found then
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
