import { chromium } from 'playwright'

import { adminOldal, foglalasOldal, napra, onlineKeres } from './_publikus.mjs'

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

async function menu(p, nev) {
  await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  await p.waitForTimeout(1500)
}

async function admin(keres) {
  const a = await adminOldal(b)
  const k = keres ? await onlineKeres(a.sql, keres) : null
  await a.belep('tulaj@mosathat.hu')
  return { ...a, k, popup: a.p.locator('dialog[aria-label="Online foglalási kérés"]') }
}

const { ctx, p, m, sql, hibak } = await oldal()
const csomag = async (nev) => {
  await m.locator('.fogl-csomag', { has: p.locator('.nev', { hasText: new RegExp(`^${nev}$`) }) }).click()
  await p.waitForTimeout(900)
}
const gomb = (szoveg) => m.locator('.fogl-valaszto button').filter({ hasText: szoveg })
const kinalt = async () => (await m.locator('.fogl-extra .nev').allInnerTexts()).map((x) => x.split('\n')[0].trim())
const fsSor = m.locator('.fogl-fs')
const osszegzes = async () => sima(await m.locator('.fogl-osszeg').innerText())

async function adatok(nev, tel, rsz) {
  await p.fill('#fo-nev', nev)
  await p.fill('#fo-tel', tel)
  await p.fill('#fo-rsz', rsz)
  await m.locator('.fogl-feltetel input').check()
}

console.log('=== 1) Full Service sor a csomagok alatt ===\n')
await gomb('Személyautó').click()
ok('csomag nélkül nincs Full Service sor', 0, await fsSor.count())
await csomag('Premium')
ok('Premium mellett ott van, a csomaggal együtti árral', ['40 000 Ft', 'Premium csomaggal együtt'],
  (await fsSor.locator('.ar').innerText()).split('\n').map(sima))
const leiras = sima(await fsSor.locator('.nev small').innerText())
ok('a leírás: kárpit, bőr, száradás', [true, true, true], [
  leiras.includes('vizes kárpittisztítás'), leiras.includes('bőrtisztítás és ápolás'),
  leiras.includes('ajánlott egy éjszakára nálunk hagyni')])
await gomb('Kisbusz').click(); await p.waitForTimeout(700)
ok('kisbusznál árajánlatos, nem jelölhető', ['árajánlat alapján', true],
  [sima(await fsSor.locator('.ar').innerText()), await fsSor.locator('input').isDisabled()])
await gomb('Személyautó').click(); await p.waitForTimeout(700)

console.log('\n=== 2) Bekapcsolva ===\n')
const premiumExtrak = await kinalt()
await fsSor.locator('input').check(); await p.waitForTimeout(1000)
ok('ülés választó: kárpit, bőr, kárpit-bőr', ['Kárpit', 'Bőr', 'Kárpit-bőr'],
  (await m.locator('.fogl-ules button').allInnerTexts()).map(sima))
ok('ár és idő az összegzőben', ['40 000 Ft', 'kb. 2 óra 15 perc'], [
  sima(await m.locator('.fogl-osszeg .osszeg .ar').innerText()),
  sima(await m.locator('.fogl-osszeg .osszeg .halk').first().innerText())])
ok('csak a teljes csomag választható', [true, true, 'true'], [
  await gomb('Csak kívül').isDisabled(), await gomb('Csak belül').isDisabled(),
  await gomb('Teljes').getAttribute('aria-pressed')])
const fsExtrak = await kinalt()
ok('a vizes kárpit és a bőrtisztítás nem kérhető külön', premiumExtrak.filter((n) =>
  n !== 'Vizes kárpittisztítás' && n !== 'Bőrtisztítás és ápolás'), fsExtrak)
ok('magyarázó sor', 'Ami a Premium + Full Service csomagban már benne van, azt itt nem kínáljuk külön.',
  sima(await m.locator('.fogl-kartya').filter({ hasText: 'Kérsz még valamit?' }).locator('.fogl-al-szoveg').innerText()))
ok('nincs Megvárom, helyette: Mikor viszed el?', [0, true, ['Aznap', 'Másnap']], [
  await gomb('Megvárom').count(),
  await m.locator('h2').filter({ hasText: 'Mikor viszed el?' }).isVisible(),
  (await m.locator('.fogl-kartya').filter({ hasText: 'Mikor viszed el?' }).locator('button').allInnerTexts())
    .map((x) => x.split('\n')[0].trim())])
