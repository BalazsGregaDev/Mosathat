import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { hetkoznapra } from './_munkanap.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const kep = async (p, nev) => { if (KEPEK) { await p.waitForTimeout(400); await p.screenshot({ path: join(KEPEK, `${nev}.png`) }) } }
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const szam = (s) => Number(String(s).replace(/[^0-9]/g, ''))

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const hibak = []
p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await hetkoznapra(p)
await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 90000 })
await p.waitForFunction(() => typeof window.mosathatDemoSql === 'function', null, { timeout: 90000 })
const sql = (s, par = []) => p.evaluate(([s2, p2]) => window.mosathatDemoSql(s2, p2), [s, par])

const [cel] = await sql(`select b.id, upper(v.plate_raw) rsz from bookings b join vehicles v on v.id = b.vehicle_id
  where b.status = 'CONFIRMED' and b.service_date >= current_date and b.contract_kind is null and b.ceg_link_company is null
  order by b.service_date, b.created_at limit 1`)
await sql(`insert into booking_change_requests (booking_id, uzenet) values ($1, 'Egy órával korábban hoznám, 7:00 körül, ha belefér.')`, [cel.id])

await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(3000)

console.log('=== 1) Módosítási kérés: felugrik a munkalappal ===\n')
const panel = p.locator('aside.modositas-panel')
await panel.waitFor({ timeout: 15000 })
ok('a kérés panelje és mellette a munkalap', [1, 1], [await panel.count(), await p.locator('dialog[aria-label="Munkalap"]').count()])
ok('a munkalap a kérés foglalásáé', cel.rsz, (await p.locator('dialog[aria-label="Munkalap"] .lap-fej h2').innerText()).split(/\s/)[0])
ok('az ügyfél üzenete látszik', true, (await panel.locator('.modositas-uzenetek').innerText()).includes('Egy órával korábban hoznám'))
await kep(p, '11-modositasi-keres-munkalappal')
await panel.getByRole('button', { name: 'Később' }).click()
await p.waitForTimeout(600)
ok('Később: bezárul, alul jelzés', [0, '1 módosítási kérés vár'],
  [await panel.count(), (await p.locator('.modositas-jelzo').innerText()).replace(/\s+/g, ' ').trim()])
await p.locator('.modositas-jelzo').click()
await p.waitForTimeout(1200)
ok('a jelzésre újra megnyílik', 1, await panel.count())
await panel.getByRole('button', { name: 'Elintézve' }).click()
await p.waitForTimeout(1200)
ok('Elintézve: eltűnik, nincs jelzés', [0, 0], [await panel.count(), await p.locator('.modositas-jelzo').count()])
ok('az adatbázisban elintézve', 1, (await sql(`select count(*)::int n from booking_change_requests where booking_id = $1 and handled_at is not null`, [cel.id]))[0].n)

console.log('\n=== 2) Munkalap: az ügyfél foglalási oldala ===\n')
const menu = async (nev) => { await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click(); await p.waitForTimeout(1500) }
await menu('Időpontok')
const kartya = p.locator('.napi-lista .kartya[data-allapot="CONFIRMED"]').first()
await kartya.locator('.kartya-nyit').click()
await p.waitForTimeout(1500)
const sor = p.locator('.ml-ugyfellink')
ok('három gomb: másolás, QR, megnyitás', ['Link másolása', 'QR-kód', 'Megnyitás'],
  (await sor.locator('.btn').allInnerTexts()).map((x) => x.trim()))
ok('a Megnyitás a foglalás oldalára mutat', true, /\/foglalas\/[a-f0-9]{32}$/.test(await sor.locator('a.btn').getAttribute('href')))
await sor.getByRole('button', { name: 'QR-kód' }).click()
await p.waitForTimeout(800)
ok('QR-kód ablak a linkkel', [1, true], [await p.locator('.qr-ablak img').count(), /\/foglalas\/[a-f0-9]{32}$/.test(await p.locator('.qr-ablak .qr-link').innerText())])
await kep(p, '12-ugyfel-qr')
await p.locator('.qr-ablak').getByRole('button', { name: 'Bezárás' }).click()
await p.waitForTimeout(400)
await sor.scrollIntoViewIfNeeded()
await kep(p, '13-munkalap-ugyfellink')
await p.keyboard.press('Escape')
await p.waitForTimeout(600)

