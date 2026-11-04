-- App del taxista: vínculo con auth.users, lectura de lo propio y acciones vía RPC.
-- Los taxistas no reciben insert/update directos: toda escritura pasa por estas funciones.

alter table public.drivers
  add column user_id uuid unique references auth.users (id) on delete set null;

create policy drivers_driver_select_own on public.drivers
  for select to authenticated
  using (user_id = auth.uid());

create policy trips_driver_select_own on public.trips
  for select to authenticated
  using (driver_id in (select d.id from public.drivers d where d.user_id = auth.uid()));

create or replace function public.driver_report_location(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- coalesce: rechaza NULL. NaN e infinito quedan fuera de between en Postgres.
  if not coalesce(p_lat between -90 and 90 and p_lng between -180 and 180, false) then
    return jsonb_build_object('ok', false, 'error', 'invalid_coordinates');
  end if;

  update public.drivers
     set lat = p_lat, lng = p_lng, last_seen_at = now()
   where user_id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'driver_not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- Bloquea primero al taxista: se serializa con assign_trip, que también lo bloquea antes de
-- asignar, de modo que nadie queda desconectado con un viaje recién asignado.
create or replace function public.driver_set_online(p_online boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_has_active boolean;
  v_status text;
begin
  if p_online is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;

  select id into v_driver_id from public.drivers where user_id = auth.uid() for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'driver_not_found');
  end if;

  select exists (
    select 1 from public.trips
     where driver_id = v_driver_id and status in ('assigned', 'en_route', 'on_board')
  ) into v_has_active;

  if not p_online and v_has_active then
    return jsonb_build_object('ok', false, 'error', 'active_trip');
  end if;

  v_status := case when not p_online then 'offline' when v_has_active then 'busy' else 'free' end;
  update public.drivers set status = v_status where id = v_driver_id;

  return jsonb_build_object('ok', true, 'status', v_status);
end;
$$;

-- Mismo orden de bloqueo que assign_trip (viaje, luego taxista).
create or replace function public.driver_advance_trip(p_trip_id uuid)
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

  return jsonb_build_object('ok', true, 'trip', to_jsonb(v_trip));
end;
$$;

revoke all on function public.driver_report_location(double precision, double precision) from public, anon;
revoke all on function public.driver_set_online(boolean) from public, anon;
revoke all on function public.driver_advance_trip(uuid) from public, anon;
grant execute on function public.driver_report_location(double precision, double precision) to authenticated;
grant execute on function public.driver_set_online(boolean) to authenticated;
grant execute on function public.driver_advance_trip(uuid) to authenticated;
