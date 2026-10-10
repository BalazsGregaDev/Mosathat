alter type booking_item_kind add value if not exists 'FUVAR';

do $$ begin
  if not exists (select 1 from pg_type where typname = 'contract_kind') then
    create type contract_kind as enum ('FLOTTA', 'SAJAT');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'absence_kind') then
    create type absence_kind as enum (
      'KESOBB_ERKEZIK',
      'KORABBAN_TAVOZIK',
      'TAVOL',
      'EGESZ_NAP'
    );
  end if;
end $$;
