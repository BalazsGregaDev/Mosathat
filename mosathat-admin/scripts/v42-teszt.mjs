// v42 ellenőrzése Playwrighttal: Igazolólap menü → „Szerződés részletei".
//
// Futtatás:  npm run dev -- --port 5180   (másik ablakban)
//            node scripts/v42-teszt.mjs
//
// Amit néz: a cég sorában a gomb átvált a Cégek és bérletesek oldalra, a
// Szerződéses cégek fülön a cég kártyája nyitva, kiemelve, látható helyen;
// alkalmazottnál is; a menüből odalépve nincs kinyitva semmi.
import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
async function belep(p, email) {
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
const lathato = (l) => l.evaluate((e) => {
  const r = e.getBoundingClientRect()
  return r.top >= 0 && r.top < window.innerHeight
})

console.log('=== Tulajdonos ===\n')
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 700 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
  await belep(p, 'tulaj@mosathat.hu')
  await menu(p, 'Igazolólap')
  const sor = p.locator('.igazolo-ceg').filter({ hasText: 'Autó Trans' })
  ok('a cég sorában: Szerződés részletei', 1, await sor.getByRole('button', { name: 'Szerződés részletei' }).count())
  await sor.getByRole('button', { name: 'Szerződés részletei' }).click()
  await p.waitForTimeout(1500)
  ok('átváltott a Cégek és bérletesek oldalra', 'Cégek és bérletesek',
    (await p.locator('.oldal-fej h2').innerText()).trim())
  ok('a Szerződéses cégek fül aktív', true,
    (await p.locator('.fulek button.aktiv').innerText()).includes('Szerződéses cégek'))
  const kartya = p.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).first()
  ok('a cég kártyája nyitva', 'true', await kartya.getAttribute('data-nyitva'))
  ok('kiemelve', 'true', await kartya.getAttribute('data-kiemelt'))
  ok('a részletek látszanak (Szerkesztés gomb)', 1, await kartya.getByRole('button', { name: 'Szerkesztés' }).count())
  ok('a kártya a képernyőn', true, await lathato(kartya))
  await p.screenshot({ path: '/tmp/v42-tulaj.png' })
  await p.waitForTimeout(2800)
  ok('a kiemelés elhalványul', null, await kartya.getAttribute('data-kiemelt'))

  await menu(p, 'Időpontok')
  await menu(p, 'Cégek és bérletesek')
  ok('a menüből odalépve nincs kinyitva', 'false',
    await p.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).first().getAttribute('data-nyitva'))
  await ctx.close()
}

console.log('\n=== Alkalmazott ===\n')
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 600 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
  await belep(p, 'alkalmazott@mosathat.hu')
  await menu(p, 'Igazolólap')
  await p.locator('.igazolo-ceg').filter({ hasText: 'Autó Trans' })
    .getByRole('button', { name: 'Szerződés részletei' }).click()
  await p.waitForTimeout(1800)
  const k = p.locator('.ceg-kartya').filter({ hasText: 'Autó Trans' }).first()
  ok('átváltott, a cég szerződése kiemelve', 'true', await k.getAttribute('data-kiemelt'))
  ok('a képernyőn, az árakkal', [true, true], [await lathato(k), (await k.innerText()).includes('Normál')])
  await ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
