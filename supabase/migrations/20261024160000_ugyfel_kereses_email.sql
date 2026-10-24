create or replace function public.list_customers(p_q text default '', p_limit integer default 100)
returns setof public.v_customer_summary
language sql
stable
as $$
  with k as (
    select coalesce(trim(p_q), '') as nyers,
           public.ekezettelen(coalesce(trim(p_q), '')) as szoveg,
           case when coalesce(p_q, '') !~ '[[:alpha:]]'
                 and length(regexp_replace(coalesce(p_q, ''), '[^0-9]', '', 'g')) >= 3
                then public.phone_norm(p_q) end as tel,
           upper(regexp_replace(coalesce(p_q, ''), '[^A-Za-z0-9]', '', 'g')) as rendszam
  )
  select s.* from public.v_customer_summary s, k
   where k.nyers = ''
      or public.ekezettelen(s.name)         like '%' || k.szoveg || '%'
      or public.ekezettelen(s.company_name) like '%' || k.szoveg || '%'
      or ((k.nyers like '%@%' or length(k.szoveg) >= 3) and public.ekezettelen(s.email) like '%' || k.szoveg || '%')
      or (k.tel is not null and public.phone_norm(s.phone) like '%' || k.tel || '%')
      or (length(k.rendszam) >= 2 and exists (
        select 1 from public.vehicles v
         where v.customer_id = s.id
           and v.plate_normalized like '%' || k.rendszam || '%'))
   order by
     case when k.nyers <> '' and (public.ekezettelen(s.name) like k.szoveg || '%'
                                  or public.ekezettelen(s.company_name) like k.szoveg || '%') then 0 else 1 end,
     s.utolso desc nulls last, s.name
   limit greatest(coalesce(p_limit, 100), 1);
$$;
