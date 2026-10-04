// v39 ellenőrzése Playwrighttal.
//
// Futtatás:  npm run dev -- --port 5180   (másik ablakban)
//            node scripts/v39-teszt.mjs
//
// Amit néz:
//   1. Cégek és bérletesek: a Szerződéses cégek az első, alapértelmezett fül.
//   2. A szerződéses cég kártyáján (csukva is) Igazolólap gomb: megnyílik a
//      lap, onnan beállítás és Word letöltés.
//   3. Igazolólap: bármelyik korábbi hónap megnyitható (év + hónap), oda is
//      vehető fel sor; a lezárt hónap csak olvasható és letölthető (nincs
//      Oszlopok és lábléc, nincs Új sor, a sor mezői tiltva).
//   4. Szerződés űrlap: Bruttó / Nettó csúszka fent; átvált minden mezőt (a
//      fuvarét is), alatta a másik ár; nettóban beírt ár bruttóként mentődik;
//      a böngésző megjegyzi a módot.
//   5. Alkalmazott: a szerződéses cégek elöl, az igazolólap megnyitható.
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
  if (await p.locator('.mobil-fejlec .hamburger').isVisible()) {
    await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
    await p.locator('.fiok button').filter({ hasText: nev }).first().click()
  } else {
    await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  }
  await p.waitForTimeout(1500)
}

// =============================================================================
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(p)
const ma = await p.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date()))
await menu(p, 'Cégek és bérletesek')

console.log('=== 1) Fülek ===\n')
ok('az első fül a Szerződéses cégek', true,
  (await p.locator('.fulek button').first().innerText()).includes('Szerződéses cégek'))
ok('alapból a Szerződéses cégek látszik', true,
  (await p.locator('.fulek button.aktiv').innerText()).includes('Szerződéses cégek'))
ok('a szerződés kártyája látszik', 1,
  await p.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).count())

console.log('\n=== 2) Igazolólap a szerződés kártyáján ===\n')
const kartya = p.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).first()
ok('csukott kártyán is van Igazolólap gomb', 1, await kartya.locator('.ceg-lap-sor button').count())
await kartya.locator('.ceg-lap-sor button').click()
await p.waitForSelector('.lap-igazolo')
await p.waitForTimeout(800)
const lap = p.locator('.lap-igazolo')
ok('a lap a cég nevével nyílik', true, (await lap.locator('.lap-fej').innerText()).includes('Autó Trans'))
ok('onnan a beállítás elérhető', 1, await lap.getByRole('button', { name: 'Oszlopok és lábléc' }).count())
{
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 30000 }),
    lap.getByRole('button', { name: 'Word letöltés' }).click(),
  ])
  ok('onnan a Word letöltés is megy', true, dl.suggestedFilename().endsWith('.docx'))
}

