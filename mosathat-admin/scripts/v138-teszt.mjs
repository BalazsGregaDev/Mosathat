import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adminOldal } from './_publikus.mjs'
import { munkanap } from './_munkanap.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const kep = async (el, nev) => { if (KEPEK) await el.screenshot({ path: join(KEPEK, `${nev}.png`) }) }
const jsHiba = (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ }
const TULAJ = '00000000-0000-4000-8000-000000000002'
const { nap } = munkanap()

const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
await belep('tulaj@mosathat.hu')
await sql(`select set_config('app.uid', $1, false)`, [TULAJ])
await p.locator('aside.oldalsav .menu button').filter({ hasText: /^Időpontok$/ }).click()
await p.waitForTimeout(1500)
await p.locator('.nezetvalto button:visible').filter({ hasText: /^Nap$/ }).first().click()
await p.waitForTimeout(1200)

const adat = async (rsz) => (await sql(`select customer_name nev, customer_phone tel, company_name ceg from v_day_bookings where plate_raw = $1 order by service_date limit 1`, [rsz]))[0]
const nt = async (rsz) => { const r = await adat(rsz); return [r.nev, r.tel] }
const NEVTELEN = ['Névtelen', '—']
const ml = p.locator('dialog[aria-label="Munkalap"]')
const mlMezo = (cimke) => ml.locator('.szerk-sor').filter({ has: p.locator('.szerk-cimke', { hasText: new RegExp(`^${cimke}$`) }) })

async function urlapNyit() {
  const gomb = p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' })
  if (await gomb.isVisible()) await gomb.click()
  else await p.locator('.fab').click()
  await p.waitForTimeout(1200)
  return p.locator('dialog[aria-label="Új időpont"]')
}

async function cegKerdes() {
  const d = p.locator('dialog').filter({ has: p.locator('#ceg-kerdes') })
  if (await d.count()) { await d.locator('.btn-fo').first().click(); await p.waitForTimeout(700) }
}

async function ujFoglalas({ rendszam = '', nev = '', tel = '', ceg = '' }) {
  const lap = await urlapNyit()
  if (rendszam) await lap.locator('#rendszam').fill(rendszam)
  if (nev) await lap.locator('#nev').fill(nev)
  if (tel) await lap.locator('#tel').fill(tel)
  if (ceg) await lap.locator('#ceg').fill(ceg)
  await lap.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).click()
  await p.waitForTimeout(400)
  await lap.getByRole('button', { name: 'Foglalás rögzítése' }).click()
  await p.waitForTimeout(900)
  await cegKerdes()
  await p.waitForTimeout(1500)
}

async function munkalap(rsz) {
  await p.locator('.napi-lista .kartya').filter({ hasText: rsz }).first().locator('.kartya-nyit').click()
  await p.waitForTimeout(1500)
}

async function mlBezar() {
  await p.keyboard.press('Escape')
  await p.waitForTimeout(700)
}

async function mlIr(cimke, ertek) {
  await mlMezo(cimke).locator('.szerk-ertek').click()
  await p.waitForTimeout(200)
  const mezo = mlMezo(cimke).locator('input')
  await mezo.fill(ertek)
  await mezo.press('Enter')
  await p.waitForTimeout(1500)
}

console.log('=== 1) Magán, cég nélkül: két névtelen időpont, az egyiknél utólag telefonszám ===\n')
await ujFoglalas({ rendszam: 'UIA-001' })
await ujFoglalas({ rendszam: 'UIA-002' })
ok('két új névtelen foglalás', [NEVTELEN, NEVTELEN], [await nt('UIA-001'), await nt('UIA-002')])
await munkalap('UIA-001')
await mlIr('Telefon', '+36 30 138 1001')
ok('a munkalapon a beírt szám látszik', '+36 30 138 1001', (await mlMezo('Telefon').locator('.szerk-ertek').innerText()).trim())
await kep(ml.locator('.ml-ugyfel'), '01-munkalap-telefon-beirva')
await mlBezar()
await munkalap('UIA-002')
ok('a másik névtelen foglalás munkalapján NEM jelenik meg a szám', '—', (await mlMezo('Telefon').locator('.szerk-ertek').innerText()).trim())
await kep(ml.locator('.ml-ugyfel'), '02-masik-foglalas-telefon-nelkul')
await mlBezar()
ok('az adatbázisban is külön', [['Névtelen', '+36 30 138 1001'], NEVTELEN], [await nt('UIA-001'), await nt('UIA-002')])

