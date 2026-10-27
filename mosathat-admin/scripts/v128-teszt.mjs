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

const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
await belep('tulaj@mosathat.hu')
await p.locator('aside.oldalsav .menu button').filter({ hasText: /^Időpontok$/ }).click()
await p.waitForTimeout(1500)
await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click()
await p.waitForTimeout(1500)
const lap = p.locator('dialog[aria-label="Új időpont"]')
const hianyzik = () => lap.locator('[data-hianyzik]').evaluateAll((l) => l.map((e) => {
  const mezo = e.querySelector('input, .beviteli')
  return e.classList.contains('valaszto') ? 'mikor' : (mezo?.id || e.querySelector('label')?.getAttribute('for') || '?')
}))
const piros = (sel) => lap.locator(sel).evaluate((e) => getComputedStyle(e).borderTopColor)
const mentes = lap.getByRole('button', { name: 'Foglalás rögzítése' })

console.log('=== 1) Üres űrlap: nincs kiválasztott mód, piros keretek ===\n')
ok('egyik mód sincs kijelölve', [], await lap.locator('.urlap-mikor .valaszto button[aria-pressed="true"]').allInnerTexts())
ok('piros: rendszám, telefon, cég és a Mikor', ['rendszam', 'tel', 'ceg', 'mikor'], await hianyzik())
const pirosSzin = await piros('#rendszam')
ok('a keret valóban piros és vastag', [true, '2px'],
  [/^rgb\((1[5-9]\d|2\d\d), (\d|[1-9]\d), (\d|[1-9]\d)\)$/.test(pirosSzin), await lap.locator('#rendszam').evaluate((e) => getComputedStyle(e).borderTopWidth)])
ok('időmezők még nincsenek, helyette figyelmeztetés', [0, 0, 1],
  [await lap.locator('#leadas').count(), await lap.locator('#kezdes').count(), await lap.locator('.urlap-tipus-kell').count()])
await kep(lap, '01-ures-urlap')
await lap.locator('#rendszam').fill('ABC-128')
await lap.locator('#tel').fill('+36 30 128 1280')
await lap.locator('#ceg').fill('Teszt Kft.')
await lap.locator('#nev').click()
await p.waitForTimeout(400)
ok('kitöltve eltűnik a piros, a Mikor marad', ['mikor'], await hianyzik())
ok('mód nélkül nem menthető', true, await mentes.isDisabled())

console.log('\n=== 2) Itt hagyja: a hozás és az elvitel órája piros ===\n')
await lap.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).click()
await p.waitForTimeout(300)
ok('a Mikor rendben, a két óra piros', ['leadas', 'atvetel'], await hianyzik())
ok('már menthető', false, await mentes.isDisabled())
await kep(lap, '02-itt-hagyja')
await lap.locator('#leadas').fill('08:30')
await lap.locator('#atvetel').fill('16:00')
await p.waitForTimeout(300)
ok('kitöltve nincs piros', [], await hianyzik())

console.log('\n=== 3) Megvárja: a kezdés piros ===\n')
await lap.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Megvárja' }).click()
await p.waitForTimeout(300)
ok('csak a kezdés', ['kezdes'], await hianyzik())
await lap.locator('#kezdes').fill('10:00')
await p.waitForTimeout(300)
ok('kitöltve nincs piros', [], await hianyzik())
await kep(lap, '03-kitoltve')
await lap.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).click()
await mentes.click()
await p.waitForTimeout(800)
const egyezt = p.locator('dialog').filter({ has: p.locator('#ceg-kerdes') })
if (await egyezt.count()) { await egyezt.getByRole('button', { name: /Nem, ez új cég/ }).click(); await p.waitForTimeout(800) }
await p.waitForTimeout(1500)
const [f] = await sql(`select b.booking_type::text t, to_char(b.drop_off_at at time zone 'Europe/Budapest', 'HH24:MI') hoz, to_char(b.pick_up_at at time zone 'Europe/Budapest', 'HH24:MI') visz
  from bookings b join vehicles v on v.id = b.vehicle_id where v.plate_raw = 'ABC-128'`)
ok('elmentve Itt hagyja-ként, a beírt órákkal', { t: 'LEADOS', hoz: '08:30', visz: '16:00' }, f)

console.log('\n=== 4) Szerkesztéskor nincs piros ===\n')
await p.locator('.napi-lista .kartya').filter({ hasText: 'ABC-128' }).first().locator('.kartya-nyit').click()
await p.waitForTimeout(1500)
await p.locator('dialog[aria-label="Munkalap"]').getByRole('button', { name: 'Szerkesztés' }).click()
await p.waitForTimeout(1500)
const mod = p.locator('dialog[aria-label="Időpont módosítása"]')
ok('a mód betöltve, piros keret nincs', ['Itt hagyja', 0],
  [(await mod.locator('.urlap-mikor .valaszto button[aria-pressed="true"]').first().innerText()).trim(), await mod.locator('[data-hianyzik]').count()])
await ctx.close()

console.log('\n=== 5) Telefonon ===\n')
{
  const { ctx, p, belep } = await adminOldal(b, { viewport: { width: 390, height: 844 }, kontextus: { isMobile: true, hasTouch: true }, hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
  await p.locator('.fiok .menu button').filter({ hasText: /^Időpontok$/ }).click(); await p.waitForTimeout(1500)
  await p.locator('.fab').click(); await p.waitForTimeout(1500)
  await kep(p, '04-telefon-ures')
  await p.locator('.urlap-mikor .valaszto button').filter({ hasText: 'Itt hagyja' }).click()
  await p.locator('.urlap-mikor').scrollIntoViewIfNeeded()
  await p.waitForTimeout(300)
  await kep(p, '05-telefon-mikor')
  ok('nem lóg ki', true, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
