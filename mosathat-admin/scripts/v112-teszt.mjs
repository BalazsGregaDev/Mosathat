import { chromium } from 'playwright'
import { foglalasOldal } from './_publikus.mjs'

const CIM = 'http://localhost:5180'
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const TELEFON = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

console.log('=== 1) Nagyítás: a publikus oldalakon engedélyezett, az adminban tiltott ===\n')
const tiltott = (p) => p.evaluate(() => /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?![.\d])/.test(document.querySelector('meta[name="viewport"]')?.content ?? ''))
for (const ut of ['/publikus', '/gyik', '/adatvedelem', `/foglalas/${'0'.repeat(32)}`, '/ceg/abc', `/lemondas?t=${'a'.repeat(43)}`, '/']) {
  const ctx = await b.newContext(TELEFON)
  const p = await ctx.newPage()
  await p.goto(CIM + ut)
  await p.waitForTimeout(3000)
  ok(`${ut.slice(0, 20)}: ${ut === '/' ? 'tiltott (admin)' : 'engedélyezett'}`, ut === '/', await tiltott(p))
  await ctx.close()
}

console.log('\n=== 2) A publikus oldal nem tölti be az admint ===\n')
{
  const ctx = await b.newContext()
  const p = await ctx.newPage()
  const modulok = []
  p.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/src/')) modulok.push(u.pathname) })
  await p.goto(CIM + '/publikus')
  await p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 90000 })
  ok('nincs App, AppShell és admin oldal a betöltött modulok között', [false, false, false],
    [modulok.includes('/src/App.tsx'), modulok.some((m) => m.includes('/shell/')), modulok.some((m) => m.includes('/publikus-admin/'))])
  ok('a foglalásban nincs előnézeti és fejlesztői maradvány', [0, 0, 0],
    [await p.locator('.fogl-proba').count(), await p.locator('.fogl-fejleszto').count(), await p.locator('.fogl-fej').count()])
  await ctx.close()
}
{
  const ctx = await b.newContext()
  const p = await ctx.newPage()
  await p.goto(CIM + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 90000 })
  ok('az admin belépő oldala betölt', 1, await p.getByRole('button', { name: /Belépés/ }).count())
  await ctx.close()
}

console.log('\n=== 3) Telefonon a foglalás minden szövegmezője legalább 16 px (iOS nem nagyít rá) ===\n')
{
  const { ctx, p, m } = await foglalasOldal(b, { viewport: TELEFON.viewport, kontextus: { isMobile: true, hasTouch: true } })
  await m.locator('.fogl-valaszto button').filter({ hasText: 'Személyautó' }).click()
  await m.locator('.fogl-csomag', { has: p.locator('.nev', { hasText: /^Premium$/ }) }).click(); await p.waitForTimeout(800)
  await m.locator('.fogl-valaszto button').filter({ hasText: 'Itt hagyom' }).click(); await p.waitForTimeout(3500)
  await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await p.waitForTimeout(600)
  await m.locator('.fogl-idok button').first().click(); await p.waitForTimeout(600)
  const kicsik = await m.locator('.fogl-urlap input:not([type="checkbox"]):not(#fo-weboldal), .fogl-urlap textarea')
    .evaluateAll((l) => l.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.id))
  ok('nincs 16 px alatti beviteli mező', [], kicsik)
  await ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
