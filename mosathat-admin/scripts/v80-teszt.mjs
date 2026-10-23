import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch()
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const CIM = 'http://localhost:5180'

async function oldal(utvonal, viewport) {
  const ctx = await b.newContext({ viewport })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
  await p.goto(CIM + utvonal)
  await p.locator('.kv').waitFor({ timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
  return { ctx, p, hibak }
}

const doboz = (p, sel) => p.locator(sel).first().evaluate((e) => {
  const r = e.getBoundingClientRect()
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }
})
const halvanyak = (p) => p.locator('.kv-tabla thead th').evaluateAll((l) => l.slice(1).map((e) => e.hasAttribute('data-halvany')))
const nyomott = (p, sel) => p.locator(sel).evaluateAll((l) => l.map((e) => e.getAttribute('aria-pressed')))

console.log('=== 1) Két oszlop: táblázat balra, foglalás jobbra ===\n')
const o = await oldal('/publikus', { width: 1440, height: 900 })
const p = o.p
const m = p.locator('.kv-foglalas-elo .fogl')
await m.waitFor({ timeout: 20000 })
const bal = await doboz(p, '.kv-ketoszlop .kv-csomagok')
const jobb = await doboz(p, '.kv-ketoszlop > .kv-foglalas')
const balCim = await doboz(p, '.kv-ketoszlop .kv-csomagok h2')
const jobbCim = await doboz(p, '.kv-ketoszlop > .kv-foglalas h2')
ok('egy sorban, a táblázat balra, a foglalás jobbra', [true, true], [Math.abs(balCim.top - jobbCim.top) < 4, bal.right < jobb.left])
const fej = await doboz(p, '.kv-ketoszlop .kv-szakasz-fej h2')
const alcim = await doboz(p, '.kv-ketoszlop .kv-alcim')
const elit = await doboz(p, '.kv-tabla thead th:last-child')
ok('az alcím a Csomagok címmel egy sorban, jobbra, az Elit oszlop fölött', [true, true, true],
  [Math.abs(fej.bottom - alcim.bottom) < 8, alcim.right <= bal.right + 1, alcim.right > elit.left && alcim.right <= elit.right + 1])
ok('alapból nincs kiválasztott csomag és nincs kiemelés', [[null, null, null].map(() => 'false'), 0, [false, false, false]],
  [await nyomott(p, '.fogl-csomag'), await p.locator('.kv-kiemeles').count(), await halvanyak(p)])
if (KEPEK) {
  await p.evaluate(() => scrollTo(0, document.querySelector('.kv-ketoszlop').getBoundingClientRect().top + scrollY - 70))
  await p.waitForTimeout(300)
  await p.screenshot({ path: join(KEPEK, 'v80-alap.png') })
}

console.log('\n=== 2) Csomagválasztás: kiemelés a táblázatban ===\n')
await m.locator('.fogl-csomag', { has: p.locator('.nev', { hasText: /^Premium$/ }) }).click()
await p.waitForTimeout(700)
ok('a másik két oszlop halványul', [true, false, true], await halvanyak(p))
const halv = await p.locator('.kv-tabla tbody tr:not(.kv-csoport) td').evaluateAll((l) => l.slice(0, 3).map((e) => getComputedStyle(e).opacity))
ok('a cellák is halványulnak, a kiválasztott nem', ['0.4', '1', '0.4'], halv)
const k = await doboz(p, '.kv-kiemeles')
const prem = await doboz(p, '.kv-tabla thead th:nth-child(3)')
const kst = await p.locator('.kv-kiemeles').evaluate((e) => { const s = getComputedStyle(e); return { r: s.borderTopLeftRadius, w: parseFloat(s.borderTopWidth) >= 1 } })
ok('lekerekített keret a Premium oszlop körül, a táblázat aljáig', [true, true, '12px', true],
  [Math.abs(k.left - prem.left) <= 1 && Math.abs(k.width - prem.width) <= 1, k.bottom >= (await doboz(p, '.kv-tabla')).bottom - 1, kst.r, kst.w])
if (KEPEK) await p.screenshot({ path: join(KEPEK, 'v80-premium.png') })

console.log('\n=== 3) Szinkron a táblázat és a foglalás között ===\n')
await p.locator('.kv-tabla thead .kv-csomag-gomb').filter({ hasText: 'Elit' }).click()
await p.waitForTimeout(700)
ok('a táblázat fejlécére kattintva a foglalásban is kiválasztódik', ['false', 'false', 'true'], await nyomott(p, '.fogl-csomag'))
ok('a kiemelés átkerül az Elit oszlopra', [true, true, false], await halvanyak(p))
await m.locator('.fogl-valaszto button').filter({ hasText: 'SUV' }).first().click()
await p.waitForTimeout(500)
ok('a foglalásban választott kategória a táblázatban is átvált', ['false', 'true', 'false'], await nyomott(p, '.kv-kat button'))
ok('a táblázat alcíme is követi', true, /SUV/.test(await p.locator('.kv-ketoszlop .kv-alcim').textContent()))
await p.locator('.kv-kat button').filter({ hasText: 'Személygépjármű' }).click()
await p.waitForTimeout(500)
ok('a táblázatban választott kategória a foglalásban is átvált', 'true',
  await m.locator('.fogl-valaszto button').filter({ hasText: 'Személyautó' }).first().getAttribute('aria-pressed'))

console.log('\n=== 4) Sticky menü és táblázat görgetés közben ===\n')
await m.locator('.fogl-csomag', { has: p.locator('.nev', { hasText: /^Premium$/ }) }).click()
await m.locator('.fogl-valaszto button').filter({ hasText: 'Itt hagyom' }).click(); await p.waitForTimeout(3000)
await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await p.waitForTimeout(1200)
await m.locator('.fogl-idok button').first().click(); await p.waitForTimeout(800)
await p.locator('#fo-nev').scrollIntoViewIfNeeded(); await p.waitForTimeout(500)
const nav = await doboz(p, '.kv-nav')
const lent = await doboz(p, '.kv-ketoszlop .kv-csomagok')
ok('a menü a lap tetején marad', 0, nav.top)
ok('a táblázat a menü alatt jön velem', true, lent.top >= nav.bottom && lent.top <= nav.bottom + 24)
ok('a kiemelés görgetés után is megvan', 1, await p.locator('.kv-kiemeles').count())
if (KEPEK) await p.screenshot({ path: join(KEPEK, 'v80-gorgetve.png') })
await p.evaluate(() => scrollTo(0, document.querySelector('.kv-hely').getBoundingClientRect().top + scrollY - 200))
await p.waitForTimeout(400)
const vege = await doboz(p, '.kv-ketoszlop .kv-csomagok')
const fogVege = await doboz(p, '.kv-ketoszlop')
ok('a foglalás végén a táblázat is megáll, nem lóg rá a térképre', true, vege.bottom <= fogVege.bottom + 1)
await p.locator('.kv-nav nav a').filter({ hasText: 'Csomagok' }).click(); await p.waitForTimeout(1200)
const ugras = await doboz(p, '.kv-ketoszlop .kv-csomagok')
ok('a menü Csomagok linkje a menüsor alá görget', true, ugras.top >= nav.bottom - 1 && ugras.top < nav.bottom + 40)
ok('nincs JS hiba', [], o.hibak)
await o.ctx.close()

console.log('\n=== 5) Keskenyebb kijelzőn egymás alatt, sticky táblázat nélkül ===\n')
const t = await oldal('/publikus', { width: 1024, height: 768 })
await t.p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 20000 })
const tb = await doboz(t.p, '.kv-ketoszlop .kv-csomagok')
const tj = await doboz(t.p, '.kv-ketoszlop > .kv-foglalas')
ok('tableten egymás alatt', true, tj.top >= tb.bottom)
ok('tableten a táblázat nem sticky', 'static', await t.p.locator('.kv-ketoszlop .kv-csomagok').evaluate((e) => getComputedStyle(e).position))
await t.ctx.close()

