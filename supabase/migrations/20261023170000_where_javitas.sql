create or replace function public.gyik_beallitas(p_mod text, p_max integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'A gyakori kérdéseket csak a tulajdonos és a fejlesztő kezelheti.' using errcode = '42501';
  end if;
  if p_mod not in ('VALOGATOTT', 'VELETLEN') then
    raise exception 'Ismeretlen megjelenítési mód.';
  end if;
  if p_max is null or p_max < 1 or p_max > 20 then
    raise exception 'A főoldalon 1 és 20 közötti számú kérdés jelenhet meg.';
  end if;
  insert into public.publikus_adatok (id) values (true) on conflict (id) do nothing;
  update public.publikus_adatok set gyik_mod = p_mod, gyik_max = p_max, updated_at = now() where id;
end;
$$;

create or replace function public.publikus_tartalom_mentes(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_adat  jsonb := p->'adatok';
  v_kam   jsonb := p->'kamerak';
  v_nyelv text;
  v_szov  jsonb;
  v_kulcs text;
  v_ertek jsonb;
  v_sor   jsonb;
  v_n     integer := 0;
  v_email text;
  v_google text;
begin
  if not public.is_owner() then
    raise exception 'A publikus oldal tartalmát csak a tulajdonos és a fejlesztő módosíthatja.' using errcode = '42501';
  end if;

  if v_adat is not null and jsonb_typeof(v_adat) = 'object' then
    v_email := nullif(btrim(coalesce(v_adat->>'email', '')), '');
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Az e-mail cím formátuma nem megfelelő.';
    end if;
    v_google := nullif(btrim(coalesce(v_adat->>'google_ertekeles', '')), '');
    if v_google is not null and v_google !~ '^https://[^\s]+$' then
      raise exception 'A Google-értékelés linkjének https:// kezdetűnek kell lennie, szóköz nélkül.';
    end if;
    update public.publikus_adatok set
      nev                = case when v_adat ? 'nev'                then nullif(btrim(v_adat->>'nev'), '')                else nev end,
      telefon            = case when v_adat ? 'telefon'            then nullif(btrim(v_adat->>'telefon'), '')            else telefon end,
      email              = case when v_adat ? 'email'              then v_email                                          else email end,
      irsz               = case when v_adat ? 'irsz'               then nullif(btrim(v_adat->>'irsz'), '')               else irsz end,
      cim                = case when v_adat ? 'cim'                then nullif(btrim(v_adat->>'cim'), '')                else cim end,
      haz                = case when v_adat ? 'haz'                then nullif(btrim(v_adat->>'haz'), '')                else haz end,
      szint              = case when v_adat ? 'szint'              then nullif(btrim(v_adat->>'szint'), '')              else szint end,
      bejarat            = case when v_adat ? 'bejarat'            then nullif(btrim(v_adat->>'bejarat'), '')            else bejarat end,
      kerulet            = case when v_adat ? 'kerulet'            then nullif(btrim(v_adat->>'kerulet'), '')            else kerulet end,
      szint_en           = case when v_adat ? 'szint_en'           then nullif(btrim(v_adat->>'szint_en'), '')           else szint_en end,
      bejarat_en         = case when v_adat ? 'bejarat_en'         then nullif(btrim(v_adat->>'bejarat_en'), '')         else bejarat_en end,
      kerulet_en         = case when v_adat ? 'kerulet_en'         then nullif(btrim(v_adat->>'kerulet_en'), '')         else kerulet_en end,
      google_ertekeles   = case when v_adat ? 'google_ertekeles'   then v_google                                         else google_ertekeles end,
      ceg_nev            = case when v_adat ? 'ceg_nev'            then nullif(btrim(v_adat->>'ceg_nev'), '')            else ceg_nev end,
      ceg_rovid_nev      = case when v_adat ? 'ceg_rovid_nev'      then nullif(btrim(v_adat->>'ceg_rovid_nev'), '')      else ceg_rovid_nev end,
      ceg_szekhely       = case when v_adat ? 'ceg_szekhely'       then nullif(btrim(v_adat->>'ceg_szekhely'), '')       else ceg_szekhely end,
      ceg_cegjegyzekszam = case when v_adat ? 'ceg_cegjegyzekszam' then nullif(btrim(v_adat->>'ceg_cegjegyzekszam'), '') else ceg_cegjegyzekszam end,
      ceg_cegbirosag     = case when v_adat ? 'ceg_cegbirosag'     then nullif(btrim(v_adat->>'ceg_cegbirosag'), '')     else ceg_cegbirosag end,
      ceg_adoszam        = case when v_adat ? 'ceg_adoszam'        then nullif(btrim(v_adat->>'ceg_adoszam'), '')        else ceg_adoszam end,
      jogi_hataly        = case when v_adat ? 'jogi_hataly'        then nullif(btrim(v_adat->>'jogi_hataly'), '')        else jogi_hataly end,
      jogi_tervezet      = case when v_adat ? 'jogi_tervezet'      then (v_adat->>'jogi_tervezet')::boolean              else jogi_tervezet end,
      konyvelo_nev       = case when v_adat ? 'konyvelo_nev'       then nullif(btrim(v_adat->>'konyvelo_nev'), '')       else konyvelo_nev end,
      konyvelo_cim       = case when v_adat ? 'konyvelo_cim'       then nullif(btrim(v_adat->>'konyvelo_cim'), '')       else konyvelo_cim end,
      kamera_megorzes    = case when v_adat ? 'kamera_megorzes'    then nullif(btrim(v_adat->>'kamera_megorzes'), '')    else kamera_megorzes end,
      kamera_megorzes_en = case when v_adat ? 'kamera_megorzes_en' then nullif(btrim(v_adat->>'kamera_megorzes_en'), '') else kamera_megorzes_en end,
      updated_at         = now()
    where id;
  end if;

  foreach v_nyelv in array array['hu', 'en'] loop
    v_szov := p->(case v_nyelv when 'hu' then 'szovegek' else 'szovegek_en' end);
    if v_szov is not null and jsonb_typeof(v_szov) = 'object' then
      for v_kulcs, v_ertek in select * from jsonb_each(v_szov) loop
        if v_kulcs !~ '^[a-z0-9_.]{1,80}$' then
          raise exception 'Érvénytelen szövegkulcs: %', left(v_kulcs, 80);
        end if;
        if v_ertek is null or jsonb_typeof(v_ertek) = 'null' or btrim(v_ertek #>> '{}') = '' then
          delete from public.publikus_szovegek where kulcs = v_kulcs and nyelv = v_nyelv;
        else
          if char_length(v_ertek #>> '{}') > 4000 then
            raise exception 'Egy szöveg legfeljebb 4000 karakter lehet.';
          end if;
          insert into public.publikus_szovegek (kulcs, nyelv, ertek) values (v_kulcs, v_nyelv, v_ertek #>> '{}')
          on conflict (kulcs, nyelv) do update set ertek = excluded.ertek, updated_at = now();
        end if;
      end loop;
    end if;
  end loop;

  if v_kam is not null and jsonb_typeof(v_kam) = 'array' then
    if jsonb_array_length(v_kam) > 30 then
      raise exception 'Legfeljebb 30 kamera vehető fel.';
    end if;
    delete from public.publikus_kamerak where true;
    for v_sor in select * from jsonb_array_elements(v_kam) loop
      if nullif(btrim(coalesce(v_sor->>'hely', '')), '') is null or nullif(btrim(coalesce(v_sor->>'terulet', '')), '') is null then
        raise exception 'Minden kameránál add meg a helyét és azt, hogy mit lát.';
      end if;
      insert into public.publikus_kamerak (hely, terulet, hely_en, terulet_en, sort_order)
      values (btrim(v_sor->>'hely'), btrim(v_sor->>'terulet'),
              nullif(btrim(coalesce(v_sor->>'hely_en', '')), ''), nullif(btrim(coalesce(v_sor->>'terulet_en', '')), ''), v_n);
      v_n := v_n + 1;
    end loop;
  end if;
end;
$$;

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
         updated_at = now()
   where id;
end;
$$;