console.log('\n=== 2) Új időpont: a rendszám-találatok közül egy névtelen autót választok, és beírom a telefonszámot ===\n')
{
  const lap = await urlapNyit()
  await lap.locator('#rendszam').fill('UIA-00')
  await p.waitForTimeout(900)
  const sor = lap.locator('.talalatlista .talalatsor').filter({ hasText: 'UIA-002' })
  ok('a névtelen autó megjelenik a találatok közt', 1, await sor.count())
  await kep(lap.locator('.foglalas-urlap'), '03-talalat-nevtelen-auto')
  await sor.first().click()
  await p.waitForTimeout(500)
  await lap.locator('#nev').fill('Új Ödön')
  await lap.locator('#tel').fill('+36 30 138 1002')
  await lap.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).click()
  await p.waitForTimeout(300)
  await lap.getByRole('button', { name: 'Foglalás rögzítése' }).click()
  await p.waitForTimeout(2500)
  ok('nem kérdez rá (a névtelen autónak nincs régi ügyféladata)', 0, await p.locator('#ugyfel-kerdes').count())
  const uj = await sql(`select v.customer_name nev, v.customer_phone tel from v_day_bookings v join bookings b on b.id = v.id where v.plate_raw = 'UIA-002' order by b.created_at desc limit 1`)
  ok('az új foglalás az új ügyfélé', ['Új Ödön', '+36 30 138 1002'], [uj[0]?.nev, uj[0]?.tel])
  const regi = await sql(`select customer_name nev, customer_phone tel from v_day_bookings v join bookings b on b.id = v.id where v.plate_raw = 'UIA-002' order by b.created_at limit 1`)
  ok('a korábbi névtelen UIA-002 foglalás névtelen marad', NEVTELEN, [regi[0].nev, regi[0].tel])
  ok('és az UIA-001 is a saját számával', ['Névtelen', '+36 30 138 1001'], await nt('UIA-001'))
}

console.log('\n=== 3) Új időpont: kiválasztott ügyfél, de más név és más telefonszám ===\n')
{
  const lap = await urlapNyit()
  await lap.locator('#nev').fill('Kovács')
  await p.waitForTimeout(900)
  await lap.locator('.talalatlista .talalatsor').filter({ hasText: 'Kovács Péter' }).first().click()
  await p.waitForTimeout(500)
  ok('a találat kitölti Kovács Péter adatait', ['Kovács Péter', '+36 30 111 2233'], [await lap.locator('#nev').inputValue(), await lap.locator('#tel').inputValue()])
  await lap.locator('#nev').fill('Kovács Pál')
  await lap.locator('#tel').fill('+36 30 138 1003')
  await lap.locator('#rendszam').fill('UIA-003')
  await lap.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).click()
  await lap.getByRole('button', { name: 'Foglalás rögzítése' }).click()
  await p.waitForTimeout(900)
  const kerdes = p.locator('dialog').filter({ has: p.locator('#ugyfel-kerdes') })
  ok('rákérdez: ugyanaz az ügyfél?', 1, await kerdes.count())
  ok('megmutatja, mi tér el', ['Név', 'Telefon'], (await kerdes.locator('dt').allInnerTexts()).map((x) => x.trim()))
  await kep(kerdes.locator('.kerdes-ablak'), '04-ugyanaz-az-ugyfel-kerdes')
  await kerdes.getByRole('button', { name: /Másik ügyfél/ }).click()
  await p.waitForTimeout(2500)
  const kovacs = await sql(`select distinct customer_name nev, customer_phone tel from v_day_bookings where plate_raw = 'ABC-123'`)
  ok('Kovács Péter foglalásain marad a régi neve és száma', [{ nev: 'Kovács Péter', tel: '+36 30 111 2233' }], kovacs)
  ok('az új foglalás Kovács Pálé, az új számmal', ['Kovács Pál', '+36 30 138 1003'], await nt('UIA-003'))
}

console.log('\n=== 4) Ugyanez, de ugyanaz az ügyfél: a régi foglalásain is frissül ===\n')
{
  const lap = await urlapNyit()
  await lap.locator('#rendszam').fill('LMN-882')
  await p.waitForTimeout(900)
  await lap.locator('.talalatlista .talalatsor').filter({ hasText: 'LMN-882' }).first().click()
  await p.waitForTimeout(500)
  await lap.locator('#tel').fill('+36 20 555 1138')
  await lap.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).click()
  await lap.getByRole('button', { name: 'Foglalás rögzítése' }).click()
  await p.waitForTimeout(900)
  const kerdes = p.locator('dialog').filter({ has: p.locator('#ugyfel-kerdes') })
  ok('csak a telefonszám tér el', ['Telefon'], (await kerdes.locator('dt').allInnerTexts()).map((x) => x.trim()))
  await kerdes.getByRole('button', { name: /Ugyanaz az ügyfél/ }).click()
  await p.waitForTimeout(2500)
  const anita = await sql(`select distinct customer_name nev, customer_phone tel from v_day_bookings where plate_raw = 'LMN-882'`)
  ok('Nagy Anita minden foglalásán az új szám', [{ nev: 'Nagy Anita', tel: '+36 20 555 1138' }], anita)
}

