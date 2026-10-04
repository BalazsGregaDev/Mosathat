// A v37 2. fázisának ellenőrzése Playwrighttal: az új időpont űrlapja és a
// munkalap.
//
// Futtatás:  npm run dev -- --port 5180   (másik ablakban)
//            node scripts/fazis2-teszt.mjs
//
// Amit néz:
//   1. Új időpont: a Start alapból ki van választva, nincs Ülések mező,
//      Hozza / Viszi nappal és órával, többnapos jelzés, narancs extra.
//   2. Cég: a kereső a meglévő céget adja; szerződéses cégnél megjelenik a
//      Flotta / Saját, és az ár a választással együtt változik.
//   3. Elírt cégnév mentéskor: „Erre a cégre gondoltál?"
//   4. Munkalap: a sorok sorrendje, a Cég átírása, a Hozza / Viszi.
//   5. „Kész van": rákérdez, a Nem nem csinál semmit, az Igen csak az
//      állapotot váltja — a lista nem tölt újra és nem rendeződik át.
//   6. Telefonon és tableten az ablak a látható képernyőn belül marad.
import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const szam = (s) => Number(String(s).replace(/[^0-9]/g, ''))

async function belep(p) {
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
}
async function idopontok(p) {
  await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(500)
  await p.locator('.fiok button').filter({ hasText: 'Időpontok' }).first().click()
  await p.waitForTimeout(2000)
}
const osszeg = (p) => p.locator('.lap-lab .osszeg .ertek').innerText()

// =============================================================================
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(p)
await idopontok(p)

console.log('=== 1) új időpont: alapállapot ===\n')
await p.locator('.fab').click(); await p.waitForTimeout(2000)
{
  const r = await p.evaluate(() => ({
    csomag: document.querySelector('.csomag[aria-pressed="true"] .nev')?.textContent,
    ules: document.querySelector('.lap-torzs').innerText.includes('Ülések'),
    tobbnapos: [...document.querySelectorAll('.valaszto button')].some((x) => x.textContent === 'Több napos'),
    ma: document.querySelector('#datum').value,
  }))
  ok('a Start alapból ki van választva', 'Start', r.csomag)
  ok('nincs Ülések mező', false, r.ules)
  ok('nincs külön „Több napos" gomb', false, r.tobbnapos)
  globalThis.MA = r.ma
}

