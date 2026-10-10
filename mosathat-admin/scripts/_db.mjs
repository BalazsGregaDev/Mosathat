import { PGlite } from '@electric-sql/pglite'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIG = join(GYOKER, 'supabase', 'migrations')

export const FEJL = '00000000-0000-4000-8000-000000000001'
export const TULAJ = '00000000-0000-4000-8000-000000000002'
export const ALK = '00000000-0000-4000-8000-000000000003'

export async function adatbazis({ demo = false, belepok = true, elotte = '' } = {}) {
  const db = await PGlite.create()
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, email character varying(255),
      last_sign_in_at timestamptz, encrypted_password text, updated_at timestamptz);
    create or replace function auth.uid() returns uuid
      language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    create or replace function auth.role() returns text
      language sql stable as $$ select 'authenticated'::text $$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end $$;
    create schema if not exists extensions;
    create or replace function extensions.gen_salt(a text, b int) returns text
      language sql immutable as $$ select '$2a$' || b || '$t' $$;
    create or replace function extensions.crypt(pw text, salt text) returns text
      language sql immutable as $$ select salt || md5(pw) $$;
  `)
  if (elotte) await db.exec(elotte)
  for (const f of (await readdir(MIG)).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(await readFile(join(MIG, f), 'utf8'))
    } catch (e) {
      throw new Error(`${f}: ${e.message}`, { cause: e })
    }
  }
  if (belepok) {
    await db.exec(`
      insert into auth.users (id,email) values
        ('${FEJL}','fejleszto@x.hu'), ('${TULAJ}','tulaj@x.hu'), ('${ALK}','alkalmazott@x.hu');
      insert into staff (id, full_name, role, active) values
        ('${FEJL}','Fejlesztő','SUPERADMIN',true),
        ('${TULAJ}','Tulajdonos','TULAJDONOS',true),
        ('${ALK}','Gábor','STAFF',true);
      select set_config('app.uid','${TULAJ}',false);
    `)
  }
  if (demo) {
    await db.exec(await readFile(join(GYOKER, 'supabase', 'demo', 'demo_adatok.sql'), 'utf8'))
  }
  return db
}

export function tesztelo() {
  let hiba = 0
  return {
    ok(mit, varjuk, kaptuk) {
      const jo = JSON.stringify(varjuk) === JSON.stringify(kaptuk)
      if (!jo) hiba++
      console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(kaptuk)} (várt: ${JSON.stringify(varjuk)})`}`)
    },
    get hiba() { return hiba },
    vege() {
      console.log(`\n${hiba === 0 ? 'Minden rendben.' : `${hiba} hiba.`}`)
      process.exit(hiba === 0 ? 0 : 1)
    },
  }
}
