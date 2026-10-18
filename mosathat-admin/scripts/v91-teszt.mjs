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
const DEMO = 'http://localhost:5180'
const sima = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kep = async (p, nev, opts = {}) => { if (KEPEK) { await p.waitForTimeout(300); await p.screenshot({ path: join(KEPEK, nev), ...opts }) } }

async function oldal(ut, opts = { viewport: { width: 1440, height: 900 } }) {
  const ctx = await b.newContext(opts)
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  await p.goto(DEMO + ut)
  await p.locator('.kv-lab').waitFor({ timeout: 60000 })
  if (ut.startsWith('/publikus')) await p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 30000 })
  await p.evaluate(() => document.fonts.ready)
  return { ctx, p, hibak }
}
const aktiv = (p, hol = '.kv-nav nav') => p.locator(`${hol} a[aria-current]`).allTextContents().then((l) => l.map(sima))
const ide = async (p, sel, fent = 140) => {
  await p.locator(sel).first().evaluate((e, f) => scrollTo(0, e.getBoundingClientRect().top + scrollY - f), fent)
  await p.waitForTimeout(450)
}

console.log('=== 1) A menü a főoldal minden szakaszát tartalmazza, az oldal sorrendjében ===\n')
const a = await oldal('/publikus')
{
  const p = a.p
  ok('Rólunk, Galéria, Csomagok, Foglalás, Kapcsolat', ['Rólunk', 'Galéria', 'Csomagok', 'Foglalás', 'Kapcsolat'], (await p.locator('.kv-nav nav a').allTextContents()).map(sima))
  const sor = await p.evaluate(() => ['.kv-rolunk', '.kv-galeria', '.kv-csomagok', '.kv-foglalas', '.kv-lab'].map((s) => document.querySelector(s).getBoundingClientRect().top))
  ok('a menüpontok sorrendje megegyezik a szakaszok sorrendjével az oldalon', true, sor.slice(0, 3).every((y, i) => i === 0 || y > sor[i - 1]) && sor[4] > sor[3])
  for (const [menu, cim] of [['Rólunk', '.kv-rolunk h2'], ['Galéria', '.kv-galeria h2']]) {
    await p.locator('.kv-nav nav a').filter({ hasText: menu }).click()
    await p.waitForTimeout(1300)
    const m = await p.evaluate(([s]) => {
      const h = document.querySelector(s).getBoundingClientRect()
      const nav = document.querySelector('.kv-nav').getBoundingClientRect()
      return { lathato: h.top >= nav.bottom && h.bottom <= innerHeight, villan: document.querySelector(s).hasAttribute('data-felvillan') }
    }, [cim])
    ok(`${menu}: odagörget, a cím látszik a navbar alatt és felvillan`, { lathato: true, villan: true }, m)
    ok(`${menu}: a menüpont aktív`, [menu], await aktiv(p))
  }
  await kep(p, '01-galeria-menu.png')
}

console.log('\n=== 2) Görgetés közben a menü követi, melyik szakasznál jársz ===\n')
{
  const p = a.p
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(450)
  ok('a lap tetején egyik sem aktív', [], await aktiv(p))
  await ide(p, '.kv-rolunk h2')
  ok('Rólunknál a Rólunk', ['Rólunk'], await aktiv(p))
  await ide(p, '.kv-galeria')
  ok('Galériánál a Galéria', ['Galéria'], await aktiv(p))
  await ide(p, '.kv-ketoszlop', 100)
  ok('a két hasábos részen a Csomagok és a Foglalás is (egyszerre látszanak)', ['Csomagok', 'Foglalás'], await aktiv(p))
  await ide(p, '.kv-hely')
  ok('Hol vagyunknál a Kapcsolat (ugyanaz az információ)', ['Kapcsolat'], await aktiv(p))
  await p.evaluate(() => scrollTo(0, 99999)); await p.waitForTimeout(450)
  ok('a lap alján a Kapcsolat', ['Kapcsolat'], await aktiv(p))
  const st = await p.locator('.kv-nav nav a[aria-current]').first().evaluate((e) => ({ alahuzas: getComputedStyle(e, '::after').transform !== 'matrix(0, 0, 0, 1, 0, 0)', szin: getComputedStyle(e).color }))
  const halvany = await p.locator('.kv-nav nav a:not([aria-current])').first().evaluate((e) => getComputedStyle(e).color)
  ok('az aktív menüpont sötétebb és alá van húzva', [true, true], [st.alahuzas, st.szin !== halvany])
  await kep(p, '02-kapcsolat-aktiv.png', { clip: { x: 700, y: 0, width: 740, height: 70 } })
}

