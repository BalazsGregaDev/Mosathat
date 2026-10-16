create or replace function public.publikus_oldal()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'arculat',     (select s.arculat from public.shop_settings s limit 1),
    'arculat_mod', (select s.arculat_mod from public.shop_settings s limit 1),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description,
               'includes_package_id', p.includes_package_id, 'sort_order', p.sort_order, 'active', p.active)
             order by p.sort_order)
        from public.packages p
       where p.active), '[]'::jsonb),
    'packagePricing', coalesce((
      select jsonb_agg(jsonb_build_object(
               'package_id', pp.package_id, 'category', pp.category, 'scope', pp.scope,
               'price_huf', pp.price_huf, 'duration_minutes', pp.duration_minutes,
               'requires_quote', pp.requires_quote))
        from public.package_pricing pp
        join public.packages p on p.id = pp.package_id and p.active), '[]'::jsonb),
    'packageItems', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.area, m.sort_order, m.package_sort)
        from public.v_package_matrix m), '[]'::jsonb),
    'packageExtras', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.area, x.sort_order)
        from public.v_package_extra x), '[]'::jsonb));
$$;

revoke all on function public.publikus_oldal() from public;
grant execute on function public.publikus_oldal() to anon, authenticated;
