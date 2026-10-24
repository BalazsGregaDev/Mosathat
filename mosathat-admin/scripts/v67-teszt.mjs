import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

import { adatbazis, TULAJ } from './_db.mjs'
import { adminOldal, foglalasOldal, onlineKeres, valtozas } from './_publikus.mjs'

const CIM = process.env.CIM ?? 'http://localhost:5181'
const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const sima = (s) => s.replace(/\s+/g, ' ').trim()
const kep = async (p, nev) => { if (KEPEK) await p.screenshot({ path: join(KEPEK, nev), fullPage: true }) }

const db = await adatbazis({ demo: true })
const egy = async (s, p = []) => (await db.query(s, p)).rows[0]
await db.query(`select set_config('app.uid', $1, false)`, [TULAJ])
const PREMIUM = (await egy(`select id from packages where code = 'PREMIUM'`)).id
const nap = (await egy(
  `select d::date::text d from generate_series(public.budapest_ma() + 4, public.budapest_ma() + 50, interval '1 day') d
    where munkanap(d::date) order by d limit 1`)).d
let sorszam = 0
async function foglalas(x = {}) {
  sorszam++
  const id = (await egy(`select online_foglalas($1::jsonb) id`, [JSON.stringify({
    category: 'SZEMELYAUTO', scope: 'TELJES', package_id: PREMIUM, full_service: false, extras: [],
    booking_type: 'LEADOS', service_date: nap, start_time: null, drop_off_time: '09:00',
    customer_name: `Lemondó Lajos ${sorszam}`, customer_phone: `+36 30 555 07${String(sorszam).padStart(2, '0')}`,
    customer_email: 'lajos@pelda.hu', plate_raw: `LEM-${700 + sorszam}`, brand: 'Toyota', model: 'Corolla',
    notes: null, seat_material: null, next_day_pick_up: false, pick_up_time: '14:00', ...x,
  })])).id
  await egy(`select online_keres_dontes($1, true)`, [id])
  const token = randomBytes(32).toString('base64url')
  await egy(`select lemondo_link_mentes($1, $2)`, [id, token])
  return { id, token }
}
const statusz = async (id) => (await egy(`select status::text s from bookings where id = $1`, [id])).s

const HIBAS = 'h'.repeat(43)
async function lemondasVegpont(ctx) {
  await ctx.route('**/functions/v1/lemondas**', async (route) => {
    const r = route.request()
    const fej = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: fej })
    const token = r.method() === 'GET' ? new URL(r.url()).searchParams.get('t') : JSON.parse(r.postData() ?? '{}').t
    if (token === HIBAS) {
      return route.fulfill({ status: 500, headers: fej, contentType: 'application/json',
        body: JSON.stringify({ hiba: 'Átmeneti hiba történt, kérjük, próbáld újra pár perc múlva.' }) })
    }
    const fv = r.method() === 'POST' ? 'lemondas_vegrehajt' : 'lemondas_allapot'
    const adat = /^[A-Za-z0-9_-]{43}$/.test(token ?? '') ? (await egy(`select ${fv}($1) j`, [token])).j : { allapot: 'ISMERETLEN' }
    return route.fulfill({ status: 200, headers: fej, contentType: 'application/json',
      body: JSON.stringify({ ...adat, telefon: '+36 1 506 0420', uzlet: 'Mosathat' }) })
  })
}

async function lap(viewport, isMobile = false) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, isMobile, hasTouch: isMobile })
  await lemondasVegpont(ctx)
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
  return { ctx, p, hibak }
}
const cim = async (p) => sima(await p.locator('.lem-kartya h1').innerText())
const ut = (p) => new URL(p.url()).pathname
const kartyaVar = async (p, utvonal = null) => {
  for (let i = 0; i < 80; i++) {
    await p.waitForTimeout(250)
    if (utvonal && ut(p) !== utvonal) continue
    const kesz = await p.locator('.lem-kartya h1').count().catch(() => 0)
    if (kesz > 0) return
  }
  throw new Error(`Nem jelent meg a kártya: ${p.url()}`)
}
const megnyit = async (p, cel) => {
  await p.goto(`${CIM}${cel}`, { waitUntil: 'commit' }).catch(() => {})
  await kartyaVar(p)
}