await p.locator('.valaszto button').filter({ hasText: 'Itt hagyja' }).click()
await p.waitForTimeout(300)
{
  const sorok = await p.locator('.napora-sor .napora-cim').allInnerTexts()
  ok('Hozza és Viszi sor', ['Hozza', 'Viszi'], sorok)
  const d = new Date(`${MA}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 2)
  await p.locator('#viszinap').fill(d.toISOString().slice(0, 10))
  await p.waitForTimeout(300)
  ok('a későbbi Viszi nap többnapos', true, await p.locator('.tobbnapos-jelzes').isVisible())
  globalThis.VISZI = d.toISOString().slice(0, 10)
}

// extra: narancs
await p.locator('.osszecsuk').filter({ hasText: 'Egyéb szolgáltatások' }).click()
await p.waitForTimeout(300)
await p.locator('.extra').first().click()
await p.waitForTimeout(300)
{
  const bg = await p.locator('.extra[data-aktiv="true"]').first()
    .evaluate((e) => getComputedStyle(e).backgroundColor)
  ok('a kiválasztott extra narancs hátterű', 'rgb(253, 238, 221)', bg)
  await p.locator('.extra[data-aktiv="true"]').first().click()   // vissza
  await p.waitForTimeout(300)
  await p.locator('.osszecsuk').filter({ hasText: 'Egyéb szolgáltatások' }).click()
  await p.waitForTimeout(300)
}

console.log('\n=== 2) cég kereső és Flotta / Saját ===\n')
await p.locator('#ceg').fill('Autó Tr')
await p.waitForTimeout(700)
{
  const sor = p.locator('.ceg-kereso .talalatsor').first()
  ok('a kereső hozza a céget', true, (await sor.innerText()).includes('Autó Trans'))
  ok('szerződés jelölés a találaton', true, (await sor.innerText()).includes('szerződés'))
  await sor.click()
  await p.waitForTimeout(900)
  ok('meglévő cég', 'meglévő cég', await p.locator('.ceg-allapot').innerText())
  ok('megjelent a Flotta / Saját', true,
    await p.locator('.valaszto button').filter({ hasText: 'Flotta' }).isVisible())
  const flotta = szam(await osszeg(p))
  await p.locator('.valaszto button').filter({ hasText: 'Saját' }).click()
  await p.waitForTimeout(900)
  const sajat = szam(await osszeg(p))
  ok('Flotta: Start szerződéses ára', 10500, flotta)
  ok('Saját: a magán ár', 12500, sajat)
}

await p.locator('#rendszam').fill('TST-001')
await p.locator('#nev').fill('Teszt Elek')
await p.locator('#tel').fill('+36301234567')
await p.locator('.lap-torzs').click({ position: { x: 5, y: 5 } })
await p.waitForTimeout(400)
await p.getByRole('button', { name: 'Foglalás rögzítése' }).click()
await p.waitForTimeout(2000)
ok('a foglalás elment (az ablak bezárult)', 0, await p.locator('.lap[aria-label="Új időpont"]').count())

console.log('\n=== 3) elírt cégnév: rákérdez ===\n')
await p.locator('.fab').click(); await p.waitForTimeout(1500)
await p.locator('#rendszam').fill('TST-002')
await p.locator('#nev').fill('Elírt Ede')
await p.locator('#tel').fill('+36301234568')
await p.locator('#ceg').fill('Auto Trns')
await p.locator('#tel').click()
await p.waitForTimeout(400)
await p.getByRole('button', { name: 'Foglalás rögzítése' }).click()
await p.waitForTimeout(1200)
{
  const cim = await p.locator('.kerdes-ablak h2').innerText().catch(() => null)
  ok('megkérdezi: „Erre a cégre gondoltál?"', 'Erre a cégre gondoltál?', cim)
  await p.locator('.kerdes-ablak button').filter({ hasText: 'Igen: Autó Trans' }).click()
  await p.waitForTimeout(2000)
  ok('az Igen után elment', 0, await p.locator('.lap[aria-label="Új időpont"]').count())
}

console.log('\n=== 4) munkalap: sorrend, cég, Hozza / Viszi ===\n')
await p.locator('.kartya').filter({ hasText: 'TST-001' }).locator('.kartya-nyit').click()
await p.waitForTimeout(1500)
{
  const cimkek = await p.evaluate(() =>
    [...document.querySelector('.lap-torzs .szakasz').querySelectorAll(':scope > .adatsor')]
      .map((e) => e.firstElementChild.textContent.trim()))
  console.log(`         ${JSON.stringify(cimkek)}`)
  // v38: szerződéses cégnél a Cég alatt ott az Igazolólap sora is.
  ok('a sorok sorrendje', ['Név', 'Telefon', 'Cég', 'Igazolólap', 'Rendszám', 'Autó', 'Hozza', 'Viszi', 'Méret',
    'Jármű típus', 'Csomag', 'Egyéb szolgáltatás', 'Terjedelem', 'Típus', 'Munkaóra'], cimkek)
  const ceg = await p.locator('.adatsor').filter({ hasText: /^Cég/ }).first().innerText()
  ok('a cég rögzült elsőre is', true, ceg.includes('Autó Trans'))
  ok('Jármű típus: Saját', true,
    (await p.locator('.adatsor').filter({ hasText: 'Jármű típus' }).locator('button[aria-pressed="true"]').innerText()) === 'Saját')
  ok('a Viszi mellett: 3 nap', '3 nap', await p.locator('.tobbnapos-pill').innerText())
  const viszi = await p.locator('input[aria-label="Viszi napja"]').inputValue()
  ok('a Viszi napja a beírt nap', VISZI, viszi)

  // Viszi órája: átírás, kilépés → mentés
  await p.locator('input[aria-label="Viszi órája"]').fill('16:30')
  await p.locator('input[aria-label="Viszi órája"]').blur()
  await p.waitForTimeout(1500)
  ok('a Viszi órája elment', '16:30', await p.locator('input[aria-label="Viszi órája"]').inputValue())
}
await p.locator('.lap-fej .bezar').click(); await p.waitForTimeout(800)

// Cég átírása egy foglaláson, amin nincs cég
await p.locator('.kartya').filter({ hasText: 'ABC-123' }).first().locator('.kartya-nyit').click()
await p.waitForTimeout(1500)
{
  await p.locator('.adatsor').filter({ hasText: /^Cég/ }).locator('.szerk-ertek').click()
  await p.waitForTimeout(300)
  await p.locator('#munkalap-ceg').fill('Teszt Cég Bt')
  await p.locator('#munkalap-ceg').press('Enter')
  await p.waitForTimeout(1800)
  const ceg = await p.locator('.adatsor').filter({ hasText: /^Cég/ }).first().innerText()
  ok('a munkalapon a cég átírható', true, ceg.includes('Teszt Cég Bt'))
}

console.log('\n=== 5) „Kész van": rákérdez, nem tölt újra ===\n')
{
  // A munkalapon: Megérkezett (nem kérdez) → Kész van (kérdez)
  const lab = p.locator('.munkalap-lab')
  if (await lab.getByRole('button', { name: 'Megérkezett' }).count()) {
    await lab.getByRole('button', { name: 'Megérkezett' }).click()
    await p.waitForTimeout(1200)
  }
  ok('a Megérkezett nem kérdez', 0, await p.locator('.kerdes-ablak').count())
  await lab.getByRole('button', { name: 'Kész van' }).click()
  await p.waitForTimeout(400)
  ok('„Biztosan elkészült?"', 'Biztosan elkészült?', await p.locator('.kerdes-ablak h2').innerText())
  ok('Igen / Nem gomb', ['Nem', 'Igen'], await p.locator('.kerdes-gombok button').allInnerTexts())
  await p.locator('.kerdes-gombok button').filter({ hasText: 'Nem' }).click()
  await p.waitForTimeout(600)
  ok('a Nem után marad a Kész van', 1, await lab.getByRole('button', { name: 'Kész van' }).count())
  ok('és a munkalap nyitva marad', 1, await p.locator('.munkalap-lab').count())
  await lab.getByRole('button', { name: 'Kész van' }).click()
  await p.waitForTimeout(300)
  await p.locator('.kerdes-gombok button').filter({ hasText: 'Igen' }).click()
  await p.waitForTimeout(1200)
  ok('az Igen után: Átvette a következő', 1, await lab.getByRole('button', { name: 'Átvette' }).count())
  // v40: szerződéses cég autója — Kész van után megnyílik az igazolólap sora.
  ok('szerződéses cégnél megnyílt az igazolólap sora', 1, await p.locator('[aria-label="Igazolólap sora"]').count())
  await p.locator('[aria-label="Igazolólap sora"]').getByRole('button', { name: 'Mégse' }).click()
  await p.waitForTimeout(400)
}
await p.locator('.lap-fej .bezar').click(); await p.waitForTimeout(1200)

// A kártyán: a sorrend és a „Betöltés…" figyelése
{
  await p.evaluate(() => {
    window.__betolt = 0
    new MutationObserver(() => {
      if (document.querySelector('.betolt')) window.__betolt++
    }).observe(document.body, { childList: true, subtree: true })
  })
  const elotte = await p.locator('.kartya .rendszam').allInnerTexts()
  const kartya = p.locator('.kartya').filter({ has: p.locator('.kartya-muvelet button', { hasText: 'Megérkezett' }) }).first()
  const rsz = await kartya.locator('.rendszam').innerText()
  await kartya.locator('.kartya-muvelet button', { hasText: 'Megérkezett' }).click()
  await p.waitForTimeout(1200)
  const k2 = p.locator('.kartya').filter({ hasText: rsz }).first()
  await k2.locator('.kartya-muvelet button', { hasText: 'Kész van' }).click()
  await p.waitForTimeout(300)
  ok('a kártyán is rákérdez', 'Biztosan elkészült?', await p.locator('.kerdes-ablak h2').innerText())
  await p.locator('.kerdes-gombok button').filter({ hasText: 'Igen' }).click()
  await p.waitForTimeout(1500)
  const utana = await p.locator('.kartya .rendszam').allInnerTexts()
  // Az állapot felirata nincs a kártyán: a kártya bal szélének színe mondja.
  ok(`${rsz}: csak az állapota változott`, 'READY',
    await k2.getAttribute('data-allapot'))
  ok('a sorrend nem változott', elotte, utana)
  ok('nem jelent meg a „Betöltés…"', 0, await p.evaluate(() => window.__betolt))
  // v40: ha szerződéses cég autója volt, megnyílt az igazolólap sora — bezárjuk.
  if (await p.locator('[aria-label="Igazolólap sora"]').count()) {
    await p.locator('[aria-label="Igazolólap sora"]').getByRole('button', { name: 'Mégse' }).click()
    await p.waitForTimeout(400)
  }
}

console.log('\n=== 6) telefon: az ablak a látható képernyőn belül ===\n')
await p.locator('.kartya .kartya-nyit').first().click()
await p.waitForTimeout(1200)
{
  const r = await p.evaluate(() => {
    const f = document.querySelector('.fedo').getBoundingClientRect()
    const l = document.querySelector('.lap-lab').getBoundingClientRect()
    return { fh: Math.round(f.height), ih: window.innerHeight, lb: Math.round(l.bottom) }
  })
  ok('a fedő pont a látható magasság', r.ih, r.fh)
  ok('a láb a képernyőn belül', true, r.lb <= r.ih)
}
await p.screenshot({ path: '/tmp/f2-munkalap.png' })
await ctx.close()

// =============================================================================
console.log('\n=== 7) tablet: térköz és a láb a képernyőn belül ===\n')
const ctx3 = await b.newContext({ viewport: { width: 800, height: 1180 }, isMobile: true, hasTouch: true })
const t = await ctx3.newPage()
t.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(t)
await idopontok(t)
await t.locator('.kartya .kartya-nyit').first().click()
await t.waitForTimeout(1200)
{
  const r = await t.evaluate(() => {
    const l = document.querySelector('.lap').getBoundingClientRect()
    return { top: Math.round(l.top), bottom: Math.round(l.bottom), ih: window.innerHeight }
  })
  console.log(`         lap: ${r.top}–${r.bottom}, képernyő: ${r.ih}`)
  ok('felül van térköz', true, r.top >= 16)
  ok('alul van térköz', true, r.bottom <= r.ih - 16)
}
await t.screenshot({ path: '/tmp/f2-tablet.png' })
await ctx3.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
