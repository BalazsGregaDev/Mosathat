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

const doboz = async (lap, sel) => lap.locator(sel).first().evaluate((e) => {
  const sajat = e.getBoundingClientRect()
  const r = sajat.width || sajat.height ? [sajat] : [...e.children].map((c) => c.getBoundingClientRect())
    .flatMap((c, i) => (c.width || c.height ? [c] : [...e.children[i].children].map((u) => u.getBoundingClientRect())))
  const x = Math.min(...r.map((d) => d.left))
  const y = Math.min(...r.map((d) => d.top))
  return {
    x: Math.round(x), y: Math.round(y),
    w: Math.round(Math.max(...r.map((d) => d.right)) - x), h: Math.round(Math.max(...r.map((d) => d.bottom)) - y),
  }
})

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
  ok('bal oszlop: adatok, alatta a csomag', [true, true], [csomag.x === ugyfel.x, csomag.y > ugyfel.y])
  ok('jobb oszlop: időpont felül, alatta a jármű, legalul a megjegyzés', [true, true, true, true],
    [mikor.x > ugyfel.x + ugyfel.w, mikor.y === ugyfel.y, jarmu.x === mikor.x && jarmu.y > mikor.y,
     megj.x === mikor.x && megj.y > jarmu.y])
  const egyformak = async () => {
    const a = await doboz(lap, '.urlap-csomag')
    const m = await doboz(lap, '.urlap-megj')
    return Math.abs((a.y + a.h) - (m.y + m.h)) <= 2
  }
  ok('a két oszlop egy vonalban végződik', true, await egyformak())
  await lap.locator('.csomagok .csomag').nth(1).click(); await p.waitForTimeout(400)
  await lap.locator('.valaszto button').filter({ hasText: 'Hozom-viszem' }).click(); await p.waitForTimeout(400)
  await lap.locator('.kerdojel-gomb').click(); await p.waitForTimeout(400)
  ok('hosszabb jobb oszloppal is egy vonalban', true, await egyformak())
  const hezagok = await lap.evaluate((l) => {
    const q = (s) => [...l.querySelectorAll(s)]
    const dobozok = [...q('.urlap-ugyfel > .sor-2'), ...q('.urlap-ugyfel > .flotta-hozzaad'), ...q('.urlap-elozmeny'),
      ...q('.urlap-csomag > .fej'), ...q('.urlap-csomag .csomag'), ...q('.urlap-csomag > .jelolo'),
      ...q('.urlap-csomag > .valaszto')].map((e) => e.getBoundingClientRect()).sort((x, y) => x.top - y.top)
    const ki = []
    for (let i = 1; i < dobozok.length; i++) ki.push(Math.round(dobozok[i].top - dobozok[i - 1].bottom))
    return ki
  })
  const nagyok = [...hezagok].sort((x, y) => x - y).slice(1)
  console.log(`         bal oszlop hézagai: ${JSON.stringify(hezagok)}`)
  ok('a bal oszlopban a többlet egyenletesen oszlik el, nincs nagy lyuk', true,
    nagyok.length > 3 && Math.max(...nagyok) - Math.min(...nagyok) <= 2)
  if (KEPEK) await p.screenshot({ path: join(KEPEK, 'tablet-fekvo-hosszu-jobb.png') })
  await lap.locator('.kerdojel-gomb').click(); await p.waitForTimeout(300)
  await lap.locator('.valaszto button').filter({ hasText: 'Itt hagyja' }).click(); await p.waitForTimeout(300)
  await lap.locator('.osszecsuk').click(); await p.waitForTimeout(400)
  const gomb = await doboz(lap, '.urlap-extrak .osszecsuk')
  const torzs = await doboz(lap, '.lap-torzs')
  const nagyitas = await lap.evaluate((e) => Number(getComputedStyle(e).zoom) || 1)
  ok('az egyéb szolgáltatás gomb a régi szélességű, középen', [true, true],
    [Math.abs(gomb.w - 772 * nagyitas) <= 1, Math.abs((gomb.x + gomb.w / 2) - (torzs.x + torzs.w / 2)) <= 8])
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
