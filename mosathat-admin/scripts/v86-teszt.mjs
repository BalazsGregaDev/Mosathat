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
const kep = async (p, nev, opts = {}) => { if (KEPEK) await p.screenshot({ path: join(KEPEK, nev), ...opts }) }

async function publikus(viewport) {
  const ctx = await b.newContext({ viewport })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  await p.goto(CIM + '/publikus')
  await p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
  return { ctx, p, hibak }
}

const villan = (p, sel) => p.locator(sel).first().evaluate((e) => {
  const s = getComputedStyle(e, '::after')
  return { van: e.hasAttribute('data-felvillan'), opacity: Number(s.opacity).toFixed(1), sugar: s.borderTopLeftRadius, keret: parseFloat(s.borderTopWidth) >= 1 }
})

console.log('=== 1) Publikus menü: Hol vagyunk nélkül ===\n')
const a = await publikus({ width: 1440, height: 900 })
const p = a.p
ok('a menüben Csomagok, Foglalás, Kapcsolat', ['Csomagok', 'Foglalás', 'Kapcsolat'], (await p.locator('.kv-nav nav a').allTextContents()).map(sima))
ok('a Hol vagyunk szakasz maga megmaradt (térkép, cím)', [1, 'Hol vagyunk'], [await p.locator('.kv-hely .kv-terkep').count(), sima(await p.locator('.kv-hely h2').textContent())])

console.log('\n=== 2) Menüpontra kattintva a szakasz címe felvillan ===\n')
for (const [menu, sel, nev] of [
  ['Csomagok', '.kv-csomagok h2', '01-felvillan-csomagok.png'],
  ['Foglalás', '.kv-foglalas h2', '02-felvillan-foglalas.png'],
  ['Kapcsolat', '.kv-lab [data-kapcsolat] > .kv-cimke', '03-felvillan-kapcsolat.png'],
]) {
  await p.locator('.kv-nav nav a').filter({ hasText: menu }).click()
  await p.waitForTimeout(150)
  const elso = await villan(p, sel)
  await p.waitForTimeout(850)
  const kozep = await villan(p, sel)
  await kep(p, nev)
  await p.waitForTimeout(2400)
  const vege = await villan(p, sel)
  ok(`${menu}: előjön, a csomagkiemeléssel azonos keret (12 px sugár), kb. 3 mp után eltűnik`,
    { indul: true, halvanyabb: true, kozep: '1.0', sugar: '12px', keret: true, vege: false },
    { indul: elso.van, halvanyabb: Number(elso.opacity) < 1, kozep: kozep.opacity, sugar: kozep.sugar, keret: kozep.keret, vege: vege.van })
  await p.evaluate(() => scrollTo(0, 0))
}
const premium = await p.evaluate(() => {
  const r = document.createElement('span')
  r.className = 'kv-kiemeles'
  document.querySelector('.kv-tabla-gorgo').appendChild(r)
  const s = getComputedStyle(r)
  const ki = [s.borderTopColor, s.backgroundColor, s.borderTopLeftRadius]
  r.remove()
  return ki
})
await p.locator('.kv-nav nav a').filter({ hasText: 'Csomagok' }).click()
await p.waitForTimeout(1000)
const cimStilus = await p.locator('.kv-csomagok h2').evaluate((e) => { const s = getComputedStyle(e, '::after'); return [s.borderTopColor, s.backgroundColor, s.borderTopLeftRadius] })
ok('ugyanaz a szín, háttér és sugár, mint a kiválasztott csomag oszlopának kerete', premium, cimStilus)
await p.waitForTimeout(500)
await p.locator('.kv-nav nav a').filter({ hasText: 'Csomagok' }).click()
await p.waitForTimeout(400)
ok('újrakattintva újraindul', true, (await villan(p, '.kv-csomagok h2')).van)
await p.waitForTimeout(3200)
await p.locator('.kv-lab .kv-link').filter({ hasText: 'Időpontot kérek' }).click()
await p.waitForTimeout(900)
ok('a lábléc Időpontot kérek linkje is felvillantja a Foglalás címét', true, (await villan(p, '.kv-foglalas h2')).van)
ok('nincs futásidejű hiba', [], a.hibak)
await a.ctx.close()