console.log('=== 1) Lemondás a linkkel ===\n')
const elso = await foglalas()
const tel = await lap({ width: 390, height: 844 }, true)
await megnyit(tel.p, `/lemondas?t=${elso.token}`)
ok('megerősítést kér', 'Biztosan lemondod a foglalásodat?', await cim(tel.p))
const adatok = sima(await tel.p.locator('.lem-adatok').innerText())
ok('mutatja az autót és az időt', [true, true, true],
  [adatok.includes('LEM-701 · Toyota Corolla'), adatok.includes('Hozd az autót 9:00'), adatok.includes('Elkészül 14:00')])
ok('a határidőt is kiírja', true, sima(await tel.p.locator('.lem-kartya').innerText()).includes('Online lemondási határidő:'))
ok('idő után nincs rag', false, /\d:\d\d[-\u2011]/.test(await tel.p.locator('.lem-kartya').innerText()))
ok('a nagyítás nincs letiltva', false,
  (await tel.p.locator('meta[name="viewport"]').getAttribute('content')).includes('user-scalable=no'))
ok('még nincs lemondva', 'CONFIRMED', await statusz(elso.id))
await kep(tel.p, '04-lemondas-telefon.png')

const asztal = await lap({ width: 1280, height: 860 })
await megnyit(asztal.p, `/lemondas?t=${elso.token}`)
await kep(asztal.p, '05-lemondas-asztali.png')
await asztal.ctx.close()

await tel.p.getByRole('button', { name: 'Igen, lemondom' }).click()
await kartyaVar(tel.p, '/lemondas/sikeres')
ok('átvisz a sikeres oldalra', ['/lemondas/sikeres', 'Sikeresen lemondtad a foglalásodat'], [ut(tel.p), await cim(tel.p)])
ok('az adatbázisban tényleg lemondva', 'CANCELLED_BY_CUSTOMER', await statusz(elso.id))
ok('a sikeres oldal kiírja, mikor mondta le', true, sima(await tel.p.locator('.lem-kartya').innerText()).includes('Lemondva:'))
await kep(tel.p, '06-sikeres-lemondas.png')

await megnyit(tel.p, `/lemondas?t=${elso.token}`)
ok('a linket újra megnyitva a sikeres oldalt mutatja', ['/lemondas/sikeres', 'Sikeresen lemondtad a foglalásodat'],
  [ut(tel.p), await cim(tel.p)])

console.log('\n=== 2) Sikeres oldal csak valódi lemondás után ===\n')
const masodik = await foglalas()
await megnyit(tel.p, `/lemondas/sikeres?t=${masodik.token}`)
ok('le nem mondott foglalásnál visszadob a megerősítéshez', ['/lemondas', 'Biztosan lemondod a foglalásodat?'],
  [ut(tel.p), await cim(tel.p)])
ok('és nem mond le semmit', 'CONFIRMED', await statusz(masodik.id))

console.log('\n=== 3) Amikor nem mondható le ===\n')
const kesoi = await foglalas()
await egy(`update bookings set drop_off_at = now() + interval '2 hours' where id = $1`, [kesoi.id])
await megnyit(tel.p, `/lemondas?t=${kesoi.token}`)
ok('határidő után: telefonáljon', ['Online már nem mondható le', 1],
  [await cim(tel.p), await tel.p.locator('a.lem-gomb[href="tel:+3615060420"]').count()])
ok('nincs lemondás gomb', 0, await tel.p.getByRole('button', { name: 'Igen, lemondom' }).count())
await kep(tel.p, '07-lejart.png')

const megerkezett = await foglalas()
await egy(`select set_booking_status($1, 'ARRIVED', null, true)`, [megerkezett.id])
await megnyit(tel.p, `/lemondas?t=${megerkezett.token}`)
ok('megérkezett autó', 'Ezen az autón már dolgozunk', await cim(tel.p))
await kep(tel.p, '08-mar-dolgozunk.png')

await megnyit(tel.p, `/lemondas?t=${randomBytes(32).toString('base64url')}`)
ok('ismeretlen link', 'Ez a lemondó link nem érvényes', await cim(tel.p))
await kep(tel.p, '09-ervenytelen.png')

await megnyit(tel.p, `/lemondas?t=${HIBAS}`)
ok('szerverhiba: újrapróbálható', ['Most nem sikerült betölteni', 1],
  [await cim(tel.p), await tel.p.getByRole('button', { name: 'Újrapróbálom' }).count()])
await kep(tel.p, '10-szerverhiba.png')

const verseny = await foglalas()
await megnyit(tel.p, `/lemondas?t=${verseny.token}`)
await egy(`select set_booking_status($1, 'ARRIVED', null, true)`, [verseny.id])
await tel.p.getByRole('button', { name: 'Igen, lemondom' }).click()
await tel.p.waitForTimeout(1500)
ok('ha közben megérkezett, nem írja ki, hogy sikeres', ['Ezen az autón már dolgozunk', 'ARRIVED'],
  [await cim(tel.p), await statusz(verseny.id)])
