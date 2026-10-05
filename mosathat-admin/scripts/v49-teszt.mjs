// v49: „Kész van" ablak a munkalistával. Ami kimaradt, nem számít bele az
// árba; a munkalapon üres négyzettel, „kimaradt" jelöléssel látszik;
// Visszanyit után az ár és a pipák visszaállnak.
import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const szam = (s) => Number(String(s).replace(/[^\d]/g, ''))
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(2500)
await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).first().click()
await p.waitForTimeout(1500)

const ablak = p.locator('.kesz-ablak')
const csoport = (kulcs) => ablak.locator(`.munkacsoport[data-csoport="${kulcs}"]`)

console.log('=== 1) Az ablak: Külső, Belső, Egyéb szolgáltatások; Mégse nem változtat ===\n')
const a = p.locator('.napi-lista .kartya').filter({ hasText: 'ABC-123' }).first()
const aAllas = (await a.locator('.lista-jelzo').innerText()).trim()
await a.getByRole('button', { name: 'Kész van' }).click()
await p.waitForTimeout(1000)
ok('megnyílt az ablak', 1, await ablak.count())
ok('a három csoport', ['Külső', 'Belső', 'Egyéb szolgáltatások'],
  await ablak.locator('.munkacsoport-fej .cim').allTextContents())
const korabban = await ablak.locator('input:checked:disabled').count()
ok('a már kész pontok pipája áll (nem vehető le)', 4, korabban)
await ablak.getByRole('button', { name: 'Minden kész' }).click()
await p.waitForTimeout(600)
ok('Minden kész: nincs árcsökkenés', 'false', await ablak.locator('.kesz-ar').getAttribute('data-csokken'))
ok('a gomb: Kész van', 1, await ablak.getByRole('button', { name: 'Kész van', exact: true }).count())
// az egyéb szolgáltatás kimarad
await csoport('EGYEB').locator('label.munka').first().click()
await p.waitForTimeout(700)
// (a demóban ennek az extrának 0 Ft az ára: az ár nem változik, de kiírja)
ok('az extra kimarad: kiírja', true, /Kimarad: Felni és gumi/.test(await ablak.locator('.kesz-ar-ok').innerText()))
ok('a pont mellett: kimarad', 1, await csoport('EGYEB').locator('.kimaradt-cimke').count())
ok('a gomb: Kész van, a többi kimaradt', 1, await ablak.getByRole('button', { name: 'Kész van, a többi kimaradt' }).count())
await ablak.getByRole('button', { name: 'Mégse' }).click()
await p.waitForTimeout(800)
ok('Mégse: az ablak bezárult, semmi sem változott', [0, 'IN_PROGRESS', aAllas],
  [await ablak.count(), await a.getAttribute('data-allapot'), (await a.locator('.lista-jelzo').innerText()).trim()])

console.log('\n=== 2) Csak a Külső készült el: Csak kívül ár ===\n')
const k = p.locator('.napi-lista .kartya').filter({ hasText: 'LMN-882' }).first()
const regiAr = szam(await k.locator('.ar-kiemelt').innerText())
await k.getByRole('button', { name: 'Kész van' }).click()
await p.waitForTimeout(1000)
await csoport('KULSO').getByRole('button', { name: 'Mind kész' }).click()
await p.waitForTimeout(800)
ok('Belső terület kimarad: árcsökkenés', 'true', await ablak.locator('.kesz-ar').getAttribute('data-csokken'))
ok('az ok: Belső terület', true, /Belső terület/.test(await ablak.locator('.kesz-ar-ok').innerText()))
const ujAr = szam(await ablak.locator('.kesz-ar strong').innerText())
ok('az új ár kisebb', true, ujAr < regiAr && ujAr > 0)
const belsoDb = await csoport('BELSO').locator('label.munka').count()
await ablak.getByRole('button', { name: 'Kész van, a többi kimaradt' }).click()
await p.waitForTimeout(1800)
ok('a kártya: Kész, az új ár', ['READY', ujAr],
  [await k.getAttribute('data-allapot'), szam(await k.locator('.ar-kiemelt').innerText())])

console.log('\n=== 3) A munkalapon: üres négyzet, „kimaradt" ===\n')
await k.locator('.kartya-nyit').click()
await p.waitForTimeout(1300)
const lap = p.locator('[aria-label="Munkalap"]')
ok('a kimaradt sor', true, /Belső terület/.test(await lap.locator('[data-teszt="kimaradt"]').innerText()))
ok('a belső pontok „kimaradt" jelöléssel, üresen', belsoDb, await lap.locator('label.munka:has(.kimaradt-cimke) input:not(:checked)').count())
ok('a lista zárolva (Kész után)', 0, await lap.locator('label.munka input:not(:disabled)').count())
ok('a foglalás nem változott: Premium/Start, Teljes', true, /Teljes/i.test(await lap.innerText()))

console.log('\n=== 4) Visszanyit: ár és pipák vissza ===\n')
await p.locator('.munkalap-lab').getByRole('button', { name: 'Visszanyit' }).click()
await p.waitForTimeout(1500)
ok('nincs már kimaradt sor', 0, await lap.locator('[data-teszt="kimaradt"]').count())
await p.keyboard.press('Escape'); await p.waitForTimeout(1000)
ok('a kártya: Megérkezett, a régi ár, 0 pipa', ['ARRIVED', regiAr, '0/9'],
  [await k.getAttribute('data-allapot'), szam(await k.locator('.ar-kiemelt').innerText()),
   (await k.locator('.lista-jelzo').innerText()).trim()])

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
