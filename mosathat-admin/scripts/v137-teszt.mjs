import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adminOldal } from './_publikus.mjs'

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
const ORAK = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18']
const PERCEK = [':00', ':15', ':30', ':45']

async function panelAdat(p) {
  const panel = p.locator('.ido-ablak')
  return [
    (await panel.locator('.ido-orak button').allInnerTexts()).map((x) => x.trim()),
    (await panel.locator('.ido-percek button').allInnerTexts()).map((x) => x.trim()),
  ]
}
async function valaszt(p, ora, perc) {
  const panel = p.locator('.ido-ablak')
  await panel.locator('.ido-orak button').filter({ hasText: new RegExp(`^${ora}$`) }).click()
  await panel.locator('.ido-percek button').filter({ hasText: perc }).click()
  await p.waitForTimeout(200)
}

console.log('=== 1) Új időpont: saját időválasztó, 6 és 18 óra között, negyedórás percek ===\n')
const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
await belep('tulaj@mosathat.hu')
await p.locator('aside.oldalsav .menu button').filter({ hasText: /^Időpontok$/ }).click()
await p.waitForTimeout(1500)
await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click()
await p.waitForTimeout(1500)
const lap = p.locator('dialog[aria-label="Új időpont"]')
await lap.locator('#rendszam').fill('ABC-137')
await lap.locator('#tel').fill('+36 30 137 1370')
await lap.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).click()
await p.waitForTimeout(300)
ok('asztali gépen sincs gyári időmező, a Hozza és a Viszi gomb', [0, 'BUTTON', 'BUTTON'],
  [await lap.locator('input[type="time"]').count(), await lap.locator('#leadas').evaluate((e) => e.tagName), await lap.locator('#atvetel').evaluate((e) => e.tagName)])
await lap.locator('#leadas').click()
await p.waitForTimeout(300)
ok('Hozza: 06–18 óra, :00 :15 :30 :45', [ORAK, PERCEK], await panelAdat(p))
await kep(p, '01-uj-idopont-hozza')
await valaszt(p, '08', ':15')
ok('a mezőben 08:15', '08:15', (await lap.locator('#leadas').innerText()).trim())
await lap.locator('#atvetel').click()
await p.waitForTimeout(300)
ok('Viszi: ugyanez a választó, Törlés gombbal', [ORAK, PERCEK, 1], [...await panelAdat(p), await p.locator('.ido-ablak').getByRole('button', { name: 'Törlés' }).count()])
await valaszt(p, '16', ':45')
await lap.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Megvárja' }).click()
await p.waitForTimeout(300)
await lap.locator('#kezdes').click()
await p.waitForTimeout(300)
ok('Megvárja, Kezdés: ugyanez a választó', [ORAK, PERCEK], await panelAdat(p))
await valaszt(p, '10', ':30')
ok('a Kezdés mezőben 10:30', '10:30', (await lap.locator('#kezdes').innerText()).trim())
await lap.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).click()
await p.waitForTimeout(300)
await lap.getByRole('button', { name: 'Foglalás rögzítése' }).click()
await p.waitForTimeout(2500)
const lekerdez = async () => (await sql(`select to_char(b.drop_off_at at time zone 'Europe/Budapest', 'HH24:MI') hoz, to_char(b.pick_up_at at time zone 'Europe/Budapest', 'HH24:MI') visz
  from bookings b join vehicles v on v.id = b.vehicle_id where v.plate_raw = 'ABC-137'`))[0]
ok('elmentve a választott órákkal', { hoz: '08:15', visz: '16:45' }, await lekerdez())

console.log('\n=== 2) Foglalás módosítása: ugyanez a választó ===\n')
await p.locator('.napi-lista .kartya').filter({ hasText: 'ABC-137' }).first().locator('.kartya-nyit').click()
await p.waitForTimeout(1500)
const ml = p.locator('dialog[aria-label="Munkalap"]')
const hozza = ml.getByRole('button', { name: 'Hozza órája' })
ok('munkalapon a Hozza órája gomb, nincs gyári időmező', [1, 0], [await hozza.count(), await ml.locator('input[type="time"]').count()])
await hozza.click()
await p.waitForTimeout(300)
ok('munkalap, Hozza órája: 06–18 óra, negyedórás percek', [ORAK, PERCEK], await panelAdat(p))
await kep(p, '02-munkalap-hozza')
await valaszt(p, '09', ':00')
await p.waitForTimeout(1500)
ok('a munkalapon átírt óra elmentve', '09:00', (await lekerdez()).hoz)
await ml.getByRole('button', { name: 'Szerkesztés' }).click()
await p.waitForTimeout(1500)
const mod = p.locator('dialog[aria-label="Időpont módosítása"]')
ok('a módosító űrlapon is gomb, betöltött órákkal', [0, '09:00', '16:45'],
  [await mod.locator('input[type="time"]').count(), (await mod.locator('#leadas').innerText()).trim(), (await mod.locator('#atvetel').innerText()).trim()])
await mod.locator('#atvetel').click()
await p.waitForTimeout(300)
ok('módosításnál: 06–18 óra, negyedórás percek', [ORAK, PERCEK], await panelAdat(p))
await kep(p, '03-modositas-viszi')
await valaszt(p, '17', ':30')
await mod.getByRole('button', { name: 'Módosítás mentése' }).click()
await p.waitForTimeout(2500)
ok('a módosítás elmentve', { hoz: '09:00', visz: '17:30' }, await lekerdez())
await ctx.close()

console.log('\n=== 3) Telefonon ===\n')
{
  const { ctx, p, belep } = await adminOldal(b, { viewport: { width: 390, height: 844 }, kontextus: { isMobile: true, hasTouch: true }, hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
  await p.locator('.fiok .menu button').filter({ hasText: /^Időpontok$/ }).click(); await p.waitForTimeout(1500)
  await p.locator('.fab').click(); await p.waitForTimeout(1500)
  await p.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).click()
  await p.locator('#leadas').click()
  await p.waitForTimeout(300)
  ok('telefonon is 06–18 óra, negyedórás percek', [ORAK, PERCEK], await panelAdat(p))
  ok('a panel nem lóg ki', true, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await kep(p, '04-telefon-hozza')
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
