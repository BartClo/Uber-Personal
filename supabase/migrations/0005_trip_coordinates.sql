-- Coordenadas opcionales del origen en la solicitud pública (autocompletado de direcciones).
-- Reemplaza la firma de 4 argumentos: dejar ambas habría permitido llamar a cualquiera de las dos.

drop function public.request_trip(text, text, text, text);

create function public.request_trip(
  p_name text, p_phone text, p_pickup text, p_dropoff text,
  p_pickup_lat double precision default null,
  p_pickup_lng double precision default null
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

  -- Coordenadas del origen: ambas o ninguna, y dentro de rango (NaN e infinito no pasan el between).
  if (p_pickup_lat is null) <> (p_pickup_lng is null)
     or p_pickup_lat not between -90 and 90
     or p_pickup_lng not between -180 and 180 then
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

  insert into public.trips (source, customer_name, customer_phone, pickup_address, pickup_lat, pickup_lng, dropoff_address, status)
  values ('client_app', v_name, v_phone, v_pickup, p_pickup_lat, p_pickup_lng, v_dropoff, 'pending')
  returning id into v_trip_id;

  insert into public.trip_tracking (trip_id) values (v_trip_id)
  returning token into v_token;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

revoke all on function public.request_trip(text, text, text, text, double precision, double precision) from public;
grant execute on function public.request_trip(text, text, text, text, double precision, double precision) to anon, authenticated;
