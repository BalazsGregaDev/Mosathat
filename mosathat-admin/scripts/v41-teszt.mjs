// v41 ellenőrzése Playwrighttal: fordulónap a szerződésben.
//
// Futtatás:  npm run dev -- --port 5180   (másik ablakban)
//            node scripts/v41-teszt.mjs
//
// Amit néz:
//   1. Szerződés űrlap: Igazolólap fordulónapja (1–28), alatta a magyarázat;
//      mentés után a kártyán az időszak.
//   2. Igazolólap: a mai napot tartalmazó időszak nyílik (15-i fordulónál a
//      15-étől 14-éig tartó), kiírva; új sor oda kerül; a nyíl a következő
//      időszakra lép; a Word fájl neve az időszak első napjával.
//   3. Fordulónap-váltás kitöltött, nyitott lap mellett: érthető hibaüzenet.
//   4. Igazolólap menü: a cég sorában az időszak.
import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
async function belep(p, email = 'tulaj@mosathat.hu') {
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
}
async function menu(p, nev) {
  await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  await p.waitForTimeout(1500)
}
const ket = (n) => String(n).padStart(2, '0')
const rovid = new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const nap = (d) => rovid.format(new Date(`${d}T12:00:00Z`))
const honapNev = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long', timeZone: 'UTC' })

const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(p)
const ma = await p.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date()))

// A mai napot tartalmazó 15-i időszak és a következő
let ev = Number(ma.slice(0, 4)), ho = Number(ma.slice(5, 7))
if (Number(ma.slice(8, 10)) < 15) { ho--; if (ho === 0) { ho = 12; ev-- } }
const kezd = `${ev}-${ket(ho)}-15`
const vegDatum = new Date(Date.UTC(ev, ho, 14))
const veg = vegDatum.toISOString().slice(0, 10)
const kovKezd = new Date(Date.UTC(ev, ho, 15)).toISOString().slice(0, 10)
const kovVeg = new Date(Date.UTC(ev, ho + 1, 14)).toISOString().slice(0, 10)

console.log('=== 1) Szerződés: fordulónap ===\n')
await menu(p, 'Cégek és bérletesek')
const kartya = p.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).first()
await kartya.locator('.kartya-nyito').click()
await p.waitForTimeout(300)
ok('a kártyán: naptári hónap (alap)', true,
  (await kartya.locator('.adatsor').filter({ hasText: 'Igazolólap időszaka' }).innerText()).includes('naptári hónap'))
await kartya.getByRole('button', { name: 'Szerkesztés' }).click()
await p.waitForTimeout(800)
{
  const urlap = p.locator('[aria-label="Szerződés"]')
  ok('van fordulónap mező, alapból 1', '1', await urlap.locator('#fordulo').inputValue())
  ok('28 lehetőség', 28, await urlap.locator('#fordulo option').count())
  await urlap.locator('#fordulo').selectOption('15')
  ok('alatta a magyarázat', true,
    (await urlap.locator('#fordulo ~ small').innerText()).includes('15. napjától a következő hónap 14. napjáig'))
  await urlap.getByRole('button', { name: 'Mentés' }).click()
  await p.waitForTimeout(1500)
  ok('mentve, az űrlap bezárult', 0, await p.locator('[aria-label="Szerződés"]').count())
}
await kartya.locator('.kartya-nyito').click()
await p.waitForTimeout(300)
ok('a kártyán az időszak', true,
  (await kartya.locator('.adatsor').filter({ hasText: 'Igazolólap időszaka' }).innerText())
    .includes('15. naptól a következő hónap 14. napjáig'))

console.log('\n=== 2) Igazolólap: az időszak ===\n')
await kartya.locator('.ceg-lap-sor button').click()
await p.waitForSelector('.lap-igazolo')
await p.waitForTimeout(1000)
const lap = p.locator('.lap-igazolo')
{
  ok('a mai napot tartalmazó időszak hónapja', honapNev.format(new Date(`${kezd}T12:00:00Z`)),
    (await lap.locator('.honap-nev').innerText()).trim())
  ok('kiírva az időszak', true,
    (await lap.locator('.igazolo-idoszak').innerText()).includes(`${nap(kezd)} – ${nap(veg)}`))
  await lap.getByRole('button', { name: '+ Új sor' }).click()
  const urlap = p.locator('[aria-label="Igazolólap sora"]')
  await urlap.waitFor()
  ok('az új sor a mai nappal', ma, await urlap.locator('#ig-nap').inputValue())
  await urlap.locator('#ig-rsz').fill('FOR-001')
  await urlap.getByRole('button', { name: 'Mentés' }).click()
  await p.waitForTimeout(1200)
  ok('a sor ezen az időszakon', 1, await lap.locator('.igazolo-tabla tbody tr').count())
  ok('a lapok listájában az időszak neve', true,
    (await lap.locator('.honap-gombok').innerText()).includes(`${nap(kezd)} – `))
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 30000 }),
    lap.getByRole('button', { name: 'Word letöltés' }).click(),
  ])
  ok('a Word neve az időszak első napjával', `Igazololap_Auto_Trans_Kft_${kezd}.docx`, dl.suggestedFilename())

  await lap.getByRole('button', { name: 'Következő hónap' }).click()
  await p.waitForTimeout(1000)
  ok('a nyíl a következő időszakra lép', true,
    (await lap.locator('.igazolo-idoszak').innerText()).includes(`${nap(kovKezd)} – ${nap(kovVeg)}`))
  ok('ott még nincs sor', 0, await lap.locator('.igazolo-tabla tbody tr').count())
  await p.screenshot({ path: '/tmp/v41-igazolo.png' })
  await lap.locator('.lap-lab button').filter({ hasText: 'Bezárás' }).click()
  await p.waitForTimeout(500)
}

console.log('\n=== 3) Fordulónap-váltás kitöltött, nyitott lap mellett ===\n')
await kartya.locator('.kartya-nyito').click().catch(() => {})
await p.waitForTimeout(300)
if (!(await kartya.getByRole('button', { name: 'Szerkesztés' }).isVisible())) {
  await kartya.locator('.kartya-nyito').click(); await p.waitForTimeout(300)
}
await kartya.getByRole('button', { name: 'Szerkesztés' }).click()
await p.waitForTimeout(800)
{
  const urlap = p.locator('[aria-label="Szerződés"]')
  await urlap.locator('#fordulo').selectOption('1')
  await urlap.getByRole('button', { name: 'Mentés' }).click()
  await p.waitForTimeout(1200)
  ok('érthető hibaüzenet: előbb lezárni', true,
    (await urlap.locator('.hibauzenet').innerText()).includes('le vannak zárva'))
  await urlap.getByRole('button', { name: 'Mégse' }).click()
  await p.waitForTimeout(400)
}

console.log('\n=== 4) Igazolólap menü ===\n')
await menu(p, 'Igazolólap')
{
  const sor = p.locator('.igazolo-ceg').filter({ hasText: 'Autó Trans' })
  ok('a cég sorában az időszak', true, (await sor.innerText()).includes(`${nap(kezd)} – ${nap(veg)}`))
  ok('és a sorai', true, (await sor.innerText()).includes('1 autó'))
  await sor.getByRole('button', { name: 'Megnyitás' }).click()
  await p.waitForSelector('.lap-igazolo')
  await p.waitForTimeout(800)
  ok('innen is ugyanaz az időszak nyílik', 1, await p.locator('.lap-igazolo .igazolo-tabla tbody tr').count())
  await p.screenshot({ path: '/tmp/v41-menu.png' })
}
await ctx.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
