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
const TELEFON = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

async function oldal(ut, opts) {
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
const gorget = async (p, y) => { await p.evaluate((yy) => scrollTo(0, yy), y); await p.waitForTimeout(350) }
const doboz = (p, s) => p.locator(s).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height } })
const pontAlatt = (p, x, y) => p.evaluate(([xx, yy]) => {
  const e = document.elementFromPoint(xx, yy)
  return e?.closest('a, button')?.className || e?.closest('a, button')?.textContent?.trim() || e?.tagName || null
}, [x, y])

console.log('=== 1) Asztali gépen: a nyelvválasztó a navbarral együtt jön ===\n')
{
  const { ctx, p, hibak } = await oldal('/publikus', { viewport: { width: 1440, height: 900 } })
  const mer = () => p.evaluate(() => {
    const nav = document.querySelector('.kv-nav').getBoundingClientRect()
    const k = document.querySelector('.kv-nyelv-sor .nyelv-kapcsolo').getBoundingClientRect()
    const linkek = [...document.querySelectorAll('.kv-nav nav a')].map((a) => a.getBoundingClientRect())
    return { gap: Math.round((k.top - nav.bottom) * 4) / 4, jobb: Math.round(k.right), linkJobb: Math.round(Math.max(...linkek.map((l) => l.right))) }
  })
  const kezdo = await mer()
  const lent = []
  for (const y of [600, 1400, 2600]) { await gorget(p, y); lent.push(await mer()) }
  ok('görgetés közben is ugyanott marad: a navbar alatt 21 px-re, jobbra igazítva', [true, true, true],
    lent.map((m) => Math.abs(m.gap - kezdo.gap) <= 0.5 && m.jobb === kezdo.jobb && m.jobb === m.linkJobb))
  ok('kezdőhelyzetben sem változott', 21, Math.round(kezdo.gap))
  await gorget(p, 1400)
  await p.locator('.kv-nyelv-sor .nyelv-kapcsolo').click()
  await p.waitForTimeout(500)
  ok('görgetett állapotban is kattintható, a helyén marad', ['en', 'Packages'], [await p.evaluate(() => document.documentElement.lang), sima(await p.locator('.kv-nav nav a').first().textContent())])
  await kep(p, '01-asztali-gorgetve.png', { clip: { x: 0, y: 0, width: 1440, height: 260 } })
  const n = await doboz(p, '.kv-nav nav a')
  ok('a menüpontok kattintható területe nagyobb a szövegnél (8 px-re a szövegtől is)', ['', true],
    [await p.evaluate(() => getComputedStyle(document.querySelector('.kv-nav nav a'), '::before').content.replace(/"/g, '')),
     (await pontAlatt(p, n.left - 6, n.top - 7)) === 'Packages'])
  ok('a sáv többi része nem takarja el a tartalmat (átkattintható)', 'none',
    await p.locator('.kv-nyelv-sor').evaluate((e) => getComputedStyle(e).pointerEvents))
  ok('nincs futásidejű hiba', [], hibak)
  await ctx.close()
}

console.log('\n=== 2) Tableten (900 px): saját sorban, de szintén jön a navbarral ===\n')
{
  const { ctx, p } = await oldal('/publikus', { viewport: { width: 900, height: 1000 } })
  await gorget(p, 1500)
  const m = await p.evaluate(() => {
    const nav = document.querySelector('.kv-nav').getBoundingClientRect()
    const k = document.querySelector('.kv-nyelv-sor .nyelv-kapcsolo').getBoundingClientRect()
    return { gap: Math.round(k.top - nav.bottom), jobb: Math.round(innerWidth - k.right), hamburger: getComputedStyle(document.querySelector('.kv-menu-gomb')).display }
  })
  ok('görgetve is a navbar alatt, jobbra; nincs hamburger', { gap: 21, jobb: 24, hamburger: 'none' }, m)
  await ctx.close()
}

console.log('\n=== 3) Telefonon: név balra, hamburger jobbra, átlátszó navbar ===\n')
const t = await oldal('/publikus', TELEFON)
{
  const p = t.p
  const st = await p.evaluate(() => {
    const nav = document.querySelector('.kv-nav')
    const cs = getComputedStyle(nav)
    const v = (s) => getComputedStyle(document.querySelector(s)).display
    return { hatter: cs.backgroundColor, keverés: cs.mixBlendMode, irany: cs.flexDirection, menu: v('.kv-nav > nav'), nyelvSor: v('.kv-nyelv-sor'), panel: v('.kv-menu-hely'), gomb: v('.kv-menu-gomb') }
  })
  ok('nincs háttérszín; a fejléc egy sor; a menü és a nyelvválasztó el van rejtve', { hatter: 'rgba(0, 0, 0, 0)', keverés: 'difference', irany: 'row', menu: 'none', nyelvSor: 'none', panel: 'none', gomb: 'block' }, st)
  const logo = await doboz(p, '.kv-nav .kv-logo')
  const gomb = await doboz(p, '.kv-menu-gomb')
  const ikon = await p.locator('.kv-menu-gomb span').evaluateAll((l) => l.map((e) => e.getBoundingClientRect()).reduce((a, r) => ({ l: Math.min(a.l, r.left), r: Math.max(a.r, r.right), t: Math.min(a.t, r.top), b: Math.max(a.b, r.bottom) }), { l: 1e9, r: -1e9, t: 1e9, b: -1e9 }))
  ok('bal felső sarokban a név, jobb felsőben a hamburger (16 px-es margóval)', [16, 16, true],
    [Math.round(logo.left), Math.round(390 - ikon.r), Math.abs((logo.top + logo.bottom) / 2 - (gomb.top + gomb.bottom) / 2) <= 2])
  ok('hamburger: 3 csík, 22 px-es ikon 44×44-es érintési területen', [3, 22, 44, 44],
    [await p.locator('.kv-menu-gomb span').count(), Math.round(ikon.r - ikon.l), Math.round(gomb.width), Math.round(gomb.height)])
  ok('a név a szövegnél nagyobb területen is megnyomható', ['kv-logo', 'kv-logo'],
    [await pontAlatt(p, logo.left - 7, logo.top - 8), await pontAlatt(p, logo.right + 9, logo.bottom + 8)])
  ok('a hamburger az ikonon kívül, a 44 px-en belül is', 'kv-menu-gomb', await pontAlatt(p, ikon.l - 9, ikon.t - 10))
  ok('nincs vízszintes görgetés', true, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await kep(p, '02-telefon-teteje.png')

  await gorget(p, 430)
  ok('görgetéskor a név elhalványul, a hamburger marad', ['0', 'hidden', true],
    [await p.locator('.kv-nav .kv-logo').evaluate((e) => getComputedStyle(e).opacity), await p.locator('.kv-nav .kv-logo').evaluate((e) => getComputedStyle(e).visibility), await p.locator('.kv-menu-gomb').isVisible()])
  await kep(p, '03-telefon-foto-folott.png')
  await gorget(p, 0)
  ok('a lap tetején újra látszik a név', '1', await p.locator('.kv-nav .kv-logo').evaluate((e) => getComputedStyle(e).opacity))
}

console.log('\n=== 4) A hamburger menü ===\n')
{
  const p = t.p
  await gorget(p, 1200)
  await p.locator('.kv-menu-gomb').tap()
  await p.waitForTimeout(400)
  const nyitott = await p.evaluate(() => ({
    gomb: document.querySelector('.kv-menu-gomb').getAttribute('aria-expanded'),
    cimke: document.querySelector('.kv-menu-gomb').getAttribute('aria-label'),
    linkek: [...document.querySelectorAll('.kv-menu-panel nav a')].map((a) => a.textContent.trim()),
    nyelv: !!document.querySelector('.kv-menu-panel .nyelv-kapcsolo'),
    hatter: getComputedStyle(document.querySelector('.kv-nav')).backgroundColor !== 'rgba(0, 0, 0, 0)',
    logo: getComputedStyle(document.querySelector('.kv-nav .kv-logo')).opacity,
    sorMagassag: Math.round(document.querySelector('.kv-menu-panel nav a').getBoundingClientRect().height),
    nyelvMagassag: document.querySelector('.kv-menu-panel .nyelv-kapcsolo').getBoundingClientRect().height >= 44,
  }))
  ok('megnyílik: Csomagok, Foglalás, Kapcsolat és a nyelvválasztó; a név is látszik, a gomb X lett',
    { gomb: 'true', cimke: 'Menü bezárása', linkek: ['Csomagok', 'Foglalás', 'Kapcsolat'], nyelv: true, hatter: true, logo: '1', sorMagassag: 52, nyelvMagassag: true }, nyitott)
  await kep(p, '04-telefon-menu-nyitva.png')

  await p.locator('.kv-menu-panel nav a').filter({ hasText: 'Foglalás' }).tap()
  await p.waitForTimeout(1300)
  const nav = await doboz(p, '.kv-nav')
  ok('egy érintés: bezárul és odagörget, a cím felvillan', [false, 'false', true, true],
    [await p.locator('.kv-menu-hely').isVisible(), await p.locator('.kv-menu-gomb').getAttribute('aria-expanded'),
     Math.abs((await doboz(p, '.kv-foglalas')).top - (nav.height + 12)) <= 2, await p.locator('.kv-foglalas > h2').evaluate((e) => e.hasAttribute('data-felvillan'))])
  await kep(p, '05-telefon-foglalashoz-gorgetve.png')

  await p.locator('.kv-menu-gomb').tap(); await p.waitForTimeout(300)
  await p.locator('.kv-menu-panel .nyelv-kapcsolo').tap(); await p.waitForTimeout(600)
  ok('a nyelvválasztó is egy érintés: angolra vált és bezárul', [false, 'en', '?lang=en', 'Menu'],
    [await p.locator('.kv-menu-hely').isVisible(), await p.evaluate(() => document.documentElement.lang), await p.evaluate(() => location.search),
     await p.locator('.kv-menu-gomb').getAttribute('aria-label')])
  await p.locator('.kv-menu-gomb').tap(); await p.waitForTimeout(300)
  ok('angolul a menü is angol', ['Packages', 'Booking', 'Contact'], (await p.locator('.kv-menu-panel nav a').allTextContents()).map(sima))
  await kep(p, '06-telefon-menu-angol.png')
  await p.mouse.click(200, 780); await p.waitForTimeout(300)
  ok('a menün kívülre érintve bezárul', false, await p.locator('.kv-menu-hely').isVisible())
  await p.locator('.kv-menu-gomb').tap(); await p.waitForTimeout(200)
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  ok('Esc-re bezárul', false, await p.locator('.kv-menu-hely').isVisible())
  await p.locator('.kv-menu-gomb').tap(); await p.waitForTimeout(200)
  await p.locator('.kv-menu-gomb').tap(); await p.waitForTimeout(200)
  ok('a hamburger (X) újbóli megnyomására bezárul', false, await p.locator('.kv-menu-hely').isVisible())
  const y0 = await p.evaluate(() => scrollY)
  await p.locator('.kv-menu-gomb').tap(); await p.waitForTimeout(200)
  await p.locator('.kv-nav .kv-logo').tap(); await p.waitForTimeout(1200)
  ok('a névre érintve bezárul és a lap tetejére görget (nem tölt újra)', [true, false, 0, '?lang=en'],
    [y0 > 500, await p.locator('.kv-menu-hely').isVisible(), await p.evaluate(() => Math.round(scrollY)), await p.evaluate(() => location.search)])
  ok('nincs futásidejű hiba', [], t.hibak)
  await t.ctx.close()
}

console.log('\n=== 5) Telefonon a jogi oldalakon is ===\n')
{
  const { ctx, p, hibak } = await oldal('/adatvedelem', TELEFON)
  await p.locator('.kv-jogi:not([aria-busy]) h1').waitFor({ timeout: 30000 })
  ok('hamburger és név van, a menü rejtve', [true, true, false], [await p.locator('.kv-menu-gomb').isVisible(), await p.locator('.kv-nav .kv-logo').isVisible(), await p.locator('.kv-nav > nav').isVisible()])
  await p.locator('.kv-menu-gomb').tap(); await p.waitForTimeout(300)
  await Promise.all([p.waitForURL(/\/publikus#csomagok$/, { timeout: 30000 }), p.locator('.kv-menu-panel nav a').filter({ hasText: 'Csomagok' }).tap()])
  await p.locator('.kv-csomagok h2').waitFor({ timeout: 60000 })
  ok('a menüpont a főoldal megfelelő részére visz', '/publikus#csomagok', await p.evaluate(() => location.pathname + location.hash))
  await p.goto(DEMO + '/impresszum')
  await p.locator('.kv-jogi:not([aria-busy]) h1').waitFor({ timeout: 60000 })
  await Promise.all([p.waitForURL(/\/publikus$/, { timeout: 30000 }), p.locator('.kv-nav .kv-logo').tap()])
  ok('a jogi oldalon a név a főoldalra visz', '/publikus', await p.evaluate(() => location.pathname))
  ok('nincs futásidejű hiba', [], hibak)
  await ctx.close()
}

console.log('\n=== 6) Fekvő telefonon marad a soros menü ===\n')
{
  const { ctx, p } = await oldal('/publikus', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  ok('a menüpontok a navbarban, hamburger nincs', [true, false], [await p.locator('.kv-nav > nav').isVisible(), await p.locator('.kv-menu-gomb').isVisible()])
  await ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'MINDEN RENDBEN' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
