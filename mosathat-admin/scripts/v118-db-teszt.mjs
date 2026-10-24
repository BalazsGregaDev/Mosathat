import { adatbazis, tesztelo, ALK, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
const egy = async (s, p) => (await q(s, p))[0]
const ki = (id) => q(`select set_config('app.uid', $1, false)`, [id ?? ''])
const hiba = async (f) => { try { await f(); return null } catch (e) { return e.message } }
async function anonkent(f) {
  await ki('')
  await db.exec('set role anon')
  try { return await f() } finally { await db.exec('reset role') }
}

const ceg = await egy(`select id, name from companies where name = 'Autó Trans Kft.'`)
const kov = await egy(`select id from customers where name = 'Kovács Péter'`)
const cegAdat = (k) => anonkent(async () => (await egy(`select ceg_link_adat($1) x`, [k])).x)
const berletAdat = (k) => anonkent(async () => (await egy(`select berlet_link_adat($1) x`, [k])).x)

console.log('=== 1) A cím tisztítása ===\n')
const norm = async (s) => (await egy(`select link_cim_norm($1) x`, [s])).x
t.ok('ékezet, nagybetű, szóköz és írásjel', 'auto-trans-kft-gyor', await norm('  Autó Trans Kft. – Győr  '))
t.ok('a széleken nincs kötőjel, középen egy', 'ab-cd', await norm('--ab---cd--'))
t.ok('legfeljebb 64 karakter', 64, (await norm('a'.repeat(80))).length)

console.log('\n=== 2) Céges link: egyedi cím ===\n')
await ki(ALK)
t.ok('alkalmazott nem írhatja át', true, /jogosults/.test(await hiba(() => q(`select ceg_link_cim($1, 'proba')`, [ceg.id])) ?? ''))
await ki(TULAJ)
const regi = (await egy(`select token from company_booking_links where company_id = $1`, [ceg.id])).token
const uj = (await egy(`select ceg_link_cim($1, $2) k`, [ceg.id, 'Autó Trans'])).k
t.ok('a tisztított cím mentve', 'auto-trans', uj)
t.ok('az új címmel nyílik', ceg.name, (await cegAdat('auto-trans'))?.ceg)
t.ok('nagybetűvel beírva is nyílik', ceg.name, (await cegAdat('Auto-Trans'))?.ceg)
t.ok('a régi link megszűnt', null, await cegAdat(regi))
await ki(TULAJ)
t.ok('napló: link_atirva, előtte és utána', ['link_atirva', regi, 'auto-trans'],
  Object.values(await egy(`select action, before->>'token' b, after->>'token' a from audit_log
    where entity = 'company_booking_links' and entity_id = $1 order by id desc limit 1`, [ceg.id])))
t.ok('ugyanazt újra mentve nincs hiba', 'auto-trans', (await egy(`select ceg_link_cim($1, 'auto-trans') k`, [ceg.id])).k)
t.ok('túl rövid cím: hiba', true, /legalább 3 karakter/.test(await hiba(() => q(`select ceg_link_cim($1, 'a!')`, [ceg.id])) ?? ''))
const masik = await egy(`insert into companies (name) values ('Másik Kft.') returning id`)
await q(`insert into company_booking_links (company_id, token) values ($1, 'foglalt-cim')
  on conflict (company_id) do update set token = excluded.token`, [masik.id])
t.ok('foglalt cím: hiba', true, /már egy másik cég/.test(await hiba(() => q(`select ceg_link_cim($1, 'Foglalt cím')`, [ceg.id])) ?? ''))
const veletlen = (await egy(`select ceg_link_uj($1) k`, [ceg.id])).k
t.ok('a véletlen link továbbra is 24 karakter, és működik', [true, ceg.name], [/^[a-z0-9]{24}$/.test(veletlen), (await cegAdat(veletlen))?.ceg])
t.ok('az egyedi cím ezzel megszűnt', null, await cegAdat('auto-trans'))

console.log('\n=== 3) Bérletes link: egyedi cím ===\n')
await ki(TULAJ)
await q(`select set_role_permission($1::jsonb)`, [JSON.stringify({ role: 'STAFF', can_edit_customers: false })])
await ki(ALK)
t.ok('ügyfélszerkesztési jog nélkül nem írhatja át', true, /jogosults/.test(await hiba(() => q(`select berlet_link_cim($1, 'kovacs-peter')`, [kov.id])) ?? ''))
await ki(TULAJ)
const bUj = (await egy(`select berlet_link_cim($1, $2) k`, [kov.id, 'Kovács Péter'])).k
t.ok('a tisztított cím mentve', 'kovacs-peter', bUj)
t.ok('az új címmel nyílik a bérletes oldal', 'Kovács Péter', (await berletAdat('kovacs-peter'))?.nev)
t.ok('a régi demó link megszűnt', null, await berletAdat('berletdemo2026kovacspeter'))
const nincs = await egy(`select c.id from customers c where not berlet_aktiv(c.id) limit 1`)
await ki(TULAJ)
t.ok('érvényes bérlet nélkül nem készül', true, /nincs érvényes bérlete/.test(await hiba(() => q(`select berlet_link_cim($1, 'valaki-mas')`, [nincs.id])) ?? ''))

console.log('\n=== 4) Jogosultság ===\n')
t.ok('a két új függvény kívülről nem hívható', [false, false],
  [(await egy(`select has_function_privilege('anon', 'public.ceg_link_cim(uuid, text)', 'EXECUTE') a`)).a,
   (await egy(`select has_function_privilege('anon', 'public.berlet_link_cim(uuid, text)', 'EXECUTE') a`)).a])
t.ok('rossz alakú kód: nincs adat', [null, null], [await cegAdat("x' or 1=1"), await berletAdat('-a-')])

t.vege()
