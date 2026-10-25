import { chromium } from 'playwright'

import { adminOldal, foglalasOldal, onlineKeres } from './_publikus.mjs'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const sima = (s) => s.replace(/\s+/g, ' ').trim()

async function oldal(beall = { viewport: { width: 1440, height: 900 } }) {
  const hibak = []
  const { viewport, ...kontextus } = beall
  const o = await foglalasOldal(b, { viewport, kontextus, hiba: (e) => hibak.push(`pageerror: ${e.message.slice(0, 160)}`) })
  o.p.on('console', (m) => { if (m.type() === 'error') hibak.push(`console: ${m.text().slice(0, 160)}`) })
  return { ...o, hibak }
}

const { ctx, p, m, sql, hibak } = await oldal()
const csomag = async (nev) => {
  await m.locator('.fogl-csomag', { has: p.locator('.nev', { hasText: new RegExp(`^${nev}$`) }) }).click()
  await p.waitForTimeout(900)
}
const terjedelem = async (nev) => {
  await m.locator('.fogl-valaszto button').filter({ hasText: nev }).click(); await p.waitForTimeout(900)
}
const kinalt = async () => (await m.locator('.fogl-extra .nev').allInnerTexts()).map((x) => x.split('\n')[0].trim())
const extra = (nev) => m.locator('.fogl-extra').filter({ has: p.locator('.nev', { hasText: nev }) })
const vegosszeg = async () => sima(await m.locator('.fogl-osszeg .osszeg .ar').innerText())
const osszegzes = async () => sima(await m.locator('.fogl-osszeg').innerText())

console.log('=== 1) Ami a csomagban benne van, azt nem kínálja ===\n')
await m.locator('.fogl-valaszto button').filter({ hasText: 'Személyautó' }).click()
await csomag('Start')
const startExtrak = await kinalt()
ok('Startnál a gumiápolás választható', true, startExtrak.includes('Gumiápolás'))
ok('Startnál nincs mit kiszűrni, nincs magyarázó sor', 0, await m.locator('.fogl-al-szoveg').count())
await csomag('Premium')
const premiumExtrak = await kinalt()
ok('Premiumnál nincs gumiápolás, minden más megmarad', [false, startExtrak.filter((n) => n !== 'Gumiápolás')],
  [premiumExtrak.includes('Gumiápolás'), premiumExtrak])
ok('magyarázó sor a lista fölött', 'Ami a Premium csomagban már benne van, azt itt nem kínáljuk külön.',
  sima(await m.locator('.fogl-al-szoveg').innerText()))
await csomag('Elit')
ok('Elitnél sincs gumiápolás', false, (await kinalt()).includes('Gumiápolás'))

console.log('\n=== 2) Csak kívül / csak belül ===\n')
await csomag('Premium')
await terjedelem('Csak belül')
ok('csak belül: a gumiápolás újra kérhető', true, (await kinalt()).includes('Gumiápolás'))
await terjedelem('Csak kívül')
ok('csak kívül: benne van, nem kínálja', false, (await kinalt()).includes('Gumiápolás'))
await terjedelem('Teljes')
ok('teljes: benne van, nem kínálja', false, (await kinalt()).includes('Gumiápolás'))

console.log('\n=== 3) Csomagváltáskor kiesik, ami már benne van ===\n')
await csomag('Start')
await extra('Gumiápolás').locator('input[type="checkbox"]').check(); await p.waitForTimeout(900)
ok('Startnál bekerül az összegzésbe', true, (await osszegzes()).includes('+ Gumiápolás'))
await csomag('Premium')
const premiumAr = await vegosszeg()
ok('Premiumra váltva eltűnik az összegzésből', [false, false],
  [(await osszegzes()).includes('Gumiápolás'), (await osszegzes()).includes('egyeztetendő')])
ok('az ár a csomag ára, extra nélkül', '15 600 Ft', premiumAr)

console.log('\n=== 4) Darabszám az egységáras extráknál ===\n')
const karpit = extra('Vizes kárpittisztítás')
ok('egységár látszik', '+ 6500 Ft / ülés', sima(await karpit.locator('.ar').innerText()))
ok('bejelölés előtt nincs léptető', 0, await karpit.locator('.fogl-darab').count())
await karpit.locator('input[type="checkbox"]').check(); await p.waitForTimeout(1000)
ok('alapból 5 ülés, összeg kiírva', ['5 ülés', '= 32 500 Ft'],
  [sima(await karpit.locator('.db').innerText()), sima(await karpit.locator('.osszeg').innerText())])
ok('a végösszegben benne van', '48 100 Ft', await vegosszeg())
await karpit.getByRole('button', { name: 'Vizes kárpittisztítás: több' }).click(); await p.waitForTimeout(1000)
ok('egy üléssel több', ['6 ülés', '= 39 000 Ft', '54 600 Ft'],
  [sima(await karpit.locator('.db').innerText()), sima(await karpit.locator('.osszeg').innerText()), await vegosszeg()])
for (let i = 0; i < 3; i++) await karpit.getByRole('button', { name: 'Vizes kárpittisztítás: több' }).click()
await p.waitForTimeout(600)
ok('legfeljebb 9 ülés', ['9 ülés', true], [
  sima(await karpit.locator('.db').innerText()),
  await karpit.getByRole('button', { name: 'Vizes kárpittisztítás: több' }).isDisabled()])