const aznapSzoveg = async () => sima(await gomb('Aznap').locator('small').innerText())
const masnapSzoveg = async () => sima(await gomb('Másnap').locator('small').innerText())
await m.locator('.fogl-ules button').filter({ hasText: /^Kárpit$/ }).click(); await p.waitForTimeout(300)
ok('kárpitnál: vizesen viheti, a másnap ajánlott', [true, true],
  [(await aznapSzoveg()).includes('vizesen'), (await masnapSzoveg()).startsWith('Ajánlott')])
await m.locator('.fogl-ules button').filter({ hasText: /^Bőr$/ }).click(); await p.waitForTimeout(300)
ok('bőrnél nincs száradás', ['Amint elkészül, elviheted.', 'Másnap reggel 8-tól zárásig bármikor elviheted.'],
  [await aznapSzoveg(), await masnapSzoveg()])

console.log('\n=== 3) Másnapi elvitel, beküldve ===\n')
await m.locator('.fogl-ules button').filter({ hasText: /^Kárpit$/ }).click(); await p.waitForTimeout(300)
await gomb('Másnap').click(); await p.waitForTimeout(3500)
await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await p.waitForTimeout(1500)
ok('az időpontok mellett nincs aznapi kész', 0, await m.locator('.fogl-idok button small').count())
const elvitel = sima(await m.locator('.fogl-elvitel').innerText())
ok('kiírja, mikor viheti', true, /^Elviheted: \d{4}\. \S+ \d{1,2}\., \S+, 8:00 és \d{1,2}:\d{2} között, bármikor\.$/.test(elvitel))
await m.locator('.fogl-idok button').first().click(); await p.waitForTimeout(400)
await adatok('Full Ferenc', '+36 30 999 6501', 'fsv-651')
ok('összegzés: Full Service kárpittal, elvitel másnap', [true, true],
  [(await osszegzes()).includes('Premium + Full Service (kárpit)'), /elvitel: .+ 8:00–\d{1,2}:\d{2}/.test(await osszegzes())])
await m.getByRole('button', { name: 'Foglalási kérés küldése' }).click(); await p.waitForTimeout(2500)
ok('a köszönő oldal is mondja az elvitelt', true, (await m.locator('.fogl-siker p').innerText()).includes('Elviheted:'))
const FS = `select b.full_service fs, b.seat_material::text ules, b.status::text allapot,
    to_char(b.pick_up_at at time zone 'Europe/Budapest', 'HH24:MI') viszi, ((b.pick_up_at at time zone 'Europe/Budapest')::date - b.service_date) nap
  from bookings b join vehicles v on v.id = b.vehicle_id where upper(v.plate_raw) = $1`
ok('a kérésben: Full Service kárpittal, másnap 8:00 után viszi', [{ fs: true, ules: 'KARPIT', allapot: 'REQUESTED', viszi: '08:00', nap: 1 }],
  await sql(FS, ['FSV-651']))
{
  const a = await admin({ full_service: true, seat_material: 'KARPIT', next_day_pick_up: true, drop_off_time: '09:00',
    plate_raw: 'fsv-651', customer_name: 'Full Ferenc', customer_phone: '+36 30 999 6501', customer_email: null })
  ok('felugrott a kérés', 1, await a.popup.count())
  const adat = sima(await a.popup.locator('.keres-adatok').innerText())
  ok('a kérés ablakában: Full Service (kárpit), másnapi elvitel', [true, true],
    [adat.includes('Premium + Full Service (kárpit)'), /viszi .+ 0?8:00 után/.test(adat)])
  ok('az ítélet: befér', 'true', await a.popup.locator('.keres-itelet').getAttribute('data-befer'))
  await a.popup.getByRole('button', { name: 'Elfogadom' }).click(); await a.p.waitForTimeout(1500)
  await menu(a.p, 'Időpontok')
  await napra(a.p, a.k.nap)
  const kartya = a.p.locator('.napi-lista .kartya').filter({ hasText: 'FSV-651' }).first()
  ok('a napi nézetben visszaigazolva, Full Service-szel', ['CONFIRMED', true],
    [await kartya.getAttribute('data-allapot'), (await kartya.innerText()).includes('Full Service')])
  await a.ctx.close()
}