console.log('\n=== 5) Céggel: két névtelen céges időpont, az egyiknél utólag sofőr és telefonszám ===\n')
await ujFoglalas({ rendszam: 'UIL-001', ceg: 'Lenpower' })
await ujFoglalas({ rendszam: 'UIL-002', ceg: 'LENPOWER' })
ok('mindkettő a cégé, név és szám nélkül', [['Névtelen', '—', 'Lenpower'], ['Névtelen', '—', 'Lenpower']],
  [Object.values(await adat('UIL-001')), Object.values(await adat('UIL-002'))])
await munkalap('UIL-001')
await mlIr('Telefon', '+36 30 138 1005')
await mlIr('Név', 'Sofőr Sándor')
await kep(ml.locator('.ml-ugyfel'), '05-ceges-munkalap-sofor')
await mlBezar()
await munkalap('UIL-002')
ok('a cég másik foglalásán nincs ott a sofőr és a szám', ['Névtelen', '—'],
  [(await mlMezo('Név').locator('.szerk-ertek').innerText()).trim(), (await mlMezo('Telefon').locator('.szerk-ertek').innerText()).trim()])
await mlBezar()
ok('az adatbázisban is', [['Sofőr Sándor', '+36 30 138 1005', 'Lenpower'], ['Névtelen', '—', 'Lenpower']],
  [Object.values(await adat('UIL-001')), Object.values(await adat('UIL-002'))])

console.log('\n=== 6) Céges időpont egy magánügyfél telefonszámával ===\n')
await ujFoglalas({ rendszam: 'UIL-003', nev: 'Tóth Gergő', tel: '+36 70 244 1100', ceg: 'Lenpower' })
ok('Tóth Gergő magánfoglalása magán marad', [null], (await sql(`select distinct company_name from v_day_bookings where plate_raw = 'AABB-123'`)).map((r) => r.company_name))
ok('a céges foglalás a cégnél', ['Tóth Gergő', '+36 70 244 1100', 'Lenpower'], Object.values(await adat('UIL-003')))

console.log('\n=== 7) Valódi ügyfél több időponttal: munkalapon és szerkesztéskor rákérdez ===\n')
{
  const [{ start }] = await sql(`select id start from packages where code = 'START'`)
  for (const rsz of ['UIH-001', 'UIH-002', 'UIH-003']) {
    await sql(`select create_booking($1::jsonb)`, [JSON.stringify({ category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: nap,
      drop_off_time: '09:00', package_id: start, extras: [], customer_name: 'Hármas Hanna', customer_phone: '+36 30 138 1700',
      company_id: null, company_name: null, plate_raw: rsz })])
  }
  await p.locator('aside.oldalsav .menu button').filter({ hasText: /^Ügyfelek$/ }).click(); await p.waitForTimeout(900)
  await p.locator('aside.oldalsav .menu button').filter({ hasText: /^Időpontok$/ }).click(); await p.waitForTimeout(1500)
  await munkalap('UIH-001')
  await mlMezo('Telefon').locator('.szerk-ertek').click()
  await mlMezo('Telefon').locator('input').fill('+36 30 138 1711')
  await mlMezo('Telefon').locator('input').press('Enter')
  await p.waitForTimeout(1200)
  const va = p.locator('.ceg-valtas')
  ok('rákérdez: a másik két foglalás, alapból nincs kijelölve', [2, [false, false]],
    [await va.locator('.ceg-valtas-lista li').count(), await va.locator('.ceg-valtas-lista input').evaluateAll((l) => l.map((e) => e.checked))])
  ok('a címe és a változás', ['Ügyféladat módosítása', 'Telefon:'], [(await va.locator('h2').innerText()).trim(), (await va.locator('.ceg-valtas-cimke').innerText()).trim()])
  await kep(va, '06-ugyfeladat-modositasa')
  await va.getByRole('button', { name: 'Csak ennél a foglalásnál' }).click()
  await p.waitForTimeout(2000)
  await mlBezar()
  ok('„Csak ennél": a másik kettőn a régi szám', ['+36 30 138 1711', '+36 30 138 1700', '+36 30 138 1700'],
    [(await adat('UIH-001')).tel, (await adat('UIH-002')).tel, (await adat('UIH-003')).tel])

  await munkalap('UIH-002')
  await ml.getByRole('button', { name: 'Szerkesztés' }).click()
  await p.waitForTimeout(1500)
  const urlap = p.locator('dialog[aria-label="Időpont módosítása"]')
  await urlap.locator('#tel').fill('+36 30 138 1722')
  await urlap.getByRole('button', { name: 'Módosítás mentése' }).click()
  await p.waitForTimeout(1200)
  ok('a szerkesztő űrlapból is rákérdez (itt már csak egy társ van)', 1, await va.locator('.ceg-valtas-lista li').count())
  await va.locator('.ceg-valtas-lista input').first().check()
  await va.getByRole('button', { name: /Mentés \(2 foglalás\)/ }).click()
  await p.waitForTimeout(2500)
  await mlBezar()
  ok('kijelölve mindkettőn az új szám, a leválasztotton a saját', ['+36 30 138 1711', '+36 30 138 1722', '+36 30 138 1722'],
    [(await adat('UIH-001')).tel, (await adat('UIH-002')).tel, (await adat('UIH-003')).tel])
}