console.log('\n=== 3) Korábbi hónap, korlát nélkül; lezárt csak olvasható ===\n')
{
  const ev = String(Number(ma.slice(0, 4)) - 3)
  await lap.locator('.honap-ugras input[aria-label="Év"]').fill(ev)
  await lap.locator('.honap-ugras select[aria-label="Hónap"]').selectOption('3')
  await p.waitForTimeout(800)
  ok('három évvel korábbi március nyílt meg', `${ev}. március`, (await lap.locator('.honap-nev').innerText()).trim())
  ok('még nincs sora', true, (await lap.locator('.igazolo-allapot').innerText()).includes('még nincs sora'))
  await lap.getByRole('button', { name: '+ Új sor' }).click()
  const urlap = p.locator('[aria-label="Igazolólap sora"]')
  await urlap.waitFor()
  ok('az új sor dátuma abban a hónapban', `${ev}-03-01`, await urlap.locator('#ig-nap').inputValue())
  await urlap.locator('#ig-rsz').fill('OLD-001')
  await urlap.locator('#ig-netto').fill('9000')
  await urlap.getByRole('button', { name: 'Mentés' }).click()
  await p.waitForTimeout(1200)
  ok('a régi hónapba is felkerült a sor', 1, await lap.locator('.igazolo-tabla tbody tr').count())
  ok('a lapok listájában ott a régi hónap', true,
    (await lap.locator('.honap-gombok').innerText()).includes(`${ev}. március`))

  // Lezárás
  await lap.getByRole('button', { name: 'Hónap lezárása' }).click()
  await p.waitForTimeout(300)
  await p.locator('.kerdes-gombok button').filter({ hasText: 'Lezárás' }).click()
  await p.waitForTimeout(1200)
  ok('lezárva', true, (await lap.locator('.igazolo-allapot').innerText()).startsWith('lezárva'))
  ok('lezártnál nincs Oszlopok és lábléc', 0, await lap.getByRole('button', { name: 'Oszlopok és lábléc' }).count())
  ok('lezártnál nincs Új sor', 0, await lap.getByRole('button', { name: '+ Új sor' }).count())
  ok('a figyelmeztetés: csak megnézni és letölteni', true,
    (await lap.locator('.figyelmeztet').innerText()).includes('csak megnézni és letölteni'))
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 30000 }),
    lap.getByRole('button', { name: 'Word letöltés' }).click(),
  ])
  ok('a lezárt hónap letölthető', `Igazololap_Auto_Trans_Kft_${ev}-03.docx`, dl.suggestedFilename())
  await lap.locator('.igazolo-tabla tbody tr').first().click()
  await urlap.waitFor()
  ok('a lezárt sor csak olvasható', [true, true, 0], [
    await urlap.locator('#ig-km').isDisabled(),
    await urlap.locator('#ig-rsz').isDisabled(),
    await urlap.getByRole('button', { name: 'Mentés' }).count()])
  await urlap.locator('.lap-lab button').filter({ hasText: 'Bezárás' }).click()
  await p.waitForTimeout(300)

  // Vissza a mostani hónapra a lapok listájából / nyíllal: ott újra van beállítás
  await lap.locator('.honap-ugras input[aria-label="Év"]').fill(ma.slice(0, 4))
  await lap.locator('.honap-ugras select[aria-label="Hónap"]').selectOption(String(Number(ma.slice(5, 7))))
  await p.waitForTimeout(800)
  ok('a mostani hónapban újra van Oszlopok és lábléc', 1,
    await lap.getByRole('button', { name: 'Oszlopok és lábléc' }).count())
  await p.screenshot({ path: '/tmp/v39-igazolo.png' })
  await lap.locator('.lap-lab button').filter({ hasText: 'Bezárás' }).click()
  await p.waitForTimeout(400)
}

