create or replace function public.add_customer(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nev      text := trim(coalesce(p->>'name',''));
  v_tel      text := trim(coalesce(p->>'phone',''));
  v_email    text := nullif(trim(coalesce(p->>'email','')), '');
  v_ceg      text := nullif(trim(coalesce(p->>'company_name','')), '');
  v_rendszam text := trim(coalesce(p->>'plate_raw',''));
  v_barmely  boolean := coalesce((p->>'barmelyik')::boolean, false);
  v_id       uuid;
  v_regi     text;
  v_gazda    text;
begin
  if not public.can_edit_customers() then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.' using errcode = '42501';
  end if;

  if v_barmely then
    if v_nev = '' and v_tel = '' and v_email is null and v_ceg is null and v_rendszam = '' then
      raise exception 'Legalább egy adatot adj meg az ügyfélről.';
    end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Az e-mail cím formátuma nem jó.';
    end if;
    if v_rendszam <> '' then
      select c.name into v_gazda
        from public.vehicles v join public.customers c on c.id = v.customer_id
       where v.plate_normalized = upper(regexp_replace(v_rendszam, '[^A-Za-z0-9]', '', 'g'))
       limit 1;
      if v_gazda is not null then
        raise exception 'Ez a rendszám már % ügyfélhez tartozik. Keresd meg a listában.', v_gazda;
      end if;
    end if;
    v_nev := coalesce(nullif(v_nev, ''), v_ceg, 'Névtelen');
    v_tel := coalesce(nullif(v_tel, ''), '—');
  else
    if v_nev = '' then raise exception 'A név nem maradhat üresen.'; end if;
    if v_tel = '' then raise exception 'A telefonszám nem maradhat üresen.'; end if;
  end if;

  if v_tel <> '—' then
    select c.name into v_regi
      from public.customers c
     where public.phone_norm(c.phone) = public.phone_norm(v_tel)
     limit 1;
  end if;

  if v_regi is not null and coalesce((p->>'megis')::boolean, false) is not true then
    raise exception 'Ezzel a telefonszámmal már van ügyfél: %', v_regi
      using hint = 'Ha tényleg két külön ügyfélről van szó, vedd fel mégis.';
  end if;

  insert into public.customers (name, phone, email, type, company_name, tax_number,
                                notes, internal_notes)
  values (v_nev, v_tel, v_email,
          coalesce(nullif(p->>'type','')::customer_type, case when v_barmely and v_ceg is not null then 'CEG' else 'MAGAN' end::customer_type),
          v_ceg,
          nullif(trim(p->>'tax_number'),''),
          nullif(trim(p->>'notes'),''),
          nullif(trim(p->>'internal_notes'),''))
  returning id into v_id;

  if v_barmely and v_rendszam <> '' then
    insert into public.vehicles (customer_id, plate_raw, plate_country, category)
    values (v_id, v_rendszam, 'HU', 'SZEMELYAUTO');
  end if;

  return v_id;
end;
$$;
revoke all on function public.add_customer(jsonb) from public, anon;
grant execute on function public.add_customer(jsonb) to authenticated;
