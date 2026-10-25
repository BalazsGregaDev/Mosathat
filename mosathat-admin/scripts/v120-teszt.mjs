import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { foglalasOldal } from './_publikus.mjs'

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
const TELEFON = { viewport: { width: 390, height: 844 }, kontextus: { isMobile: true, hasTouch: true } }

console.log('=== 1) Telefonon: az Egyéb szolgáltatások egészében lenyitható ===\n')
{
  const { ctx, p } = await foglalasOldal(b, { ...TELEFON, hiba: jsHiba })
  const egyeb = p.locator('.kv-egyeb')
  await egyeb.scrollIntoViewIfNeeded()
  const nyito = egyeb.getByRole('button', { name: 'Egyéb szolgáltatások' })
  ok('alapból csukva: csak a cím látszik, nyitó gombként', ['false', false],
    [await nyito.getAttribute('aria-expanded'), await egyeb.locator('.kv-egyeb-oszlopok').isVisible()])
  await kep(egyeb, '1-csukva')
  await nyito.click(); await p.waitForTimeout(300)
  const kartyak = egyeb.locator('.kv-egyeb-kartya')
  ok('kinyitva: a mostani lista, minden szolgáltatás csukva', ['true', true, 0],
    [await nyito.getAttribute('aria-expanded'), await kartyak.first().isVisible(), await egyeb.locator('.kv-egyeb-kartya[open]').count()])
  await kep(egyeb, '1-nyitva')
  await kartyak.nth(0).locator('summary').click(); await p.waitForTimeout(400)
  await kartyak.nth(1).locator('summary').click(); await p.waitForTimeout(400)
  ok('a szolgáltatások egyesével nyílnak, a másik bezárul', [1, false, true],
    [await egyeb.locator('.kv-egyeb-kartya[open]').count(), await kartyak.nth(0).evaluate((d) => d.open), await kartyak.nth(1).evaluate((d) => d.open)])
  await kep(egyeb, '1-szolgaltatas')
  await nyito.click(); await p.waitForTimeout(300)
  ok('a címre újra kattintva az egész bezárul', ['false', false],
    [await nyito.getAttribute('aria-expanded'), await egyeb.locator('.kv-egyeb-oszlopok').isVisible()])
  ok('nem lóg ki', true, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await ctx.close()
}

console.log('\n=== 2) Asztalon minden marad ===\n')
{
  const { ctx, p } = await foglalasOldal(b, { hiba: jsHiba })
  const egyeb = p.locator('.kv-egyeb')
  ok('nincs nyitó gomb, a lista látszik', [0, true],
    [await egyeb.getByRole('button', { name: 'Egyéb szolgáltatások' }).count(), await egyeb.locator('.kv-egyeb-oszlopok').isVisible()])
  await ctx.close()
}

console.log('\n=== 3) Telefonon a kereső ablak csak akkora, amekkora kell ===\n')
{
  const { ctx, p } = await foglalasOldal(b, { ...TELEFON, ut: '/publikus#foglalasom', hiba: jsHiba })
  const ablak = p.locator('dialog.kv-kereso-fedo[open] .kv-kereso-ablak')
  await ablak.waitFor()
  const r = await ablak.evaluate((e) => e.getBoundingClientRect().toJSON())
  ok('középen, a képernyőnél jóval alacsonyabb, széleken 12 px', [true, true, 12],
    [Math.abs((r.top + r.bottom) / 2 - 422) < 4, r.height < 600, Math.round(r.left)])
  await kep(p, '3-kereso-telefon')
  await ctx.close()
}

console.log('\n=== 4) Keskenyebb asztali ablakban is rendben a nyitó rész ===\n')
for (const szel of [1000, 820]) {
  const { ctx, p } = await foglalasOldal(b, { viewport: { width: szel, height: 800 }, hiba: jsHiba })
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300)
  const r = await p.evaluate(() => {
    const d = (s) => document.querySelector(s).getBoundingClientRect()
    const h1 = d('.kv-hero h1'); const g = d('.kv-hero-gombok'); const v = d('.kv-hero .kv-hasabok')
    return { latszik: g.width > 0, mellette: g.left >= h1.right - 1, vonalFelett: g.bottom <= v.top, ki: document.documentElement.scrollWidth <= window.innerWidth + 1 }
  })
  ok(`${szel} px: a gombok a cím mellett, a vonal fölött, nincs kilógás`, { latszik: true, mellette: true, vonalFelett: true, ki: true }, r)
  await kep(p.locator('.kv-hero'), `4-hero-${szel}`)
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