console.log('\n=== 3) Lábléc: a fénycsík követi az egeret ===\n')
{
  const p = a.p
  await p.evaluate(() => scrollTo(0, 99999)); await p.waitForTimeout(400)
  const f = await p.locator('.kv-lab').boundingBox()
  ok('egér nélkül nem látszik a csík', '0', await p.locator('.kv-lab').evaluate((e) => getComputedStyle(e, '::after').opacity))
  const pozicio = async (x, y) => {
    await p.mouse.move(f.x + f.width * x, f.y + f.height * y, { steps: 6 })
    await p.waitForTimeout(450)
    return p.locator('.kv-lab').evaluate((e) => {
      const m = new DOMMatrix(getComputedStyle(e, '::after').transform)
      return { x: Math.round(parseFloat(e.style.getPropertyValue('--eger-x'))), csik: Math.round(m.e), lathato: getComputedStyle(e, '::after').opacity === '1', eger: e.hasAttribute('data-eger') }
    })
  }
  const bal = await pozicio(0.25, 0.5)
  await kep(p, '03-lablec-bal.png')
  const jobb = await pozicio(0.7, 0.4)
  await kep(p, '04-lablec-jobb.png')
  ok('a csík ott van, ahol az egér, és vele mozog', [true, true, true, true],
    [bal.lathato && jobb.lathato, Math.abs(bal.x - Math.round(f.width * 0.25)) <= 2, Math.abs(jobb.x - Math.round(f.width * 0.7)) <= 2, jobb.csik - bal.csik > f.width * 0.4])
  ok('enyhén dőlt (ferde fénycsík)', true, await p.locator('.kv-lab').evaluate((e) => Math.abs(new DOMMatrix(getComputedStyle(e, '::after').transform).c) > 0.2))
  await p.mouse.move(f.x + f.width * 0.5, f.y - 200)
  await p.waitForTimeout(500)
  ok('kivíve az egeret elhalványul', [false, '0'], [await p.locator('.kv-lab').evaluate((e) => e.hasAttribute('data-eger')), await p.locator('.kv-lab').evaluate((e) => getComputedStyle(e, '::after').opacity)])
  ok('a Rólunk sáv csillanása továbbra is görgetésre megy', true, Number(await p.locator('.kv-rolunk').evaluate((e) => e.style.getPropertyValue('--feny'))) > 0)
}

console.log('\n=== 4) Kisebb galéria ===\n')
{
  const p = a.p
  await ide(p, '.kv-galeria', 80)
  const m = await p.evaluate(() => {
    const k = document.querySelector('.kv-moso').getBoundingClientRect()
    const c = document.querySelector('.kv-galeria h2').getBoundingClientRect()
    const e = document.querySelector('.kv-galeria-eszkozok').getBoundingClientRect()
    const r = document.querySelector('.kv-galeria-racs').getBoundingClientRect()
    return { szel: Math.round(k.width), mag: Math.round(k.height), jobbra: k.left > c.right, eszkozBalra: e.right < r.left, racsMag: Math.round(r.height) }
  })
  ok('asztali gépen a képek jobbra, kb. 410×256 px-esek (eddig 689×430); a cím, a leírás és a vezérlők balra', [true, true, true, true, true],
    [m.szel <= 430, m.szel >= 380, m.jobbra, m.eszkozBalra, m.racsMag < 560])
  ok('továbbra is 2×2', 2, await p.locator('.kv-galeria-racs').evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length))
  ok('nincs futásidejű hiba', [], a.hibak)
  await a.ctx.close()
}

console.log('\n=== 5) Tableten és telefonon ===\n')
{
  const t = await oldal('/publikus', { viewport: { width: 900, height: 1000 } })
  const m = await t.p.evaluate(() => {
    const l = [...document.querySelectorAll('.kv-nav nav a')].map((a) => a.getBoundingClientRect())
    return { egySor: new Set(l.map((r) => Math.round(r.top))).size === 1, belefer: Math.max(...l.map((r) => r.right)) <= innerWidth - 16 }
  })
  ok('tableten (900 px) mind az öt menüpont egy sorban elfér', { egySor: true, belefer: true }, m)
  await ide(t.p, '.kv-galeria', 80)
  ok('tableten a galéria legfeljebb 680 px széles', true, (await t.p.locator('.kv-galeria-racs').evaluate((e) => e.getBoundingClientRect().width)) <= 681)
  await t.ctx.close()

  const f = await oldal('/publikus', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const p = f.p
  await ide(p, '.kv-galeria', 60)
  await p.locator('.kv-menu-gomb').tap(); await p.waitForTimeout(400)
  ok('a hamburger menüben is mind az öt, a Galéria kiemelve', [['Rólunk', 'Galéria', 'Csomagok', 'Foglalás', 'Kapcsolat'], ['Galéria']],
    [(await p.locator('.kv-menu-panel nav a').allTextContents()).map(sima), await aktiv(p, '.kv-menu-panel nav')])
  await kep(p, '05-telefon-menu.png')
  await p.locator('.kv-menu-panel nav a').filter({ hasText: 'Rólunk' }).tap(); await p.waitForTimeout(1300)
  ok('telefonon a Rólunkra ugrik, és az lesz aktív', [true, ['Rólunk']],
    [await p.locator('.kv-rolunk h2').evaluate((e) => e.hasAttribute('data-felvillan')), await aktiv(p, '.kv-menu-panel nav')])
  const lab = await p.locator('.kv-lab').boundingBox()
  await p.evaluate(() => scrollTo(0, 99999)); await p.waitForTimeout(300)
  await p.touchscreen.tap(lab.x + 40, 600)
  ok('érintésre nem ragad rá a csík (nincs egér)', false, await p.locator('.kv-lab').evaluate((e) => e.hasAttribute('data-eger')))
  ok('nincs futásidejű hiba', [], f.hibak)
  await f.ctx.close()
}

console.log('\n=== 6) Jogi oldalról ===\n')
{
  const j = await oldal('/impresszum')
  await Promise.all([j.p.waitForURL(/\/publikus#galeria$/, { timeout: 30000 }), j.p.locator('.kv-nav nav a').filter({ hasText: 'Galéria' }).click()])
  await j.p.locator('.kv-galeria h2').waitFor({ timeout: 60000 })
  await j.p.waitForTimeout(800)
  ok('a jogi oldalról a főoldal galériájára visz', true, await j.p.locator('.kv-galeria h2').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight / 2 }))
  await j.ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'MINDEN RENDBEN' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