console.log('\n=== 4) Bőr, aznapi elvitel ===\n')
await m.getByRole('button', { name: 'Új foglalás' }).click(); await p.waitForTimeout(800)
await gomb('Személyautó').click()
await csomag('Premium')
await fsSor.locator('input').check(); await p.waitForTimeout(800)
await m.locator('.fogl-ules button').filter({ hasText: /^Bőr$/ }).click()
await gomb('Aznap').click(); await p.waitForTimeout(3500)
await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await p.waitForTimeout(1500)
ok('aznap: az időpontok mellett ott a kész', true, (await m.locator('.fogl-idok button small').count()) > 0)
ok('nincs másnapi elvitel sor', 0, await m.locator('.fogl-elvitel').count())
await m.locator('.fogl-idok button').first().click(); await p.waitForTimeout(400)
await adatok('Bőr Borbála', '+36 30 999 6502', 'bor-652')
await m.getByRole('button', { name: 'Foglalási kérés küldése' }).click(); await p.waitForTimeout(2500)
ok('a kérésben: bőr, aznap zárásig viszi', [{ fs: true, ules: 'BOR', allapot: 'REQUESTED', viszi: '17:00', nap: 0 }],
  await sql(FS, ['BOR-652']))
ok('nincs JS vagy konzol hiba', [], hibak)
await ctx.close()
{
  const a = await admin({ full_service: true, seat_material: 'BOR', next_day_pick_up: false, drop_off_time: '09:00', pick_up_time: '17:00',
    plate_raw: 'bor-652', customer_name: 'Bőr Borbála', customer_phone: '+36 30 999 6502', customer_email: null })
  const adat2 = sima(await a.popup.locator('.keres-adatok').innerText())
  ok('a kérés ablakában: bőr, aznap zárásig viszi', [true, true, false],
    [adat2.includes('Full Service (bőr)'), adat2.includes('viszi 17:00'), adat2.includes('után')])
  await a.popup.getByRole('button', { name: 'Elfogadom' }).click(); await a.p.waitForTimeout(1500)
  await a.ctx.close()
}

console.log('\n=== 5) Szolgáltatások: Csomag része ===\n')
{
const { ctx, p, sql } = await admin()
await menu(p, 'Szolgáltatások')
const sor = p.locator('.extrasor').filter({ hasText: 'Külső műanyagápolás' }).first()
ok('alapból egyik csomagnak sem része', 0, await sor.locator('.resze').count())
await sor.locator('button.nev').click(); await p.waitForTimeout(400)
ok('választható: a csomagok és a Full Service', ['Start', 'Premium', 'Elit', 'Full Service'],
  (await sor.locator('.resze-jelolok label').allInnerTexts()).map(sima))
await sor.locator('.resze-jelolok label').filter({ hasText: 'Start' }).locator('input').check()
await sor.locator('.resze-jelolok label').filter({ hasText: 'Elit' }).locator('input').check()
await p.waitForTimeout(1500)
ok('mentve, a sorban is látszik', 'Start, Elit része', sima(await sor.locator('.resze').innerText()))
const gumi = p.locator('.extrasor').filter({ hasText: 'Gumiápolás' }).first()
ok('a gumiápolás a Premium és az Elit része', 'Premium, Elit része', sima(await gumi.locator('.resze').innerText()))
ok('a publikus oldal adataiban is a Start és az Elit része', [['ELIT', 'START']],
  (await sql(`select array(select p.code from packages p where p.id::text in (select jsonb_array_elements_text(e->'included_in_packages')) order by p.code) k
    from jsonb_array_elements(publikus_oldal()->'extras') e where e->>'name' = 'Külső műanyagápolás'`)).map((r) => r.k))
await ctx.close()
}

console.log('\n=== 6) Telefonon ===\n')
{
  const t = await oldal({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await t.m.locator('.fogl-valaszto button').filter({ hasText: 'Személyautó' }).click()
  await t.m.locator('.fogl-csomag', { has: t.p.locator('.nev', { hasText: /^Premium$/ }) }).click(); await t.p.waitForTimeout(800)
  await t.m.locator('.fogl-fs input').check(); await t.p.waitForTimeout(800)
  await t.m.locator('.fogl-ules').scrollIntoViewIfNeeded()
  ok('nem lóg ki oldalra', true, await t.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  ok('az ülés választó egy sorban', 1, await t.m.locator('.fogl-ules button').evaluateAll((l) =>
    new Set(l.map((g) => Math.round(g.getBoundingClientRect().top))).size))
  ok('a jelölő és a név egy sorban', true, await t.m.locator('.fogl-fs').evaluate((f) => {
    const a = f.querySelector('input').getBoundingClientRect()
    const n = f.querySelector('.nev').getBoundingClientRect()
    return Math.abs(a.top - n.top) < 20
  }))
  ok('nincs JS vagy konzol hiba', [], t.hibak)
  await t.ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
