import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p = []) => (await db.query(s, p)).rows
const egy = async (s, p = []) => (await q(s, p))[0]
await q(`select set_config('app.uid', $1, false)`, [TULAJ])

const PREMIUM = (await egy(`select id from packages where code = 'PREMIUM'`)).id
const nap = (await egy(
  `select d::date::text d from generate_series(public.budapest_ma() + 4, public.budapest_ma() + 50, interval '1 day') d
    where munkanap(d::date) order by d limit 1`)).d
const alap = {
  category: 'SZEMELYAUTO', scope: 'TELJES', package_id: PREMIUM, full_service: false, extras: [],
  booking_type: 'LEADOS', service_date: nap, start_time: null, drop_off_time: '09:00',
  customer_name: 'Levél Lili', customer_phone: '+36 30 555 0670', customer_email: 'lili@pelda.hu',
  plate_raw: 'LEV-670', brand: 'Skoda', model: 'Octavia', notes: 'Kutyaszőr hátul',
  seat_material: null, next_day_pick_up: false, pick_up_time: null,
}
const kuld = async (x = {}) => (await egy(`select online_foglalas($1::jsonb) as id`, [JSON.stringify({ ...alap, ...x })])).id
const dont = async (id, elfogad) => (await egy(`select online_keres_dontes($1, $2) e`, [id, elfogad])).e
const ertesitesek = async (id) => q(`select kind, to_address, status, attempts from notifications where booking_id = $1`, [id])
const atvesz = async () => (await q(`select ertesitesek_atvetele(10) j`)).map((r) => r.j)

console.log('=== 1) Mikor kerül sorba visszaigazoló e-mail ===\n')
const elso = await kuld()
t.ok('a beküldött kérés még nem kap e-mailt', [], await ertesitesek(elso))
t.ok('elfogadás', 'OK', await dont(elso, true))
t.ok('elfogadáskor egy visszaigazolás kerül sorba az ügyfél címére',
  [{ kind: 'BOOKING_CONFIRMED', to_address: 'lili@pelda.hu', status: 'PENDING', attempts: 0 }], await ertesitesek(elso))

const emailNelkul = await kuld({ plate_raw: 'LEV-671', customer_phone: '+36 30 555 0671', customer_email: null, customer_name: 'Cím Nélkül' })
await dont(emailNelkul, true)
t.ok('e-mail cím nélkül nem kerül sorba semmi', [], await ertesitesek(emailNelkul))

const elutasitott = await kuld({ plate_raw: 'LEV-672', customer_phone: '+36 30 555 0672', customer_email: 'nem@pelda.hu', customer_name: 'Elutasított Ede' })
await dont(elutasitott, false)
t.ok('elutasításnál nem megy visszaigazolás', [], await ertesitesek(elutasitott))

const telefonos = (await egy(`select create_booking($1::jsonb) id`, [JSON.stringify({
  ...alap, plate_raw: 'LEV-673', customer_phone: '+36 30 555 0673', customer_name: 'Telefonos Tamás',
  status: 'CONFIRMED', source: 'TELEFON',
})])).id
await q(`update customers c set email = 'tamas@pelda.hu' from bookings b where b.id = $1 and c.id = b.customer_id`, [telefonos])
await q(`select set_booking_status($1, 'ARRIVED', null, true)`, [telefonos])
await q(`select set_booking_status($1, 'CONFIRMED', null, true)`, [telefonos])
t.ok('telefonos foglalás nem kap e-mailt', [], await ertesitesek(telefonos))

console.log('\n=== 2) A küldési sor ===\n')
const sor = await atvesz()
t.ok('egy e-mail vár küldésre', 1, sor.length)
t.ok('a címzett és a fajta benne van', ['lili@pelda.hu', 'BOOKING_CONFIRMED'], [sor[0].to, sor[0].kind])
t.ok('a foglalás adatai is jönnek', ['LEV-670', 'Premium', 'Levél Lili', 'Kutyaszőr hátul', nap],
  [sor[0].lemondas.foglalas.plate_raw, sor[0].lemondas.foglalas.package_name, sor[0].lemondas.foglalas.customer_name,
   sor[0].lemondas.foglalas.notes, sor[0].lemondas.foglalas.service_date])
