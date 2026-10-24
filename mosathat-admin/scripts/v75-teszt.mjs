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
const sima = (s) => s.replace(/\s+/g, ' ').trim()
const szovegek = async (l) => (await l.evaluateAll((e) => e.map((x) => x.textContent))).map(sima)

async function belep(email, viewport = { width: 1600, height: 1000 }) {
  const ctx = await b.newContext({ viewport })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
  return { ctx, p, hibak }
}
const menu = (p, nev) => p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
const ful = (p, nev) => p.locator('.oldal-fej .fulek button').filter({ hasText: nev }).click()

console.log('=== 1) A szerkesztő ===\n')
const { ctx, p, hibak } = await belep('tulaj@mosathat.hu')
await menu(p, 'Szolgáltatások'); await p.waitForTimeout(1200)
ok('van „Csomagok szerkesztése” gomb', 1, await p.locator('.oldal-fej .fulek button').filter({ hasText: 'Csomagok szerkesztése' }).count())
await ful(p, 'Csomagok szerkesztése'); await p.waitForTimeout(1500)
const t = p.locator('.szerk-tabla')
ok('oszlopok: a három csomag', ['Munkalépés', 'Start', 'Premium', 'Elit'], await szovegek(t.locator('thead th')))
ok('14 sor', 14, await t.locator('tbody tr[data-sor]').count())
const sor = (nev) => t.locator(`tbody tr[data-sor="${nev}"]`)
const cella = (nev, i) => sor(nev).locator('td').nth(i)
ok('Falc sor: két üres cellanév (a sor neve érvényes), az Elitben saját név', ['', '', 'Falc mélytisztítás'],
  await Promise.all([0, 1, 2].map((i) => cella('Falc áttörlés', i).locator('input').inputValue())))
ok('Gumiápolás kapcsolói: Start ki, Premium be, Elit be', ['false', 'true', 'true'],
  await Promise.all([0, 1, 2].map((i) => cella('Gumiápolás', i).getByRole('switch').getAttribute('aria-checked'))))
ok('a mentés gomb alapból tiltva', true, await p.getByRole('button', { name: 'Mentés', exact: true }).isDisabled())
if (KEPEK) { await p.setViewportSize({ width: 1600, height: 2300 }); await p.screenshot({ path: join(KEPEK, 'v75-szerkeszto.png') }) }

console.log('\n=== 2) Szerkesztés ===\n')
await cella('Gyors viasz', 1).getByRole('switch').click()
await cella('Falc áttörlés', 2).locator('input').fill('Falc mély')
await sor('Porszívózás').locator('th input').fill('Porszívózás (ülések is)')
ok('a sor átnevezése a cellákat is viszi', ['', '', ''],
  await Promise.all([0, 1, 2].map((i) => cella('Porszívózás (ülések is)', i).locator('input').inputValue())))
await sor('Illatosítás').getByRole('button', { name: 'Törlés' }).click()
await sor('Belső ablaktisztítás').getByRole('button', { name: 'Feljebb' }).click()
await p.getByRole('button', { name: /Új sor \(belül\)/ }).click()
const uj = t.locator('tbody tr[data-sor=""]')
await uj.locator('th input').fill('Csomagtartó porszívózás')
const ujSor = sor('Csomagtartó porszívózás')
for (const i of [0, 1]) await ujSor.locator('td').nth(i).getByRole('switch').click()
await p.locator('#csn-' + (await p.locator('.szerk-csomag input').nth(1).getAttribute('id')).slice(4)).fill('Prémium')
await p.locator('.szerk-csomag textarea').nth(1).fill('Részletesebb kézi tisztítás, belső ápolással.')
ok('a fejléc élőben követi a nevet', 'Prémium', (await szovegek(t.locator('thead th').nth(2)))[0])
ok('jelzi a mentetlen változást', 'Mentetlen változások', sima(await p.locator('.szerk-allapot').innerText()))
await p.locator('.szerk-csomag input').nth(0).fill('')
ok('üres csomagnévnél nem menthető', [true, 'Minden csomagnak kell név.'],
  [await p.getByRole('button', { name: 'Mentés', exact: true }).isDisabled(), sima(await p.locator('.szerk-allapot').innerText())])
await p.locator('.szerk-csomag input').nth(0).fill('Start')
if (KEPEK) await p.screenshot({ path: join(KEPEK, 'v75-szerkesztes-kozben.png') })
await p.getByRole('button', { name: 'Mentés', exact: true }).click(); await p.waitForTimeout(2500)
ok('mentve, és a nyitott foglalások munkalapja is frissült', true, /^Mentve\. \d+ nyitott foglalás munkalapja frissült\.$/.test(sima(await p.locator('.szerk-allapot').innerText())))
ok('a belső sorrend mentve (Belső ablaktisztítás egyet feljebb)', ['Porszívózás (ülések is)', 'Belső ablaktisztítás', 'Műanyag áttörlés (APC)'],
  (await t.locator('tbody').nth(1).locator('tr[data-sor]').evaluateAll((e) => e.map((x) => x.dataset.sor))).slice(0, 3))

