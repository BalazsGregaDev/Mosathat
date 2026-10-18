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
const sima = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kep = async (p, nev) => { if (KEPEK) { await p.waitForTimeout(200); await p.screenshot({ path: join(KEPEK, nev) }) } }

const FIGYELO = () => {
  window.__fokusz = []
  document.addEventListener('focusin', (e) => {
    const t = e.target
    window.__fokusz.push({
      mezo: t.dataset?.mezo ?? null,
      ideiglenes: t.dataset?.ugrasBillentyu !== undefined,
      inputmode: t.inputMode || null,
      oldal: document.querySelector('.pub-fej h2, .oldal-fej h2')?.textContent ?? null,
    })
  }, true)
}

async function belep(viewport, mobil = false) {
  const ctx = await b.newContext({ viewport, isMobile: mobil, hasTouch: mobil, deviceScaleFactor: mobil ? 2 : 1 })
  await ctx.addInitScript(FIGYELO)
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push((e.stack ?? e.message).slice(0, 300)))
  await p.goto(CIM + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  if (mobil) await p.locator('.mobil-fejlec .hamburger').waitFor({ timeout: 30000 })
  else await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).waitFor({ timeout: 30000 })
  return { ctx, p, hibak }
}

const menuPont = (p, nev) => p.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${nev}$`) })
async function menu(p, nev, mobil = false) {
  if (mobil) {
    await p.locator('.mobil-fejlec .hamburger').click()
    await p.locator('aside.fiok .menu button').filter({ hasText: new RegExp(`^${nev}$`) }).click()
  } else {
    await menuPont(p, nev).click()
  }
}
const sugo = (p, id) => p.locator(`.pub-sugo[data-sugo="${id}"]`)
const valtozo = (p, id, nev) => sugo(p, id).locator(`[data-valtozo="${nev}"]`)
async function nyit(p, id) {
  const s = sugo(p, id)
  if (!(await s.evaluate((d) => d.open))) await s.locator('summary').click()
}
const aktiv = (p) => p.evaluate(() => {
  const e = document.activeElement
  return {
    mezo: e?.dataset?.mezo ?? null,
    nap: e?.dataset?.nap ?? null,
    tag: e?.tagName ?? null,
    kijelolve: e instanceof HTMLInputElement && e.type !== 'number' && e.type !== 'time' && e.type !== 'email'
      ? [e.selectionStart, e.selectionEnd, e.value.length] : null,
  }
})
const kiemeltek = (p) => p.locator('[data-ugras]').evaluateAll((l) => l.map((e) => `${e.dataset.mezo ?? e.tagName}${e.dataset.nap ? `:${e.dataset.nap}` : ''}`))
const visszaGomb = (p) => p.locator('.ugras-vissza:visible')
const fokuszNaplo = async (p) => { const n = await p.evaluate(() => window.__fokusz); await p.evaluate(() => { window.__fokusz = [] }); return n }
const varTartalom = async (p) => p.locator('.pub-szoveg').first().waitFor({ timeout: 20000 })

console.log('=== 1) Tartalom: a súgó nyolc helyen, lenyitható formában ===\n')
const a = await belep({ width: 1500, height: 1000 })
const p = a.p
await menuPont(p, 'Tartalom').click()
await varTartalom(p)
const helyek = await p.locator('.pub-sugo').evaluateAll((l) => l.map((e) => [e.dataset.sugo, e.nextElementSibling?.dataset?.sav ?? e.nextElementSibling?.className]))
ok('a súgó a lap tetején és a kért sávok előtt áll',
  [['fent', 'pub-keres'], ['csomagok', 'csomagok'], ['fogl-1', 'fogl-1'], ['fogl-3', 'fogl-3'], ['fogl-5fs', 'fogl-5fs'],
   ['fogl-8', 'fogl-8'], ['fogl-siker', 'fogl-siker'], ['lab', 'lab']], helyek)
ok('alapból mind csukva van', [false], [...new Set(await p.locator('.pub-sugo').evaluateAll((l) => l.map((e) => e.open)))])
await nyit(p, 'fogl-8')
const chipek = await sugo(p, 'fogl-8').locator('.pub-valtozo-csoport').evaluateAll((l) => l.map((c) => [
  c.querySelector('.pub-valtozo-cim').textContent, [...c.querySelectorAll('[data-valtozo]')].map((x) => x.dataset.valtozo)]))
ok('az adatok kattinthatók, a módosítás helye szerint csoportosítva', [
  ['Az Elérhetőség menüben módosítható', ['nev', 'telefon', 'email', 'irsz', 'cim', 'haz', 'szint', 'bejarat', 'kerulet']],
  ['A Beállítások menüben módosítható', ['nyitvatartas', 'nyitas', 'zaras', 'leadas', 'lemondas_ora']],
], chipek)
ok('minden adat gomb, mellette az aktuális érték', ['BUTTON', '+36 1 506 0420'],
  [await valtozo(p, 'fogl-8', 'telefon').evaluate((e) => e.tagName), sima(await valtozo(p, 'fogl-8', 'telefon').locator('span').textContent())])
await sugo(p, 'fogl-8').scrollIntoViewIfNeeded()
await kep(p, '01-sugo-8-lepes-elott.png')

console.log('\n=== 2) Impresszum és Adatvédelem linkje nem szerkeszthető ===\n')
ok('121 szöveg, 18 sáv, a lábléc sávban nincs linkszöveg', [121, 18, 0, 0], [
  await p.locator('.pub-szoveg').count(), await p.locator('.pub-sav').count(),
  await p.locator('.pub-szoveg[data-kulcs="lab.impresszum"]').count(), await p.locator('.pub-szoveg[data-kulcs="lab.adatvedelem"]').count(),
])
ok('a lábléc-előnézetben a két link változatlanul ott van', ['Impresszum', 'Adatvédelmi tájékoztató'],
  await p.locator('.pub-sav[data-sav="lab"] .kv-lab-also nav a').allTextContents())

console.log('\n=== 3) Asztali gép: {telefon} az Elérhetőségbe visz, kijelölt mezővel ===\n')
await p.locator('.pub-szoveg[data-kulcs="hero.felcim"] input').fill('Piszkozat, még nincs mentve')
await fokuszNaplo(p)
await valtozo(p, 'fogl-8', 'telefon').click()
await p.locator('.pub-fej h2').filter({ hasText: 'Elérhetőség' }).waitFor({ timeout: 10000 })
await p.waitForFunction(() => document.activeElement?.dataset?.mezo === 'telefon', null, { timeout: 10000 })
ok('az Elérhetőség menüpont nyílt meg', 'page', await menuPont(p, 'Elérhetőség').getAttribute('aria-current'))
ok('a Telefonszám mező fókuszban, a teljes szöveg kijelölve', { mezo: 'telefon', nap: null, tag: 'INPUT', kijelolve: [0, 14, 14] }, await aktiv(p))
ok('a mező ki van emelve', ['telefon'], await kiemeltek(p))
ok('asztali gépen nincs ideiglenes mező (nincs virtuális billentyűzet)', [false], [...new Set((await fokuszNaplo(p)).map((f) => f.ideiglenes))])
ok('a fejlécben ott a Vissza a Tartalomhoz gomb', 1, await visszaGomb(p).count())
await kep(p, '02-asztali-telefon-mezo.png')
await p.keyboard.type('+36 30 123 4567')
await p.locator('.pub-fej').getByRole('button', { name: 'Mentés' }).click()
await p.locator('.pub-mentve').waitFor({ timeout: 10000 })
await p.locator('.pub-fej h2').click()
ok('kattintás máshová: a kiemelés eltűnik', [], await kiemeltek(p))

console.log('\n=== 4) Vissza a Tartalomhoz: ugyanoda, a piszkozat megmaradt ===\n')
await visszaGomb(p).click()
await varTartalom(p)
await p.waitForTimeout(1300)
const s8 = await sugo(p, 'fogl-8').evaluate((e) => {
  const fej = document.querySelector('.pub-fej').getBoundingClientRect().bottom
  const r = e.getBoundingClientRect()
  return { nyitva: e.open, aFejlecAlatt: r.top >= fej - 1 && r.top <= fej + 40 }
})
ok('a 8. lépés előtti súgó nyitva, a fejléc alatt látszik', { nyitva: true, aFejlecAlatt: true }, s8)
ok('a {telefon} gomb fókuszban, már az új számmal', ['telefon', '+36 30 123 4567'], [
  await p.evaluate(() => document.activeElement?.dataset?.valtozo), sima(await valtozo(p, 'fogl-8', 'telefon').locator('span').textContent())])
ok('a nem mentett szöveg megmaradt', ['Piszkozat, még nincs mentve', 'Nem mentett változás'], [
  await p.locator('.pub-szoveg[data-kulcs="hero.felcim"] input').inputValue(), sima(await p.locator('.pub-valtozott').textContent())])
ok('a Vissza gomb eltűnt', 0, await visszaGomb(p).count())
await kep(p, '03-vissza-a-tartalomhoz.png')

console.log('\n=== 5) {leadas}: Beállítások, Általános fül ===\n')
await nyit(p, 'fogl-3')
await valtozo(p, 'fogl-3', 'leadas').click()
await p.waitForFunction(() => document.activeElement?.dataset?.mezo === 'leadas', null, { timeout: 10000 })
ok('az Általános fül nyílt meg, a Leadás mező fókuszban és kiemelve', ['Általános', 'leadas', ['leadas']], [
  sima(await p.locator('.fulek button.aktiv').textContent()), (await aktiv(p)).mezo, await kiemeltek(p)])
await kep(p, '04-asztali-leadas.png')
await visszaGomb(p).click()
await varTartalom(p)

console.log('\n=== 6) {nyitas}: a hét beosztása, a fő szakasz összes napja kiemelve ===\n')
await nyit(p, 'fent')
await valtozo(p, 'fent', 'nyitas').click()
await p.waitForFunction(() => document.activeElement?.dataset?.mezo === 'nyitas', null, { timeout: 10000 })
ok('Nyitvatartás fül, hétfő nyitás fókuszban', ['Nyitvatartás', 'nyitas', '1'], [
  sima(await p.locator('.fulek button.aktiv').textContent()), (await aktiv(p)).mezo, (await aktiv(p)).nap])
ok('hétfőtől péntekig mind az öt nyitás-mező kiemelve', ['nyitas:1', 'nyitas:2', 'nyitas:3', 'nyitas:4', 'nyitas:5'], await kiemeltek(p))
await kep(p, '05-asztali-nyitas.png')
await visszaGomb(p).click()
await varTartalom(p)

console.log('\n=== 7) {nyitvatartas} és {lemondas_ora} ===\n')
await nyit(p, 'lab')
await valtozo(p, 'lab', 'nyitvatartas').click()
await p.waitForFunction(() => document.activeElement?.dataset?.mezo === 'nyitas', null, { timeout: 10000 })
ok('{nyitvatartas}: az egész heti panel kiemelve, a hétfő nyitás fókuszban', [['nyitvatartas'], '1'], [await kiemeltek(p), (await aktiv(p)).nap])
await kep(p, '06-asztali-nyitvatartas.png')
await visszaGomb(p).click()
await varTartalom(p)
await nyit(p, 'csomagok')
await valtozo(p, 'csomagok', 'lemondas_ora').click()
await p.waitForFunction(() => document.activeElement?.dataset?.mezo === 'lemondas_ora', null, { timeout: 10000 })
const szamMezo = await p.evaluate(() => {
  const e = document.activeElement
  return [e.type, window.getSelection()?.toString() ?? '', e.value]
})
ok('{lemondas_ora}: az online lemondás mezője fókuszban, Általános fülön', ['Általános', 'number'], [
  sima(await p.locator('.fulek button.aktiv').textContent()), szamMezo[0]])
await menuPont(p, 'Időpontok').click()
await p.waitForTimeout(300)
ok('menüből máshová lépve eltűnik a Vissza gomb', 0, await visszaGomb(p).count())
await menuPont(p, 'Beállítások').click()
await p.waitForTimeout(500)
ok('a Beállítások menüből megnyitva ismét a Nyitvatartás fül az alap', 'Nyitvatartás', sima(await p.locator('.fulek button.aktiv').textContent()))
ok('nincs futásidejű hiba', [], a.hibak)
await a.ctx.close()

console.log('\n=== 8) Telefonon: a billentyűzet már a koppintáskor megnyílik ===\n')
const m = await belep({ width: 390, height: 844 }, true)
const t = m.p
await menu(t, 'Tartalom', true)
await varTartalom(t)
await nyit(t, 'csomagok')
await sugo(t, 'csomagok').scrollIntoViewIfNeeded()
await kep(t, '07-telefon-sugo.png')
await fokuszNaplo(t)
await valtozo(t, 'csomagok', 'email').tap()
await t.waitForFunction(() => document.activeElement?.dataset?.mezo === 'email', null, { timeout: 10000 })
const naplo = await fokuszNaplo(t)
const elso = naplo.find((f) => f.ideiglenes)
ok('a koppintás pillanatában (még a Tartalom oldalon) egy e-mail billentyűzetes mező kap fókuszt',
  { inputmode: 'email', oldal: 'Tartalom' }, { inputmode: elso?.inputmode, oldal: elso?.oldal })
ok('utána a fókusz átkerül az Elérhetőség e-mail mezőjére (a billentyűzet nyitva marad)', { mezo: 'email', oldal: 'Elérhetőség' },
  { mezo: naplo.at(-1)?.mezo, oldal: naplo.at(-1)?.oldal })
ok('az ideiglenes mező eltűnt az oldalról', 0, await t.locator('[data-ugras-billentyu]').count())
ok('a mobil fejlécben ott a Vissza a Tartalomhoz gomb', ['Elérhetőség', 1], [sima(await t.locator('.mobil-fejlec .nap').textContent()), await visszaGomb(t).count()])
await kep(t, '08-telefon-email-mezo.png')
await visszaGomb(t).tap()
await varTartalom(t)
await t.waitForTimeout(1300)
ok('vissza: ugyanaz a súgó nyitva', true, await sugo(t, 'csomagok').evaluate((e) => e.open))

console.log('\n=== 9) Telefonon: {zaras} az időválasztót nyitja meg ===\n')
await fokuszNaplo(t)
await valtozo(t, 'csomagok', 'zaras').tap()
await t.locator('.ido-fedo').waitFor({ timeout: 10000 })
ok('időmezőnél nincs ideiglenes billentyűzet, helyette megnyílik a választó', [false, 'Hétfő zárás'], [
  (await fokuszNaplo(t)).some((f) => f.ideiglenes), sima(await t.locator('.ido-fedo .ido-cim').textContent())])
ok('a háttérben mind az öt zárás-mező kiemelve', ['zaras:1', 'zaras:2', 'zaras:3', 'zaras:4', 'zaras:5'], await kiemeltek(t))
await kep(t, '09-telefon-zaras-valaszto.png')
await t.locator('.ido-fedo').getByRole('button', { name: 'Kész' }).tap()
await t.waitForTimeout(300)
ok('a választó bezárása után a kiemelés még látszik', 5, (await kiemeltek(t)).length)
await kep(t, '10-telefon-zaras-utana.png')
await visszaGomb(t).tap()
await varTartalom(t)

console.log('\n=== 10) Telefonon: {lemondas_ora} számbillentyűzettel ===\n')
await nyit(t, 'fogl-siker')
await fokuszNaplo(t)
await valtozo(t, 'fogl-siker', 'lemondas_ora').tap()
await t.waitForFunction(() => document.activeElement?.dataset?.mezo === 'lemondas_ora', null, { timeout: 10000 })
const n2 = await fokuszNaplo(t)
const elso2 = n2.find((f) => f.ideiglenes)
ok('számbillentyűzetes ideiglenes mező, majd a lemondási óra mezője', ['numeric', 'Tartalom', 'lemondas_ora'],
  [elso2?.inputmode, elso2?.oldal, n2.at(-1)?.mezo])
await kep(t, '11-telefon-lemondas.png')
ok('nincs futásidejű hiba', [], m.hibak)
await m.ctx.close()

console.log('\n=== 11) Publikus oldal: a jogi linkek szövege rögzített ===\n')
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const q = await ctx.newPage()
  await q.goto(CIM + '/publikus')
  await q.locator('.kv-lab').waitFor({ timeout: 60000 })
  ok('a láblécben Impresszum és Adatvédelmi tájékoztató', ['Impresszum', 'Adatvédelmi tájékoztató'], await q.locator('.kv-lab-also nav a').allTextContents())
  await q.goto(CIM + '/adatvedelem')
  await q.locator('.kv-jogi h1').waitFor({ timeout: 60000 })
  ok('a jogi oldal címe és a böngészőfül', ['Adatvédelmi tájékoztató', true], [
    sima(await q.locator('.kv-jogi h1').textContent()), (await q.title()).startsWith('Adatvédelmi tájékoztató — ')])
  await ctx.close()
}

console.log(`\n${baj ? `${baj} HIBA` : 'MINDEN RENDBEN'}`)
await b.close()
process.exit(baj ? 1 : 0)