console.log('\n=== 8) Flotta: a közös telefonszám az egész flottára, a cég többi foglalására nem ===\n')
{
  await sql(`select set_contract_fleet(ct.id, true) from contracts ct join customers c on c.company_id = ct.company_id where c.name = 'Autó Trans Kft.'`)
  const lap = await urlapNyit()
  await lap.locator('#ceg').fill('Autó Trans')
  await p.waitForTimeout(900)
  await lap.locator('.ceg-kereso .talalatsor').first().click()
  await p.waitForTimeout(1500)
  const gomb = lap.getByRole('button', { name: '+ Autó hozzáadása' })
  await gomb.click(); await gomb.click()
  await p.waitForTimeout(500)
  if (await lap.locator('.foglalas-urlap .valaszto[data-hianyzik]').count()) await lap.locator('.foglalas-urlap .urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).first().click()
  await lap.getByRole('button', { name: '2 autó rögzítése' }).click()
  await p.waitForTimeout(2500)
  await ujFoglalas({ rendszam: 'UIK-001', ceg: 'Autó Trans Kft.' })
  const fk = p.locator('.napi-lista .flotta-kartya').first()
  await fk.getByRole('button', { name: 'Autók' }).click()
  await p.waitForTimeout(1500)
  const fl = p.locator('[aria-label="Flottás csoport"]')
  const kozos = fl.locator('.szerk-sor').filter({ has: p.locator('.szerk-cimke', { hasText: /^Telefon$/ }) })
  await kozos.locator('.szerk-ertek').click()
  await kozos.locator('input').fill('+36 30 138 1800')
  await kozos.locator('input').press('Enter')
  await p.waitForTimeout(2000)
  await kep(fl, '07-flotta-kozos-telefon')
  const [{ csoport }] = await sql(`select fleet_group csoport from bookings where fleet_group is not null order by created_at desc limit 1`)
  const flotta = await sql(`select distinct customer_phone tel from v_day_bookings where fleet_group = $1`, [csoport])
  ok('a flotta mindkét autóján a közös szám', [{ tel: '+36 30 138 1800' }], flotta)
  ok('a cég másik, névtelen foglalásán nincs ott', '—', (await adat('UIK-001')).tel)
  const ceg = await sql(`select customer_name nev, customer_phone tel from v_day_bookings where plate_raw = 'KER-100' limit 1`)
  ok('és a cég saját ügyfélkártyáján sem', ['Autó Trans Kft.', '+36 1 999 1234'], [ceg[0]?.nev, ceg[0]?.tel])
  await p.keyboard.press('Escape')
  await p.waitForTimeout(600)
}

console.log('\n=== 9) Telefonon: a rákérdező ablak ===\n')
{
  await p.setViewportSize({ width: 390, height: 844 })
  await p.waitForTimeout(600)
  const lap = await urlapNyit()
  await lap.locator('#rendszam').fill('PQR')
  await p.waitForTimeout(900)
  await lap.locator('.talalatlista .talalatsor').filter({ hasText: 'PQR-450' }).first().click()
  await p.waitForTimeout(500)
  await lap.locator('#nev').fill('Szabó Mária')
  await lap.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).click()
  await lap.getByRole('button', { name: 'Foglalás rögzítése' }).click()
  await p.waitForTimeout(900)
  const kerdes = p.locator('dialog').filter({ has: p.locator('#ugyfel-kerdes') })
  ok('telefonon is felugrik, nem lóg ki', [1, true], [await kerdes.count(), await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)])
  await kep(p, '08-telefon-kerdes')
  await kerdes.getByRole('button', { name: 'Mégse' }).click()
  await p.waitForTimeout(500)
  ok('Mégse: nem mentett, az űrlap nyitva marad', [0, 1, ['Szabó Márk']],
    [await kerdes.count(), await lap.count(), (await sql(`select distinct customer_name nev from v_day_bookings where plate_raw = 'PQR-450'`)).map((r) => r.nev)])
}

await ctx.close()
await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