console.log('\n=== 4) Szerződés: Bruttó / Nettó csúszka ===\n')
await kartya.locator('.kartya-nyito').click()
await p.waitForTimeout(300)
await kartya.getByRole('button', { name: 'Szerkesztés' }).click()
await p.waitForTimeout(800)
{
  const urlap = p.locator('[aria-label="Szerződés"]')
  const csuszka = urlap.getByRole('switch', { name: 'Nettó árak megadása' })
  ok('a csúszka fent van, alapból Bruttó', 'false', await csuszka.getAttribute('aria-checked'))
  const mezo = urlap.getByLabel('Start · Normál méret · Céges ár')
  ok('bruttó módban a bruttó ár', '10500', await mezo.inputValue())
  const alatta = mezo.locator('xpath=following-sibling::small')
  ok('alatta a nettó', true, (await alatta.innerText()).startsWith('nettó'))
  ok('a fuvar is bruttó', '4000', await urlap.getByLabel('Fuvar ára alkalmanként').inputValue())

  await csuszka.click()
  await p.waitForTimeout(200)
  ok('a csúszka Nettóra vált', 'true', await csuszka.getAttribute('aria-checked'))
  ok('nettó módban minden mező nettó (10 500 / 1,27)', '8268', await mezo.inputValue())
  ok('alatta a bruttó', true, (await alatta.innerText()).replace(/\s/g, '').startsWith('bruttó10500'))
  ok('a fuvar is nettó (4000 / 1,27)', '3150', await urlap.getByLabel('Fuvar ára alkalmanként').inputValue())

  // Nettóban beírt ár: bruttóként mentődik
  await mezo.fill('10000')
  await p.waitForTimeout(100)
  ok('beírva 10 000 nettó: a mező nem ugrik el', '10000', await mezo.inputValue())
  ok('alatta: bruttó 12 700', true, (await alatta.innerText()).replace(/\s/g, '').startsWith('bruttó12700'))
  await csuszka.click()
  await p.waitForTimeout(200)
  ok('vissza bruttóra: 12 700', '12700', await mezo.inputValue())
  await csuszka.click()             // nettóban hagyjuk: ezt jegyzi meg a böngésző
  await urlap.getByRole('button', { name: 'Mentés' }).click()
  await p.waitForTimeout(1500)
  // Mentés után a lista újratöltődik, a kártya csukva jön vissza.
  await kartya.locator('.kartya-nyito').click()
  await p.waitForTimeout(300)
  ok('mentve: a kártyán bruttó 12 700 Ft', true,
    (await kartya.locator('.szerzodes-arak').innerText()).replace(/\s/g, '').includes('12700Ft'))

  await kartya.getByRole('button', { name: 'Szerkesztés' }).click()
  await p.waitForTimeout(800)
  ok('újranyitva a böngésző megjegyezte: Nettó', 'true',
    await p.locator('[aria-label="Szerződés"]').getByRole('switch', { name: 'Nettó árak megadása' }).getAttribute('aria-checked'))
  ok('és a mentett ár nettóban pontosan 10 000', '10000',
    await p.locator('[aria-label="Szerződés"]').getByLabel('Start · Normál méret · Céges ár').inputValue())
  await p.screenshot({ path: '/tmp/v39-szerzodes.png' })
  await p.locator('[aria-label="Szerződés"]').getByRole('button', { name: 'Mégse' }).click()
  await p.waitForTimeout(300)
}

// Az igazolólap lábléce is a nettót mutatja: 10 000 Ft + ÁFA
await kartya.locator('.ceg-lap-sor button').click()
await p.waitForSelector('.lap-igazolo')
await p.waitForTimeout(800)
ok('az igazolólap láblécében a beírt nettó', true,
  (await p.locator('.lap-igazolo .igazolo-lablec').innerText()).replace(/\s/g, '').includes('Start–Céges:10000Ft'))
await ctx.close()

// =============================================================================
console.log('\n=== 5) Alkalmazott, telefonon ===\n')
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const m = await ctx2.newPage()
m.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(m, 'alkalmazott@mosathat.hu')
await menu(m, 'Cégek és bérletesek')
{
  ok('a szerződéses cégek állnak elöl', 'Szerződéses cégek',
    (await m.locator('.oldal .panel h3').first().textContent()).trim())
  await m.locator('.ceg-kartya').filter({ hasText: 'Autó Trans' }).getByRole('button', { name: 'Igazolólap' }).click()
  await m.waitForSelector('.lap-igazolo')
  await m.waitForTimeout(800)
  ok('az igazolólap megnyílt', 1, await m.locator('.lap-igazolo').count())
  ok('alkalmazottnak nincs Oszlopok és lábléc', 0,
    await m.locator('.lap-igazolo').getByRole('button', { name: 'Oszlopok és lábléc' }).count())
  const r = await m.evaluate(() => {
    const t = document.querySelector('.lap-igazolo .lap-torzs')
    return { sw: t.scrollWidth, cw: t.clientWidth }
  })
  ok('a hónapválasztóval sem lóg ki oldalra', true, r.sw <= r.cw + 1)
  await m.screenshot({ path: '/tmp/v39-alkalmazott.png' })
}
await ctx2.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