ok('a lemondó oldalakon nincs JS hiba', [], tel.hibak)
await tel.ctx.close()

console.log('\n=== 4) Admin: beállítás és online kérés ===\n')
const adminHibak = []
const { ctx: admin, p, sql, belep } = await adminOldal(b, { hiba: (e) => adminHibak.push(e.message.slice(0, 160)) })
await belep('tulaj@mosathat.hu')
const menu = (szoveg) => p.locator('aside.oldalsav button').filter({ hasText: szoveg }).first()

await menu('Beállítások').click(); await p.waitForTimeout(800)
await p.locator('.fulek button').filter({ hasText: 'Általános' }).click(); await p.waitForTimeout(800)
const panel = p.locator('.panel').filter({ hasText: 'Online foglalás' })
const mezo = panel.locator('input[type="number"]')
ok('az Általános fülön ott az online lemondási határidő, alapból 24', '24', await mezo.inputValue())
await mezo.fill('48')
await p.locator('.fej-mentes button').filter({ hasText: 'Mentés' }).click(); await p.waitForTimeout(1200)
await menu('Időpontok').click(); await p.waitForTimeout(600)
await menu('Beállítások').click(); await p.waitForTimeout(800)
await p.locator('.fulek button').filter({ hasText: 'Általános' }).click(); await p.waitForTimeout(800)
ok('mentés után megmarad', '48', await mezo.inputValue())
await panel.scrollIntoViewIfNeeded()
await kep(p, '11-beallitas.png')
await mezo.fill('24')
await p.locator('.fej-mentes button').filter({ hasText: 'Mentés' }).click(); await p.waitForTimeout(1000)

{
  const pub = await foglalasOldal(b, { hiba: (e) => adminHibak.push(e.message.slice(0, 160)) })
  const m = pub.m
  const gomb = (szoveg) => m.locator('.fogl-valaszto button').filter({ hasText: szoveg })
  await gomb('Személyautó').click()
  await m.locator('.fogl-csomag', { has: pub.p.locator('.nev', { hasText: /^Premium$/ }) }).click(); await pub.p.waitForTimeout(900)
  await gomb('Itt hagyom').click(); await pub.p.waitForTimeout(3500)
  await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await pub.p.waitForTimeout(1500)
  await m.locator('.fogl-idok button').first().click(); await pub.p.waitForTimeout(800)
  await pub.p.fill('#fo-nev', 'Email Emma')
  await pub.p.fill('#fo-tel', '+36 30 999 6701')
  await pub.p.fill('#fo-email', 'emma@pelda.hu')
  await pub.p.fill('#fo-rsz', 'eml-671')
  await m.locator('.fogl-feltetel input').check()
  await m.getByRole('button', { name: 'Foglalási kérés küldése' }).click(); await pub.p.waitForTimeout(2500)
  ok('a köszönő oldal ígéri az e-mailt a foglalás oldalával', true,
    (await m.locator('.fogl-siker p').innerText()).includes('e-mailt küldünk róla, benne a foglalásod oldalának linkjével'))
  ok('a kérésben az e-mail cím', [{ email: 'emma@pelda.hu' }],
    await pub.sql(`select ugyfel_email email from v_online_kerelmek k join vehicles v on v.id = k.vehicle_id where upper(v.plate_raw) = 'EML-671'`))
  await pub.ctx.close()
}
await onlineKeres(sql, { plate_raw: 'eml-671', customer_name: 'Email Emma', customer_phone: '+36 30 999 6701', customer_email: 'emma@pelda.hu' })
await valtozas(p)
const popup = p.locator('dialog[aria-label="Online foglalási kérés"]')
await popup.waitFor({ timeout: 10000 })
ok('a kérés ablaka szól, hogy élesben e-mail megy a foglalási oldal linkjével', true,
  (await popup.locator('.keres-tipp').first().innerText()).includes('visszaigazoló e-mailt kap, benne a foglalási oldala linkjével'))
await kep(p, '12-keres-ablak.png')
await popup.getByRole('button', { name: 'Elfogadom' }).click(); await p.waitForTimeout(2000)
ok('demóban elfogadás után bezárul', 0, await popup.count())

ok('az admin oldalon nincs JS hiba', [], adminHibak)

await admin.close()
await b.close()
await db.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
