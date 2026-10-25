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
const sima = (s) => s.replace(new RegExp('\u2063[\uFE00-\uFE0F]{3}|\u2064', 'g'), '').replace(/\s+/g, ' ').trim()
const szovegek = async (l) => (await l.evaluateAll((e) => e.map((x) => x.textContent))).map(sima)

const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } })
const p = await ctx.newPage()
const hibak = []
p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(2500)
const menu = (nev) => p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
const ful = (nev) => p.locator('.oldal-fej .fulek button').filter({ hasText: nev }).click()
const mentes = p.getByRole('button', { name: 'Mentés', exact: true })

await menu('Szolgáltatások'); await p.waitForTimeout(1200)
await ful('Csomagok tartalma'); await p.waitForTimeout(1500)
const t = p.locator('.szerk-tabla')
const cella = (sor, i) => t.locator(`tbody tr[data-sor="${sor}"]`).locator('td').nth(i)

console.log('=== 1) Új oszlop felvétele ===\n')
await p.getByRole('button', { name: '+ Új csomag (oszlop)' }).click(); await p.waitForTimeout(300)
ok('megjelent a negyedik oszlop, névtelenül', ['Munkalépés', 'Start', 'Premium', 'Elit', 'névtelen'], await szovegek(t.locator('thead th')))
ok('a név mezőre ugrik', true, await p.evaluate(() => document.activeElement?.id?.startsWith('csn-')))
ok('névtelenül nem menthető', true, await mentes.isDisabled())
ok('minden cellája kikapcsolva indul', ['false'], [...new Set(await t.locator('tbody tr[data-sor] td:nth-child(5)').getByRole('switch').evaluateAll((e) => e.map((x) => x.getAttribute('aria-checked'))))])
await p.keyboard.type('Gold')
const kartya = p.locator('.szerk-csomag').nth(3)
await kartya.locator('select').selectOption({ label: 'Elit' })
for (const s of ['Bogároldó', 'Előmosó (aktív hab)', 'Kézi mosás samponnal', 'Szárazolás', 'Porszívózás', 'Alja kárpit mélytisztítás']) {
  await cella(s, 3).getByRole('switch').click()
}
await cella('Gyors viasz', 3).getByRole('switch').click()
await cella('Gyors viasz', 3).locator('input').fill('Kerámia gyorsbevonat')
ok('a fejléc követi a nevet', 'Gold', (await szovegek(t.locator('thead th').nth(4)))[0])
const hely = await kartya.locator('textarea').getAttribute('placeholder')
ok('az automatikus leírás már a vázlatból számol', true, /^Üresen hagyva: Elit mindene, plusz: .*Kerámia gyorsbevonat/.test(hely))
ok('a kártya jelzi, hogy új, és tájékoztat az árakról', [true, true],
  [/4\. oszlop · új/.test(sima(await kartya.textContent())), /Csomagok és árak fülön/.test((await p.locator('.szerk-tipp').allInnerTexts()).join(' '))])
if (KEPEK) { await p.setViewportSize({ width: 1600, height: 2400 }); await p.screenshot({ path: join(KEPEK, 'v76-uj-oszlop.png') }); await p.setViewportSize({ width: 1600, height: 1000 }) }
await mentes.click(); await p.waitForTimeout(2500)
ok('mentve', true, /^Mentve\./.test(sima(await p.locator('.szerk-allapot').innerText())))
ok('mentés után a kártya már nem „új”, a gomb Törlés (nincs foglalása)', [false, 'Törlés'],
  [/· új/.test(sima(await kartya.textContent())), sima(await kartya.locator('.btn-veszelyes').innerText())])

console.log('\n=== 2) Mindenhol megjelenik ===\n')
await menu('Szolgáltatások'); await p.waitForTimeout(1200)
await ful('Mi van bennük?'); await p.waitForTimeout(800)
ok('Mi van bennük?: Gold oszlop', ['Munkalépés', 'Start', 'Premium', 'Elit', 'Gold'], await szovegek(p.locator('.tartalom-tabla thead th')))
await ful('Csomagok és árak'); await p.waitForTimeout(800)
const gold = p.locator('details.szolg-szakasz').filter({ has: p.locator('.szolg-szakasz-cim', { hasText: /^Gold$/ }) })
ok('Csomagok és árak: Gold szakasz, az automatikus leírással', true, /Elit \+ .*Kerámia gyorsbevonat/.test(sima(await gold.locator('summary').textContent())))
await gold.locator('summary').click()
const arMezo = gold.getByLabel('Gold · Sedan · Teljes ára')
ok('az ára még üres', '', await arMezo.inputValue())
await arMezo.fill('24900'); await arMezo.blur(); await p.waitForTimeout(1200)
const idoMezo = gold.getByLabel('Gold · Sedan · Teljes időtartama')
if (await idoMezo.count()) { await idoMezo.fill('150'); await idoMezo.blur(); await p.waitForTimeout(1200) }

await menu('Tartalom'); await p.waitForTimeout(2500)
const fogl = p.locator('.tsz-blokk[data-sav="fogl-2"] .fogl-csomagok')
ok('a foglalás csomaglépése (Tartalom előnézet): négy csomag', 4, await fogl.locator('.fogl-csomag').count())
ok('a Gold a beállított árral', true, /Gold.*24 900 Ft-tól/.test(sima(await fogl.innerText())))
if (KEPEK) await p.screenshot({ path: join(KEPEK, 'v76-foglalas.png') })

await menu('Időpontok'); await p.waitForTimeout(1500)
await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click(); await p.waitForTimeout(1200)
ok('Új időpont: Gold választható', 1, await p.locator('.foglalas-urlap button.csomag[aria-label="Gold"]').count())
await p.keyboard.press('Escape'); await p.waitForTimeout(400)

await menu('Arculat'); await p.waitForTimeout(2000)
ok('Arculat: négy oszlop a táblázatban', 4, await p.locator('.kv-tabla thead .kv-csomag-nev').count())

console.log('\n=== 3) Oszlop törlése ===\n')
await menu('Szolgáltatások'); await p.waitForTimeout(1200)
await ful('Csomagok tartalma'); await p.waitForTimeout(1500)
await p.locator('.szerk-csomag').nth(3).getByRole('button', { name: 'Törlés' }).click()
ok('a vázlatból eltűnt', 4, await t.locator('thead th').count())
await mentes.click(); await p.waitForTimeout(2500)
ok('mentéskor törölve', true, /1 csomag törölve/.test(sima(await p.locator('.szerk-allapot').innerText())))
ok('a régi csomagoknál „Kivezetés” áll (van foglalásuk)', ['Kivezetés', 'Kivezetés', 'Kivezetés'],
  await szovegek(p.locator('.szerk-csomag .btn-veszelyes')))
await menu('Tartalom'); await p.waitForTimeout(2500)
ok('a foglalásból is eltűnt', 3, await p.locator('.tsz-blokk[data-sav="fogl-2"] .fogl-csomagok .fogl-csomag').count())
ok('nincs JS hiba', [], hibak)

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
