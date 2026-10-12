import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

import { hetkoznapra } from './_munkanap.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}

async function belep(viewport, mobil) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1.5, isMobile: mobil, hasTouch: mobil })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
  await hetkoznapra(p)
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
  const ham = p.locator('.hamburger:visible')
  if (await ham.count()) {
    await ham.first().click(); await p.waitForTimeout(500)
    await p.locator('.fiok button:visible').filter({ hasText: 'Időpontok' }).first().click()
  } else {
    await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).first().click()
  }
  await p.waitForTimeout(2000)
  return { ctx, p, hibak }
}

async function urlap(p) {
  await p.locator('button:visible').filter({ hasText: 'Új időpont' }).or(p.locator('.fab:visible')).first().click()
  await p.waitForTimeout(1200)
  return p.locator('.foglalas-urlap')
}

const doboz = async (lap, sel) => {
  const d = await lap.locator(sel).first().boundingBox()
  return { x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.width), h: Math.round(d.height) }
}

console.log('=== 1) Tablet, fekvő ===\n')
{
  const { ctx, p, hibak } = await belep({ width: 1280, height: 800 }, true)
  const lap = await urlap(p)
  const l = await doboz(lap, ':scope')
  ok('az ablak a képernyő 95%-a', 95, Math.round((l.w * 100) / 1280))
  const ugyfel = await doboz(lap, '.urlap-ugyfel')
  const mikor = await doboz(lap, '.urlap-mikor')
  const jarmu = await doboz(lap, '.urlap-jarmu')
  const csomag = await doboz(lap, '.urlap-csomag')
  const megj = await doboz(lap, '.urlap-megj')
  ok('bal oszlop: adatok, csomag, megjegyzés egymás alatt', [true, true, true],
    [csomag.x === ugyfel.x && megj.x === ugyfel.x, csomag.y > ugyfel.y, megj.y > csomag.y])
  ok('jobb oszlop: időpont felül, alatta a jármű', [true, true, true],
    [mikor.x > ugyfel.x + ugyfel.w, mikor.y === ugyfel.y, jarmu.x === mikor.x && jarmu.y > mikor.y])
  await lap.locator('.osszecsuk').click(); await p.waitForTimeout(400)
  const gomb = await doboz(lap, '.urlap-extrak .osszecsuk')
  const torzs = await doboz(lap, '.lap-torzs')
  ok('az egyéb szolgáltatás gomb a régi szélességű, középen', [772, true],
    [gomb.w, Math.abs((gomb.x + gomb.w / 2) - (torzs.x + torzs.w / 2)) <= 8])
  const extrak = lap.locator('.urlap-extrak .extrak > div')
  const e0 = await extrak.nth(0).boundingBox()
  const e1 = await extrak.nth(1).boundingBox()
  ok('a szolgáltatások két oszlopban', [true, true], [Math.round(e0.y) === Math.round(e1.y), e1.x > e0.x + e0.width])
  ok('nincs vízszintes görgetés', false, await lap.locator('.lap-torzs').evaluate((e) => e.scrollWidth > e.clientWidth))
  if (KEPEK) await p.screenshot({ path: join(KEPEK, 'tablet-fekvo.png') })
  ok('nincs JS hiba', [], hibak)
  await ctx.close()
}

console.log('\n=== 2) Telefon: a sorrend a régi ===\n')
{
  const { ctx, p, hibak } = await belep({ width: 390, height: 844 }, true)
  const befer = await p.locator('.iv-befer .szo').first().innerText()
  ok('a beosztásban nem csúszik össze: „autó fér”', true, /autó fér/.test(befer.replace(/\s+/g, ' ')))
  const lap = await urlap(p)
  const y = async (sel) => (await doboz(lap, sel)).y
  const sor = [await y('.urlap-ugyfel'), await y('.urlap-mikor'), await y('.urlap-jarmu'),
    await y('.urlap-csomag'), await y('.urlap-megj'), await y('.urlap-extrak')]
  ok('ügyfél, mikor, jármű, csomag, megjegyzés, egyéb', true, sor.every((v, i) => i === 0 || v > sor[i - 1]))
  ok('teljes szélesség', 390, (await doboz(lap, ':scope')).w)
  ok('nincs JS hiba', [], hibak)
  await ctx.close()
}

console.log('\n=== 3) Tablet, álló: egy oszlop, 95% ===\n')
{
  const { ctx, p } = await belep({ width: 800, height: 1280 }, true)
  const lap = await urlap(p)
  ok('95% széles', 95, Math.round(((await doboz(lap, ':scope')).w * 100) / 800))
  ok('egy oszlop: a csomag a jármű alatt', true, (await doboz(lap, '.urlap-csomag')).y > (await doboz(lap, '.urlap-jarmu')).y)
  await ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
