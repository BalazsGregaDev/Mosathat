import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const hibak = []
const kep = async (el, nev) => { if (KEPEK) await el.screenshot({ path: join(KEPEK, `${nev}.png`) }) }
const sima = (s) => s.replace(/\s+/g, ' ').trim()

const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await p.goto('http://localhost:5180/publikus')
await p.waitForSelector('.kv-egyeb', { timeout: 120000 })
await p.waitForTimeout(800)

console.log('=== 1) Mosás és Takarítás sor: csak külső és csak belső ár csomagonként ===\n')
const sor = (n) => p.locator('.kv-csoport[data-arakkal]').nth(n)
const arak = async (n) => (await sor(n).locator('td').allInnerTexts()).map(sima)
ok('két sor, felirattal', ['Csak mosás:', 'Csak takarítás:'], [sima(await sor(0).locator('.kv-csak').innerText()), sima(await sor(1).locator('.kv-csak').innerText())])
ok('személyautó: csak mosás árai', ['6 000 Ft', '8 000 Ft', '10 000 Ft'], await arak(0))
ok('személyautó: csak takarítás árai', ['8 000 Ft', '9 000 Ft', '11 000 Ft'], await arak(1))
await p.locator('.kv-kat button').nth(1).click()
await p.waitForTimeout(400)
const suv = await arak(0)
ok('SUV-ra váltva az árak is változnak', true, JSON.stringify(suv) !== JSON.stringify(['6 000 Ft', '8 000 Ft', '10 000 Ft']) && suv.every((x) => /Ft|egyedi|—/.test(x)))
await p.locator('.kv-kat button').nth(0).click()
await p.waitForTimeout(300)
await p.locator('.kv-csomag-gomb').nth(1).click()
await p.waitForTimeout(500)
ok('kiválasztott csomagnál a többi oszlop ára halvány', ['true', null, 'true'],
  await sor(0).locator('td').evaluateAll((l) => l.map((e) => e.getAttribute('data-halvany'))))
await p.locator('.kv-ketoszlop .kv-csomagok').scrollIntoViewIfNeeded()
await p.waitForTimeout(500)
await kep(p, '01-tabla-csak-arakkal')

console.log('\n=== 2) Egyéb szolgáltatások a táblázat alatt ===\n')
const eg = p.locator('.kv-egyeb')
ok('két oszlop: külső és belső', ['Külső', 'Belső'], (await eg.locator('h4').allInnerTexts()).map((x) => sima(x).toLowerCase().replace(/^./, (c) => c.toUpperCase())))
ok('alapból csak nevek, mind zárva', 0, await eg.locator('.kv-egyeb-kartya[open]').count())
const kulso = eg.locator('[data-terulet="KULSO"] .kv-egyeb-kartya')
const belso = eg.locator('[data-terulet="BELSO"] .kv-egyeb-kartya')
ok('a terület nélküli extrák a külső oszlopban', true, (await kulso.allInnerTexts()).some((x) => x.includes('Motortér kozmetika')))
ok('belső oszlopban a belső extrák', true, (await belso.allInnerTexts()).some((x) => x.includes('Vizes kárpittisztítás')))
const kartya = belso.filter({ hasText: 'Vizes kárpittisztítás' })
await kartya.locator('summary').click()
await p.waitForTimeout(500)
ok('lenyitva ár egységgel', '6500 Ft / ülés', sima(await kartya.locator('.kv-egyeb-ar').innerText()))
const egyeztet = kulso.filter({ hasText: 'Kerámia bevonat' })
await egyeztet.locator('summary').click()
await p.waitForTimeout(400)
ok('ajánlatkérősnél egyeztetés felirat', 'true', await egyeztet.locator('.kv-egyeb-ar').getAttribute('data-egyeztet'))
const g = await p.evaluate(() => {
  const t = document.querySelector('.kv-ketoszlop .kv-csomagok').getBoundingClientRect()
  const e = document.querySelector('.kv-egyeb').getBoundingClientRect()
  return [Math.round(e.top) >= Math.round(t.bottom) - 1, getComputedStyle(document.querySelector('.kv-ketoszlop .kv-csomagok')).position]
})
ok('a táblázat ragad, az egyéb szolgáltatások alatta, nem takarja', [true, 'sticky'], g)
ok('asztali gépen a két oszlop alatt, teljes szélességben', true, await p.evaluate(() => { const e = document.querySelector('.kv-egyeb').getBoundingClientRect(); const f = document.querySelector('.kv-ketoszlop > .kv-foglalas').getBoundingClientRect(); return e.top >= f.bottom - 1 && e.width > f.width * 1.8 }))
await eg.scrollIntoViewIfNeeded()
await p.waitForTimeout(400)
await kep(eg, '02-egyeb-szolgaltatasok')

console.log('\n=== 3) Görgetés közben nincs átfedés, a tábla elfér ===\n')
const meresek = []
for (let y = 0; y < 2600; y += 200) {
  await p.evaluate((d) => window.scrollTo(0, document.querySelector('.kv-ketoszlop').offsetTop + d), y)
  await p.waitForTimeout(80)
  meresek.push(await p.evaluate(() => {
    const t = document.querySelector('.kv-ketoszlop .kv-csomagok').getBoundingClientRect()
    const e = document.querySelector('.kv-egyeb').getBoundingClientRect()
    const g2 = document.querySelector('.kv-tabla-gorgo')
    return e.top >= t.bottom - 1 && g2.scrollHeight <= g2.clientHeight + 1
  }))
}
ok('minden görgetési helyzetben', true, meresek.every(Boolean))

const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
m.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await m.goto('http://localhost:5180/publikus')
await m.waitForSelector('.kv-egyeb', { timeout: 120000 })
await m.waitForTimeout(600)
ok('telefonon a sorrend: táblázat, egyéb szolgáltatások, foglalás', ['kv-csomag-hely', 'kv-egyeb', 'kv-foglalas'],
  await m.evaluate(() => [...document.querySelector('.kv-ketoszlop').children].map((e) => e.classList[0])))
ok('telefonon nincs vízszintes görgetés', true, await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
await m.locator('.kv-egyeb').scrollIntoViewIfNeeded()
await kep(m, '03-egyeb-telefon')

ok('nincs JS hiba', [], hibak)
await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