console.log('\n=== 3) Kész van: végösszeg, felár oka, e-mail ===\n')
const [kb] = await sql(`select b.id, upper(v.plate_raw) rsz, b.estimated_price_huf ar from bookings b join vehicles v on v.id = b.vehicle_id
  where b.status in ('ARRIVED', 'IN_PROGRESS') and b.service_date = current_date and b.contract_kind is null and b.ceg_link_company is null
  order by b.created_at limit 1`)
await sql(`update customers set email = 'ugyfel@pelda.hu' where id = (select customer_id from bookings where id = $1)`, [kb.id])
await p.locator('.napi-lista .kartya').filter({ hasText: kb.rsz }).first().locator('.kartya-nyit').click()
await p.waitForTimeout(1500)
await p.locator('.munkalap-lab').getByRole('button', { name: 'Kész van' }).click()
await p.waitForTimeout(1200)
const ablak = p.locator('.kesz-ablak')
ok('a végösszeg előre kitöltve a becsült árral', kb.ar, szam(await ablak.locator('#kesz-ar').inputValue()))
ok('nincs felár, nincs indok mező', 0, await ablak.locator('#kesz-indok').count())
ok('van e-mail jelölő, alapból kikapcsolva', [1, false], [await ablak.locator('.kesz-email').count(), await ablak.locator('.kesz-email input').isChecked()])
await ablak.locator('#kesz-ar').fill(String(kb.ar + 5000))
await p.waitForTimeout(300)
const vegGomb = ablak.locator('.kerdes-gombok button').last()
ok('drágábbnál indok mező, és nem menthető indok nélkül', [1, true], [await ablak.locator('#kesz-indok').count(), await vegGomb.isDisabled()])
await ablak.locator('#kesz-indok').fill('Erősen kutyaszőrös belső')
await ablak.locator('.kesz-email input').check()
await kep(p, '14-kesz-van-vegosszeg')
ok('indokkal már menthető', false, await vegGomb.isDisabled())
const mind = ablak.getByRole('button', { name: 'Mindennel elkészültünk' })
if (await mind.count()) await mind.click(); else await vegGomb.click()
await p.waitForTimeout(1500)
const [utana] = await sql(`select status::text s, final_price_huf ar, felar_indok i,
  (select count(*)::int from notifications n where n.booking_id = b.id and n.kind = 'CAR_READY') e from bookings b where id = $1`, [kb.id])
ok('kész, a végösszeg és az indok elmentve, levél sorban', ['READY', kb.ar + 5000, 'Erősen kutyaszőrös belső', 1], [utana.s, utana.ar, utana.i, utana.e])
await p.keyboard.press('Escape')
await p.waitForTimeout(600)

console.log('\n=== 4) Elérhetőség: Google-értékelés linkje ===\n')
await menu('Elérhetőség')
await p.locator('[data-mezo="google_ertekeles"]').fill('https://g.page/r/pelda/review')
await p.locator('[data-mezo="google_ertekeles"]').scrollIntoViewIfNeeded()
await kep(p, '15-elerhetoseg-google')
await p.getByRole('button', { name: /Mentés/ }).first().click()
await p.waitForTimeout(1500)
ok('elmentve', 'https://g.page/r/pelda/review', (await sql(`select google_ertekeles g from publikus_adatok`))[0].g)

console.log('\n=== 5) Tartalom: a foglalás oldalának szövegei előnézettel ===\n')
await menu('Tartalom')
const savKesz = p.locator('.pub-sav').filter({ hasText: 'Foglalás oldala: elkészült az autó' }).first()
await savKesz.scrollIntoViewIfNeeded()
await p.waitForTimeout(800)
ok('az előnézetben az elkészült doboz', 1, await savKesz.locator('.ugy-kesz').count())
await kep(p, '16-tartalom-foglalas-oldala')

ok('nincs JS hiba', [], hibak)
await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
