alter table public.shop_settings
  add column if not exists arculat text
    check (arculat in ('01', '02', '03', '04', '05', '06', '07', '08')),
  add column if not exists arculat_mod text
    check (arculat_mod in ('VILAGOS', 'SOTET'));

create or replace function public.arculat_valasztas(p_kod text, p_mod text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Az arculatot csak a tulajdonos választhatja ki.' using errcode = '42501';
  end if;
  update public.shop_settings
     set arculat = p_kod,
         arculat_mod = coalesce(p_mod, 'VILAGOS'),
         updated_at = now();
end;
$$;

revoke all on function public.arculat_valasztas(text, text) from public, anon;
grant execute on function public.arculat_valasztas(text, text) to authenticated;