{
  const t = await publikus({ width: 390, height: 844 })
  await t.p.locator('.kv-nav nav a').filter({ hasText: 'Foglalás' }).click()
  await t.p.waitForTimeout(1000)
  ok('telefonon is: Foglalás cím kiemelve', true, (await villan(t.p, '.kv-foglalas h2')).van)
  await kep(t.p, '04-felvillan-telefon.png')
  await t.ctx.close()
}

console.log('\n=== 3) Admin oldalsáv: igazodik az ablak magasságához ===\n')
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } })
const q = await ctx.newPage()
const hibak = []
q.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await q.goto(CIM + '/')
await q.waitForSelector('input[type="email"]', { timeout: 60000 })
await q.fill('input[type="email"]', 'tulaj@mosathat.hu'); await q.fill('input[type="password"]', 'x')
await q.getByRole('button', { name: /Belépés/ }).click()
await q.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).waitFor({ timeout: 30000 })
for (const h of [1000, 860, 760, 700, 657, 620]) {
  await q.setViewportSize({ width: 1400, height: h })
  await q.waitForTimeout(200)
  const m = await q.evaluate(() => {
    const menu = document.querySelector('aside.oldalsav .menu')
    const gombok = [...menu.querySelectorAll('button')]
    const utolso = gombok.at(-1).getBoundingClientRect()
    const ki = [...document.querySelectorAll('aside.oldalsav .ki')].at(-1).getBoundingClientRect()
    return {
      menuGorget: menu.scrollHeight > menu.clientHeight + 1,
      oldalGorget: document.scrollingElement.scrollHeight > innerHeight + 1,
      utolsoLatszik: utolso.bottom <= menu.getBoundingClientRect().bottom + 1,
      kilepesLatszik: ki.bottom <= innerHeight,
      gomb: Math.round(gombok[0].getBoundingClientRect().height),
    }
  })
  ok(`${h} px magas ablak: minden menüpont és a Kilépés is látszik, semmit nem kell görgetni (gombmagasság: ${m.gomb} px)`,
    { menuGorget: false, oldalGorget: false, utolsoLatszik: true, kilepesLatszik: true },
    { menuGorget: m.menuGorget, oldalGorget: m.oldalGorget, utolsoLatszik: m.utolsoLatszik, kilepesLatszik: m.kilepesLatszik })
  if (h === 700) await kep(q, '05-admin-700px.png')
}
await q.setViewportSize({ width: 1400, height: 700 })
await q.locator('aside.oldalsav .menu button').filter({ hasText: /^Ügyfelek$/ }).click()
await q.waitForTimeout(800)
const fo = await q.evaluate(() => ({
  tartalom: Math.round(document.querySelector('main.tartalom').getBoundingClientRect().bottom),
  oldalsav: Math.round(document.querySelector('aside.oldalsav').getBoundingClientRect().height),
}))
ok('a tartalom és az oldalsáv sem lóg ki az ablakból (700 px)', { tartalom: 700, oldalsav: 700 }, fo)
await q.setViewportSize({ width: 1400, height: 1000 })

console.log('\n=== 4) Tartalom: magyarázat a kapcsos zárójeles adatok alatt ===\n')
await q.locator('aside.oldalsav .menu button').filter({ hasText: /^Tartalom$/ }).click()
await q.locator('.pub-szoveg').first().waitFor({ timeout: 20000 })
const magy = (k) => q.locator(`.pub-szoveg[data-kulcs="${k}"] .pub-valtozo-magyarazat li`).allTextContents().then((l) => l.map(sima))
ok('112 szöveg (a menü Hol vagyunk pontja is kikerült)', [112, 0], [await q.locator('.pub-szoveg').count(), await q.locator('.pub-szoveg[data-kulcs="menu.hely"]').count()])
ok('a menü-előnézetben is három pont', ['Csomagok', 'Foglalás', 'Kapcsolat'], (await q.locator('.pub-sav[data-sav="menu"] .kv-nav nav a').allTextContents()).map(sima))
const elvitel = await magy('foglalas.siker_elvitel')
ok('Köszönő üzenet: elvitel  →  {mikor} = …', [1, true], [elvitel.length, /^\{mikor\} = az elvitel napja és időablaka, például: .+, 8:00 és 17:00 között$/.test(elvitel[0])])
ok('közös adat a mostani értékével', ['{kerulet} = kerület, most: Budapest XIII.'], await magy('hero.felcim'))
ok('több adat egy mezőben, a szöveg sorrendjében', ['{nyitas} = nyitás, most: 9:00', '{zaras} = zárás, most: 17:00', '{leadas} = legkorábbi leadás, most: 7:15', '{bejarat} = bejárat, most: Dagály utca felől'],
  await magy('hero.mellek'))
