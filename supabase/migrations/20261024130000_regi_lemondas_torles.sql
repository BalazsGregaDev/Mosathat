create or replace function public.lemondas_ertekel(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status   booking_status;
  v_kezdes   timestamptz;
  v_ora      integer;
  v_hatarido timestamptz;
  v_allapot  text;
  v_valtozas timestamptz;
begin
  select b.status, b.updated_at,
         coalesce(b.start_at, b.drop_off_at,
                  (b.service_date::timestamp at time zone 'Europe/Budapest'))
    into v_status, v_valtozas, v_kezdes
    from public.bookings b
   where b.id = p_booking;

  if v_status is null then
    return jsonb_build_object('allapot', 'ISMERETLEN');
  end if;

  select coalesce((select s.online_lemondas_ora from public.shop_settings s limit 1), 24) into v_ora;
  v_hatarido := v_kezdes - make_interval(hours => v_ora);

  v_allapot := case
    when v_status = 'CANCELLED_BY_CUSTOMER'          then 'LEMONDVA'
    when v_status not in ('REQUESTED', 'CONFIRMED')  then 'NEM_LEMONDHATO'
    when now() > v_hatarido                          then 'LEJART'
    else 'LEMONDHATO'
  end;

  return jsonb_build_object(
    'allapot',      v_allapot,
    'statusz',      v_status,
    'kezdes',       v_kezdes,
    'hatarido',     v_hatarido,
    'lemondas_ora', v_ora,
    'lemondva',     case when v_status = 'CANCELLED_BY_CUSTOMER' then v_valtozas end,
    'foglalas',     public.foglalas_osszegzes(p_booking));
end;
$$;
revoke all on function public.lemondas_ertekel(uuid) from public, anon, authenticated;

drop function if exists public.lemondas_vegrehajt(text);
drop function if exists public.lemondas_allapot(text);
drop function if exists public.lemondo_link_mentes(uuid, text);
drop function if exists public.lemondo_token_hash(text);
drop table if exists public.cancel_tokens;