const tel = await oldal('/publikus', { width: 390, height: 844 })
await tel.p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 20000 })
ok('telefonon sem lóg ki', true, await tel.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
await tel.p.locator('.fogl-csomag', { has: tel.p.locator('.nev', { hasText: /^Premium$/ }) }).click(); await tel.p.waitForTimeout(500)
await tel.p.evaluate(() => scrollTo(0, 1600)); await tel.p.waitForTimeout(300)
ok('telefonon is sticky a menü', 0, (await doboz(tel.p, '.kv-nav')).top)
if (KEPEK) {
  await tel.p.evaluate(() => scrollTo(0, document.querySelector('.kv-csomagok').getBoundingClientRect().top + scrollY - 90))
  await tel.p.waitForTimeout(300)
  await tel.p.screenshot({ path: join(KEPEK, 'v80-telefon.png') })
}
await tel.ctx.close()

console.log('\n=== 6) Jogi oldalak: sticky menü ===\n')
const j = await oldal('/adatvedelem', { width: 1440, height: 900 })
await j.p.evaluate(() => scrollTo(0, 2000)); await j.p.waitForTimeout(300)
ok('az adatvédelmi oldalon is a tetején marad a menü', 0, (await doboz(j.p, '.kv-nav')).top)
await j.ctx.close()

console.log('\n=== 7) Az admin előnézetben a Magazin változatlan ===\n')
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } })
const a = await ctx.newPage()
await a.goto(CIM + '/')
await a.waitForSelector('input[type="email"]', { timeout: 60000 })
await a.fill('input[type="email"]', 'tulaj@mosathat.hu'); await a.fill('input[type="password"]', 'x')
await a.getByRole('button', { name: /Belépés/ }).click(); await a.waitForTimeout(2500)
await a.locator('aside.oldalsav button').filter({ hasText: 'Arculat' }).first().click(); await a.waitForTimeout(1500)
const kod = a.locator('button').filter({ hasText: /^03/ }).first()
if (await kod.count()) { await kod.click(); await a.waitForTimeout(800) }
ok('az előnézetben nincs két oszlop, nincs kattintható fejléc, nincs sticky menü', [0, 0, 'static'],
  [await a.locator('.kv-ketoszlop').count(), await a.locator('.kv-csomag-gomb').count(),
   await a.locator('.kv-nav').first().evaluate((e) => getComputedStyle(e).position)])
await ctx.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