ok('kapcsos zárójel nélküli mezőnél nincs magyarázat', 0, await q.locator('.pub-szoveg[data-kulcs="csomagok.cim"] .pub-valtozo-magyarazat').count())
const fs = q.locator('.pub-szoveg[data-kulcs="foglalas.fs_csomaggal"] input')
await fs.fill('a csomag mellé')
ok('ha kiveszed, jelzi, hogy használható', ['Használható: {csomag} = a kiválasztott csomag neve, például: Premium'], await magy('foglalas.fs_csomaggal'))
await fs.fill('{csomag} és {ar} együtt')
const ism = await magy('foglalas.fs_csomaggal')
ok('ismeretlen adatnál figyelmeztet', ['{csomag} = a kiválasztott csomag neve, például: Premium', '{ar} = nincs ilyen adat, a publikus oldalon kapcsos zárójellel együtt, változatlanul jelenne meg.'], ism)
await q.locator('.pub-szoveg[data-kulcs="foglalas.siker_elvitel"]').scrollIntoViewIfNeeded()
await q.waitForTimeout(300)
await kep(q, '06-magyarazat-elvitel.png')
await q.locator('.pub-szoveg[data-kulcs="foglalas.fs_csomaggal"]').scrollIntoViewIfNeeded()
await q.waitForTimeout(300)
await kep(q, '07-magyarazat-ismeretlen.png')

console.log('\n=== 5) A magyarázatban a közös adat is kattintható ===\n')
const erkezes = q.locator('.pub-szoveg[data-kulcs="foglalas.erkezes"]')
await erkezes.scrollIntoViewIfNeeded()
ok('{telefon} gomb a 6–7. lépés tájékoztatójánál', '{telefon}', sima(await erkezes.locator('[data-valtozo-link="telefon"]').textContent()))
await erkezes.locator('[data-valtozo-link="telefon"]').click()
await q.waitForFunction(() => document.activeElement?.dataset?.mezo === 'telefon', null, { timeout: 10000 })
ok('az Elérhetőség Telefonszám mezője fókuszban', 'page', await q.locator('aside.oldalsav .menu button').filter({ hasText: /^Elérhetőség$/ }).getAttribute('aria-current'))
await q.locator('.ugras-vissza:visible').click()
await q.locator('.pub-szoveg').first().waitFor({ timeout: 20000 })
await q.waitForTimeout(1300)
const vissza = await q.evaluate(() => {
  const e = document.querySelector('.pub-szoveg[data-kulcs="foglalas.erkezes"]').getBoundingClientRect()
  return { lathato: e.top >= 0 && e.bottom <= innerHeight, fokusz: document.activeElement?.dataset?.valtozoLink ?? null }
})
ok('vissza: ugyanannál a mezőnél, a {telefon} gombon a fókusz', { lathato: true, fokusz: 'telefon' }, vissza)
ok('a nem mentett módosítás megmaradt', '{csomag} és {ar} együtt', await q.locator('.pub-szoveg[data-kulcs="foglalas.fs_csomaggal"] input').inputValue())
await kep(q, '08-vissza-a-mezohoz.png')
ok('nincs futásidejű hiba', [], hibak)
await ctx.close()

console.log(`\n${baj ? `${baj} HIBA` : 'MINDEN RENDBEN'}`)
await b.close()
process.exit(baj ? 1 : 0)
