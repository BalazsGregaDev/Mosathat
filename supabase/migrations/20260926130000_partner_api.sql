-- =============================================================================
--  20260926130000_partner_api.sql — amit a Cégek és bérletesek képernyő hív
-- =============================================================================

-- A szerződés fej és az árak egyben. A felület egy listát lát, nem két táblát.
create or replace view public.v_contracts
with (security_invoker = on) as
select
  ct.id,
  ct.customer_id,
  c.name         as customer_name,
  c.company_name,
  ct.tax_number,
  ct.pickup_delivery,
  ct.valid_from,
  ct.valid_until,
  ct.active,
  ct.notes,
  coalesce((
    select jsonb_agg(jsonb_build_object('tier', cp.tier, 'size', cp.size, 'price_huf', cp.price_huf)
                     order by cp.tier, cp.size)
      from public.contract_prices cp where cp.contract_id = ct.id
  ), '[]'::jsonb) as prices
from public.contracts ct
join public.customers c on c.id = ct.customer_id;


-- Szerződés mentése: fej és árak egy tranzakcióban.
--
-- Az árakat teljesen újraírjuk, mert a felület a MOSTANI állapotot küldi.
-- Ha egy ár kikerült a listából, az azt jelenti, hogy arra a kombinációra
-- nincs megállapodás — és akkor listaáron megy, nem a régi szerződéses áron.
create or replace function public.save_contract(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_id uuid := nullif(p->>'id','')::uuid;
  r    jsonb;
begin
  if v_id is null then
    insert into public.contracts (customer_id, tax_number, pickup_delivery, valid_until, notes)
    values ((p->>'customer_id')::uuid,
            nullif(p->>'tax_number',''),
            coalesce((p->>'pickup_delivery')::boolean, false),
            nullif(p->>'valid_until','')::date,
            nullif(p->>'notes',''))
    returning id into v_id;
  else
    update public.contracts
       set tax_number      = nullif(p->>'tax_number',''),
           pickup_delivery = coalesce((p->>'pickup_delivery')::boolean, false),
           valid_until     = nullif(p->>'valid_until','')::date,
           notes           = nullif(p->>'notes',''),
           updated_at      = now()
     where id = v_id;
  end if;

  delete from public.contract_prices where contract_id = v_id;

  for r in select * from jsonb_array_elements(coalesce(p->'prices', '[]'::jsonb))
  loop
    -- Az üres mezőt nem mentjük árként: az azt jelenti, nincs rá megállapodás.
    if nullif(r->>'price_huf','') is not null and (r->>'price_huf')::integer > 0 then
      insert into public.contract_prices (contract_id, tier, size, price_huf)
      values (v_id, (r->>'tier')::contract_tier, (r->>'size')::contract_size,
              (r->>'price_huf')::integer);
    end if;
  end loop;

  return v_id;
end;
$$;


-- Bérlet kivezetése. Nem törlés: a felhasznált alkalmak előzménye megmarad.
create or replace function public.deactivate_pass(p_pass_id uuid)
returns void
language sql
volatile
as $$
  update public.passes set active = false, updated_at = now() where id = p_pass_id;
$$;


grant execute on function public.save_contract(jsonb)    to authenticated;
grant execute on function public.deactivate_pass(uuid)   to authenticated;