ok('az összegzésben a darabszám', true, (await osszegzes()).includes('+ Vizes kárpittisztítás (9 ülés)'))
await karpit.locator('input[type="checkbox"]').uncheck(); await p.waitForTimeout(900)
ok('kivéve: nincs léptető, az ár visszaáll', [0, '15 600 Ft'], [await karpit.locator('.fogl-darab').count(), await vegosszeg()])
await karpit.locator('input[type="checkbox"]').check(); await p.waitForTimeout(1000)
ok('újra bejelölve megint 5 ülés', '5 ülés', sima(await karpit.locator('.db').innerText()))

console.log('\n=== 5) Ár nélküli extra ===\n')
const motor = extra('Motortér kozmetika')
ok('ár helyett: ár egyeztetés után', 'ár egyeztetés után', sima(await motor.locator('.ar').innerText()))
await motor.locator('input[type="checkbox"]').check(); await p.waitForTimeout(1000)
ok('alkalomra szól, nincs léptető', 0, await motor.locator('.fogl-darab').count())
ok('az összegzés jelzi', [true, true, '48 100 Ft'], [
  (await osszegzes()).includes('Ára egyeztetés után: Motortér kozmetika'),
  (await osszegzes()).includes('+ egyeztetendő tétel'),
  await vegosszeg()])

console.log('\n=== 6) Beküldve: a kérés és a kérés ablaka ===\n')
await m.locator('.fogl-valaszto button').filter({ hasText: 'Megvárom' }).click(); await p.waitForTimeout(3500)
await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await p.waitForTimeout(600)
await m.locator('.fogl-idok button').first().click(); await p.waitForTimeout(300)
await p.fill('#fo-nev', 'Extra Ernő')
await p.fill('#fo-tel', '+36 30 999 6401')
await p.fill('#fo-email', 'teszt@pelda.hu')
await p.fill('#fo-rsz', 'ext-641')
await m.locator('.fogl-feltetel input').check()
await m.getByRole('button', { name: 'Foglalási kérés küldése' }).click(); await p.waitForTimeout(2500)
ok('beküldve', 1, await m.locator('.fogl-siker').count())
const TETELEK = `select b.estimated_price_huf ar, array_agg(i.name_snapshot || ' ' || i.quantity::int order by i.sort_order) filter (where i.kind = 'EXTRA') extrak
  from bookings b join vehicles v on v.id = b.vehicle_id join booking_items i on i.booking_id = b.id where upper(v.plate_raw) = $1 group by b.id`
ok('a kérésben az extrák darabszámmal, az ár az egyeztetendő nélkül', [{ ar: 48100, extrak: ['Vizes kárpittisztítás 5', 'Motortér kozmetika 1'] }],
  await sql(TETELEK, ['EXT-641']))
ok('nincs JS vagy konzol hiba', [], hibak)
await ctx.close()
{
  const a = await adminOldal(b)
  const ex = async (nev) => (await a.sql(`select id from extras where name = $1`, [nev]))[0].id
  await onlineKeres(a.sql, { booking_type: 'VAROS', start_time: '09:00', drop_off_time: null, plate_raw: 'ext-641', customer_name: 'Extra Ernő',
    customer_phone: '+36 30 999 6401', customer_email: 'teszt@pelda.hu',
    extras: [{ extra_id: await ex('Vizes kárpittisztítás'), quantity: 5 }, { extra_id: await ex('Motortér kozmetika'), quantity: 1 }] })
  await a.belep('tulaj@mosathat.hu')
  const popup = a.p.locator('dialog[aria-label="Online foglalási kérés"]')
  ok('felugrott a kérés', 1, await popup.count())
  const adatok = sima(await popup.locator('.keres-adatok').innerText())
  ok('az extrák a kérésben', true, adatok.includes('+ Vizes kárpittisztítás, Motortér kozmetika'))
  ok('az ár a darabszámmal együtt, az egyeztetendő külön', ['48 100 Ft', '+ egyeztetendő: Motortér kozmetika'], [
    sima(await popup.locator('.keres-adatok dd strong').first().innerText()),
    sima(await popup.locator('.keres-egyeztet').innerText())])
  await popup.getByRole('button', { name: 'Elfogadom' }).click(); await a.p.waitForTimeout(1500)
  ok('elfogadva', 0, await popup.count())
  await a.ctx.close()
}

console.log('\n=== 7) Telefonon ===\n')
{
  const t = await oldal({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await t.m.locator('.fogl-valaszto button').filter({ hasText: 'Személyautó' }).click()
  await t.m.locator('.fogl-csomag', { has: t.p.locator('.nev', { hasText: /^Premium$/ }) }).click(); await t.p.waitForTimeout(900)
  const k = t.m.locator('.fogl-extra').filter({ has: t.p.locator('.nev', { hasText: 'Vizes kárpittisztítás' }) })
  await k.locator('input[type="checkbox"]').check(); await t.p.waitForTimeout(900)
  await k.scrollIntoViewIfNeeded()
  ok('nem lóg ki oldalra', true, await t.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  ok('a léptető gombjai a képernyőn belül', true, await k.locator('.fogl-darab').evaluate((d) => {
    const r = d.getBoundingClientRect()
    return r.left >= 0 && r.right <= window.innerWidth
  }))
  ok('nincs JS vagy konzol hiba', [], t.hibak)
  await t.ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