console.log('\n=== 3) Mindenhol átvezetve ===\n')
await menu(p, 'Szolgáltatások'); await p.waitForTimeout(1200)
await ful(p, 'Mi van bennük?'); await p.waitForTimeout(800)
const mt = p.locator('.tartalom-tabla')
ok('Mi van bennük?: új név a fejlécben', ['Munkalépés', 'Start', 'Prémium', 'Elit'], await szovegek(mt.locator('thead th')))
const msor = async (nev) => (await szovegek(mt.locator('tbody tr').filter({ has: p.locator(`th:text-is("${nev}")`) }).locator('td')))
  .map((x) => x.replace('nincs benne', '').replace('benne van', '').trim())
ok('Gyors viasz: Premiumból kikerült', ['—', '—', 'Hosszantartó vax'], await msor('Gyors viasz'))
ok('Falc: az Elitben az új név', 'Falc mély', (await msor('Falc áttörlés'))[2])
ok('Illatosítás eltűnt', 0, await mt.locator('th:text-is("Illatosítás")').count())
ok('új sor Startban és Premiumban', ['✓', '✓', '—'], await msor('Csomagtartó porszívózás'))
await ful(p, 'Csomagok és árak'); await p.waitForTimeout(600)
ok('Csomagok és árak: név és leírás', true,
  (await szovegek(p.locator('h3.csomag-cim'))).some((x) => x.startsWith('Prémium') && x.includes('Részletesebb kézi tisztítás')))
ok('az Elit továbbra is automatikus szöveget kap, benne az új tartalommal', true,
  (await szovegek(p.locator('h3.csomag-cim'))).some((x) => x.startsWith('Elit') && /Falc mély/.test(x)))

await menu(p, 'Időpontok'); await p.waitForTimeout(1500)
await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click(); await p.waitForTimeout(1200)
const urlap = p.locator('.foglalas-urlap')
ok('Új időpont: a csomag új neve és leírása', true,
  (await urlap.locator('button.csomag').allInnerTexts()).map(sima).some((x) => x.includes('Prémium') && x.includes('Részletesebb kézi tisztítás')))
await p.keyboard.press('Escape'); await p.waitForTimeout(400)
const kartyak = sima(await p.locator('.napi-lista').innerText())
ok('a napi nézet kártyáin az új név', [true, false], [/Prémium/.test(kartyak), /\bPremium\b/.test(kartyak)])

const premium = p.locator('.napi-lista .kartya').filter({ hasText: 'Prémium' }).filter({ hasNot: p.locator('[data-allapot="COMPLETED"]') })
await p.locator('.napi-lista .kartya[data-allapot="CONFIRMED"], .napi-lista .kartya[data-allapot="IN_PROGRESS"], .napi-lista .kartya[data-allapot="ARRIVED"]')
  .filter({ hasText: 'Prémium' }).first().locator('.kartya-nyit').click(); await p.waitForTimeout(1500)
const ml = sima(await p.locator('dialog[aria-label="Munkalap"]').innerText())
ok('nyitott Premium munkalap: új feladatlista', [false, false, true, true],
  [/Gyors viasz/.test(ml), /Illatosítás/.test(ml), /Porszívózás \(ülések is\)/.test(ml), /Csomagtartó porszívózás/.test(ml)])
await p.keyboard.press('Escape'); await p.waitForTimeout(400)
void premium

await menu(p, 'Tartalom'); await p.waitForTimeout(2500)
const fogl = sima(await p.locator('.pub-sav[data-sav="fogl-2"] .fogl-csomagok').innerText())
ok('a foglalás csomaglépése (Tartalom előnézet): új név és leírás', [true, true], [/Prémium/.test(fogl), /Részletesebb kézi tisztítás/.test(fogl)])
ok('Elit: automatikus leírás az új tartalommal', true, /Prémium mindene, plusz:.*Falc mély/.test(fogl))

await menu(p, 'Arculat'); await p.waitForTimeout(2000)
ok('Arculat előnézet: új név', true, (await p.locator('.kv-tabla thead .kv-csomag-nev').allInnerTexts()).map(sima).some((x) => /prémium/i.test(x)))
ok('nincs JS hiba', [], hibak)
await ctx.close()

console.log('\n=== 4) Alkalmazott ===\n')
const a = await belep('alkalmazott@mosathat.hu')
await menu(a.p, 'Szolgáltatások'); await a.p.waitForTimeout(1200)
ok('nem látja a szerkesztőt', 0, await a.p.getByText('Csomagok szerkesztése').count())
await a.ctx.close()

console.log('\n=== 5) Tablet ===\n')
const tb = await belep('tulaj@mosathat.hu', { width: 1024, height: 1366 })
await menu(tb.p, 'Szolgáltatások').catch(async () => {
  await tb.p.locator('.hamburger, [aria-label="Menü"]').first().click(); await tb.p.waitForTimeout(400)
  await tb.p.locator('.fiok button').filter({ hasText: 'Szolgáltatások' }).first().click()
})
await tb.p.waitForTimeout(1200)
await ful(tb.p, 'Csomagok szerkesztése'); await tb.p.waitForTimeout(1500)
const tg = await tb.p.locator('.szerk-tabla').evaluate((e) => e.closest('.tablagorgo').scrollWidth - e.closest('.tablagorgo').clientWidth)
ok('tableten a táblázat görgethető vagy elfér, az oldal nem lóg ki', true,
  await tb.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
console.log(`   (táblázat vízszintes görgetés: ${tg} px)`)
if (KEPEK) { await tb.p.setViewportSize({ width: 1024, height: 2600 }); await tb.p.screenshot({ path: join(KEPEK, 'v75-tablet.png') }) }
await tb.ctx.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
