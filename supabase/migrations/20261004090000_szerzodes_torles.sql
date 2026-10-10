create or replace function public.delete_contract(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ceg uuid;
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;

  delete from public.contracts where id = p_id
  returning company_id into v_ceg;

  if not found then
    raise exception 'Nincs ilyen szerződés.';
  end if;

  if v_ceg is not null then
    perform public.ceg_szamlazas_frissit(v_ceg);
  end if;
end;
$$;

grant execute on function public.delete_contract(uuid) to authenticated;