t.ok('a lemondási határidő is jön (alapból 24 óra)', 24, sor[0].lemondas.lemondas_ora)
t.ok('átvétel után KÜLDÉS alatt, 1. próbálkozás', [{ kind: 'BOOKING_CONFIRMED', to_address: 'lili@pelda.hu', status: 'SENDING', attempts: 1 }],
  await ertesitesek(elso))
t.ok('amit épp küldenek, azt másodszor nem adja ki', 0, (await atvesz()).length)

await q(`select ertesites_eredmeny($1, false, null, 'Resend: 500')`, [sor[0].id])
t.ok('hiba után újra kiadja', 1, (await atvesz()).length)
await q(`select ertesites_eredmeny($1, false, null, 'Resend: 500')`, [sor[0].id])
t.ok('harmadszor is', 1, (await atvesz()).length)
await q(`select ertesites_eredmeny($1, false, null, 'Resend: 500')`, [sor[0].id])
t.ok('három sikertelen próba után feladja', 0, (await atvesz()).length)
t.ok('a hiba szövege megmarad', 'Resend: 500', (await egy(`select last_error e from notifications where id = $1`, [sor[0].id])).e)

await q(`update notifications set status = 'PENDING', attempts = 0 where id = $1`, [sor[0].id])
await atvesz()
await q(`select ertesites_eredmeny($1, true, 'resend-123', null)`, [sor[0].id])
const kesz = await egy(`select status, provider_id, last_error, sent_at is not null elkuldve from notifications where id = $1`, [sor[0].id])
t.ok('sikeres küldés után ELKÜLDVE', { status: 'SENT', provider_id: 'resend-123', last_error: null, elkuldve: true }, kesz)
t.ok('elküldöttet nem ad ki újra', 0, (await atvesz()).length)

const kozbenLemondott = await kuld({ plate_raw: 'LEV-674', customer_phone: '+36 30 555 0674', customer_email: 'koz@pelda.hu', customer_name: 'Közben Kata' })
await dont(kozbenLemondott, true)
await q(`select set_booking_status($1, 'CANCELLED_BY_SHOP', null, true)`, [kozbenLemondott])
t.ok('ha küldés előtt lemondták, nem küldi ki', 0, (await atvesz()).length)
t.ok('és KIHAGYVA lesz', 'SKIPPED', (await ertesitesek(kozbenLemondott))[0].status)

console.log('\n=== 4) Jogosultság ===\n')
for (const fn of ['ertesitesek_atvetele(integer)', 'ertesites_eredmeny(uuid,boolean,text,text)']) {
  const r = await egy(`select has_function_privilege('anon', $1, 'execute') a,
                              has_function_privilege('authenticated', $1, 'execute') b,
                              has_function_privilege('service_role', $1, 'execute') c`, [`public.${fn}`])
  t.ok(`${fn.split('(')[0]}: csak a szerver hívhatja`, [false, false, true], [r.a, r.b, r.c])
}
t.ok('a régi lemondó link része törölve', [null, 0], Object.values(await egy(`select to_regclass('public.cancel_tokens')::text t,
  (select count(*)::int from pg_proc where proname in ('lemondas_allapot', 'lemondas_vegrehajt', 'lemondo_link_mentes', 'lemondo_token_hash')) n`)))

console.log('\n=== 5) Beállítás ===\n')
const beall = async (x) => {
  const s = await egy(`select drop_off_from::text, default_parallel_slots, default_travel_minutes,
                              pass_validity_kind::text, pass_validity_value from shop_settings`)
  await q(`select save_shop_settings($1::jsonb)`, [JSON.stringify({ ...s, ...x })])
  return (await egy(`select online_lemondas_ora o from shop_settings`)).o
}
t.ok('48 órára állítható', 48, await beall({ online_lemondas_ora: 48 }))
t.ok('egy hétnél több nem lehet', 168, await beall({ online_lemondas_ora: 500 }))
t.ok('negatív nem lehet', 0, await beall({ online_lemondas_ora: -5 }))

await db.close()
t.vege()
