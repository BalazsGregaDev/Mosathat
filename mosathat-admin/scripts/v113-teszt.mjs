import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adminOldal, valtozas } from './_publikus.mjs'

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
const sima = (s) => s.replace(/\s+/g, ' ').trim()
const jsHiba = (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ }

async function menu(p, nev) {
  if (await p.locator('.mobil-fejlec .hamburger').isVisible()) {
    await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
    await p.locator('.fiok button').filter({ hasText: nev }).first().click()
  } else {
    await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  }
  await p.waitForTimeout(1500)
}
async function rajzol(p, vaszon) {
  const v = await vaszon.boundingBox()
  await p.mouse.move(v.x + 30, v.y + 70)
  await p.mouse.down()
  for (let i = 1; i <= 8; i++) await p.mouse.move(v.x + 30 + i * 25, v.y + 70 + (i % 2 ? -25 : 25))
  await p.mouse.up()
}

const { ctx, p, sql, belep } = await adminOldal(b, { viewport: { width: 1440, height: 1000 }, hiba: jsHiba })
await belep('tulaj@mosathat.hu')

const [kov] = await sql(`select id from customers where name = 'Kovács Péter'`)
const csomag = async (kod) => (await sql(`select id from packages where code = $1`, [kod]))[0].id
const START = await csomag('START')
const PREMIUM = await csomag('PREMIUM')
const ujFoglalas = async (rsz, pkg, statusz = 'IN_PROGRESS') => {
  const [{ id }] = await sql(
    `select create_booking(jsonb_build_object('customer_id', $1::text, 'plate_raw', $2::text, 'category', 'SZEMELYAUTO',
       'scope', 'TELJES', 'booking_type', 'VAROS', 'service_date', public.budapest_ma(), 'start_time', '11:00',
       'package_id', $3::text, 'extras', '[]'::jsonb)) id`, [kov.id, rsz, pkg])
  if (statusz !== 'CONFIRMED') await sql(`select set_booking_status($1::uuid, $2::booking_status)`, [id, statusz])
  return id
}
const b1 = await ujFoglalas('KOV-111', START)
const b2 = await ujFoglalas('KOV-222', PREMIUM)
const hasznalat = async (id) => (await sql(`select signature is not null alairva, kitoltve_at is not null kitoltve
  from pass_usages where booking_id = $1`, [id]))[0] ?? null
await valtozas(p)
await menu(p, 'Időpontok')
await p.waitForTimeout(1500)

console.log('=== 1) A bérletes foglalás a napi nézetben ===\n')
const k1 = p.locator('.napi-lista .kartya').filter({ has: p.locator('.rendszam', { hasText: 'KOV-111' }) }).first()
ok('a kártyán „bérlet" jelzés, 0 Ft (a csomag bérletből)', [true, '0 Ft'],
  [(await k1.locator('.kartya-allas').innerText()).includes('bérlet'), sima(await k1.locator('.ar-kiemelt').innerText())])
ok('van Igazolólap gombja', 1, await k1.getByRole('button', { name: /^Igazolólap$/ }).count())
const abc = p.locator('.napi-lista .kartya').filter({ has: p.locator('.rendszam', { hasText: 'ABC-123' }) }).first()
ok('a bérlet előtt foglalt, már folyamatban lévő autón nincs bérlet', false,
  (await abc.locator('.kartya-allas').innerText()).includes('bérlet'))
await kep(k1, '1-kartya')

console.log('\n=== 2) Kész van: levonja, és előjön az aláírás ===\n')
const urlap = p.locator('[aria-label="Bérlet igazolólap sora"]')
await k1.getByRole('button', { name: 'Kész van' }).click(); await p.waitForTimeout(1000)
await p.locator('.kesz-ablak').getByRole('button', { name: 'Mindennel elkészültünk' }).click()
await urlap.waitFor({ timeout: 10000 })
ok('az aláírás magától megnyílt', 1, await urlap.count())
ok('felül: levontuk a bérletből', true, (await urlap.locator('.igazolo-uzenet').innerText()).includes('levontuk a bérletből'))
ok('hányadik alkalom, melyik csomag', '3. alkalom · Start · Sedan', sima(await urlap.locator('.berlet-alkalom').innerText()))
ok('előtöltve: rendszám, név', ['KOV-111', 'Kovács Péter'],
  [await urlap.locator('#bs-rsz').inputValue(), await urlap.locator('#bs-nev').inputValue()])
ok('a bérletből már levonva (a sor létrejött)', { alairva: false, kitoltve: false }, await hasznalat(b1))
await rajzol(p, urlap.locator('.alairas-vaszon'))
await kep(urlap.locator('.lap'), '2-alairas')
await urlap.getByRole('button', { name: 'Mentés' }).click(); await p.waitForTimeout(1200)
ok('aláírva mentve', { alairva: true, kitoltve: true }, await hasznalat(b1))
await k1.getByRole('button', { name: 'Átvette' }).click(); await p.waitForTimeout(1000)
ok('Átvette: kitöltött lapnál nem nyílik újra', 0, await urlap.count())
await p.locator('.kerdes-gombok .btn-fo').click(); await p.waitForTimeout(1500)
ok('lezárva', 'COMPLETED', await k1.getAttribute('data-allapot'))

console.log('\n=== 3) Ha Kész vannál bezárják: az Átvette előtt újra kéri ===\n')
const k2 = p.locator('.napi-lista .kartya').filter({ has: p.locator('.rendszam', { hasText: 'KOV-222' }) }).first()
await k2.getByRole('button', { name: 'Kész van' }).click(); await p.waitForTimeout(1000)
await p.locator('.kesz-ablak').getByRole('button', { name: 'Mindennel elkészültünk' }).click()
await urlap.waitFor({ timeout: 10000 })
ok('a bérleten ez a 4. alkalom, a Premium tételből', '4. alkalom · Premium · Sedan', sima(await urlap.locator('.berlet-alkalom').innerText()))
await urlap.getByRole('button', { name: 'Mégse' }).click(); await p.waitForTimeout(500)
await k2.getByRole('button', { name: 'Átvette' }).click(); await p.waitForTimeout(1200)
ok('Átvette: előbb a bérlet lapja nyílik', 1, await urlap.count())
ok('a mondat: átadás előtt töltsd ki', true, (await urlap.locator('.igazolo-uzenet').innerText()).includes('Átadás előtt'))
await urlap.getByRole('button', { name: 'Mégse' }).click(); await p.waitForTimeout(800)
ok('Mégse: nem zárult le', 'READY', await k2.getAttribute('data-allapot'))
await k2.getByRole('button', { name: 'Átvette' }).click()
await urlap.waitFor()
await urlap.getByRole('button', { name: 'Mentés' }).click(); await p.waitForTimeout(800)
ok('aláírás nélkül mentve jön a lezárás kérdése', true, (await p.locator('.kerdes-ablak').innerText()).includes('Biztosan átvette'))
await p.locator('.kerdes-gombok .btn-fo').click(); await p.waitForTimeout(1500)
ok('lezárva, a sor kitöltve, aláírás nélkül', ['COMPLETED', { alairva: false, kitoltve: true }],
  [await k2.getAttribute('data-allapot'), await hasznalat(b2)])

console.log('\n=== 4) Új időpont: a bérletes csomag „Bérletből" ===\n')
await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click(); await p.waitForTimeout(1500)
{
  const lap = p.locator('dialog[aria-label="Új időpont"]')
  await lap.locator('#rendszam').fill('ABC-12'); await p.waitForTimeout(900)
  await lap.locator('.talalatsor').filter({ hasText: 'ABC-123' }).first().click(); await p.waitForTimeout(1500)
  const ar = async (nev) => sima(await lap.locator('.csomag', { has: p.locator('.nev', { hasText: new RegExp(`^${nev}$`) }) }).locator('.ar').innerText())
  ok('Start és Premium bérletből, Elit listaáron', ['Bérletből', 'Bérletből', false],
    [await ar('Start'), await ar('Premium'), (await ar('Elit')) === 'Bérletből'])
  await lap.locator('.csomag', { has: p.locator('.nev', { hasText: /^Premium$/ }) }).click(); await p.waitForTimeout(1200)
  ok('lent: a csomag bérletből, utána 0 alkalom marad', true,
    (await lap.locator('.lap-lab .osszeg .alatta').innerText()).includes('a csomag bérletből, utána 0 alkalom marad'))
  ok('az összeg 0 Ft', '0 Ft', sima(await lap.locator('.lap-lab .osszeg .ertek').innerText()))
  await kep(lap.locator('.lap'), '4-uj-idopont')
  await lap.getByRole('button', { name: 'Mégse' }).click(); await p.waitForTimeout(600)
  const kerdes = p.locator('.kerdes-gombok .btn-veszelyes, .kerdes-gombok .btn-veszelyes-teli')
  if (await kerdes.count()) { await kerdes.first().click(); await p.waitForTimeout(500) }
}

console.log('\n=== 5) Igazolólap menü: Bérletek fül, a bérlet lapja ===\n')
await menu(p, 'Igazolólap')
await p.locator('.fulek button').filter({ hasText: 'Bérletek' }).click(); await p.waitForTimeout(1200)
{
  const sor = p.locator('.igazolo-ceg').filter({ hasText: 'Kovács Péter' }).first()
  ok('a listában: 4 / 10 felhasználva, 3 aláírás hiányzik', [true, true],
    [(await sor.innerText()).includes('4 / 10 alkalom felhasználva'), (await sor.innerText()).includes('3 aláírás hiányzik')])
  await kep(p.locator('.oldal'), '5-berletek-ful')
  await sor.getByRole('button', { name: 'Megnyitás' }).click(); await p.waitForTimeout(1500)
  const lap = p.locator('[aria-label^="Bérlet igazolólap:"]')
  ok('a lapon 4 sor, sorszámmal', ['1.', '2.', '3.', '4.'],
    (await lap.locator('.igazolo-tabla tbody tr td:first-child').allInnerTexts()).map(sima))
  ok('tételek: Start 3 felhasználva, Premium 1', [true, true],
    [(await lap.locator('.berlet-tetel').nth(0).innerText()).includes('3 felhasználva'),
     (await lap.locator('.berlet-tetel').nth(1).innerText()).includes('1 felhasználva')])
  ok('az aláírás képe a 3. sorban', 1, await lap.locator('.igazolo-tabla tbody tr').nth(2).locator('img.alairas-mini').count())
  await kep(lap.locator('.lap-igazolo'), '5-berlet-lap')

  await lap.getByRole('button', { name: '+ Korábbi alkalom' }).click()
  await urlap.waitFor()
  ok('korábbi alkalom: választható tétel', ['Start · Sedan (még 5)', 'Premium · Sedan (még 1)'],
    await urlap.locator('#bs-tetel option').allInnerTexts())
  await urlap.locator('#bs-tetel').selectOption({ label: 'Premium · Sedan (még 1)' })
  await urlap.locator('#bs-rsz').fill('ABC-123')
  await urlap.locator('#bs-megj').fill('papíron vezetett')
  await kep(urlap.locator('.lap'), '5-korabbi-alkalom')
  await urlap.getByRole('button', { name: 'Mentés' }).click(); await p.waitForTimeout(1500)
  ok('új sor a lapon', 5, await lap.locator('.igazolo-tabla tbody tr').count())
  ok('a Premium elfogyott', true, (await lap.locator('.berlet-tetel').nth(1).innerText()).includes('0 szabad'))

  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 30000 }),
    lap.getByRole('button', { name: 'Word letöltés' }).click(),
  ])
  ok('a Word neve', true, /^Berlet_Kovacs_Peter_\d{4}-\d\d-\d\d\.docx$/.test(dl.suggestedFilename()))
  const ut = join(tmpdir(), `v113-${Date.now()}.docx`)
  await dl.saveAs(ut)
  const xml = execFileSync('python3', ['-c', 'import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode())', ut]).toString()
  const szoveg = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  ok('a Wordben: cím, sorok, üres sorok a maradéknak', [true, true, true, 10],
    [szoveg.includes('Kovács Péter – bérlet igazolólap'), szoveg.includes('KOV-111'), szoveg.includes('Alkalom'),
     (xml.match(/<w:tr[ >]/g) ?? []).length - 1])
  await lap.locator('.lap-lab button').filter({ hasText: 'Bezárás' }).click(); await p.waitForTimeout(600)
}

console.log('\n=== 6) Cégek és bérletesek: a kártyáról is megnyílik ===\n')
await menu(p, 'Cégek és bérletesek')
await p.locator('.fulek button').filter({ hasText: 'Bérletek' }).click(); await p.waitForTimeout(1000)
{
  const kartya = p.locator('.panel').filter({ hasText: 'Kovács Péter' }).first()
  ok('hátralévő: 5/10', true, (await kartya.innerText()).includes('5/10'))
  await kartya.locator('.kartya-nyito').first().click(); await p.waitForTimeout(500)
  await kartya.getByRole('button', { name: 'Igazolólap' }).click(); await p.waitForTimeout(1500)
  ok('megnyílt a bérlet lapja', 1, await p.locator('[aria-label^="Bérlet igazolólap:"]').count())
  await p.locator('[aria-label^="Bérlet igazolólap:"] .lap-lab button').filter({ hasText: 'Bezárás' }).click()
  await p.waitForTimeout(500)
}

console.log('\n=== 7) Munkalap: a csomag „Bérletből" ===\n')
const b3 = await ujFoglalas('KOV-333', START, 'CONFIRMED')
await valtozas(p)
await menu(p, 'Időpontok')
{
  const k3 = p.locator('.napi-lista .kartya').filter({ has: p.locator('.rendszam', { hasText: 'KOV-333' }) }).first()
  await k3.locator('.kartya-nyit').click(); await p.waitForTimeout(1500)
  const ml = p.locator('[aria-label="Munkalap"]')
  ok('a kiválasztott csomag ára: Bérletből', 'Bérletből',
    sima(await ml.locator('.csomag[aria-pressed="true"] .ar').innerText()))
  ok('lent: a csomag bérletből', true, (await ml.locator('.osszeg .alatta').innerText()).includes('a csomag bérletből'))
  ok('Bérlet igazolólap sor', 1, await ml.locator('.ml-igazolo').filter({ hasText: 'Bérlet igazolólap' }).count())
  await kep(ml.locator('.lap').first(), '7-munkalap')
  await p.keyboard.press('Escape'); await p.waitForTimeout(600)
  ok('a foglalás lefoglal egy Start alkalmat', true,
    (await sql(`select pass_item_id is not null x from bookings where id = $1`, [b3]))[0].x)
}
await ctx.close()

console.log('\n=== 8) Alkalmazott: lapot lát, korábbi alkalmat nem vesz fel ===\n')
{
  const { ctx: c2, p: a, belep: be } = await adminOldal(b, { viewport: { width: 1280, height: 900 }, hiba: jsHiba })
  await be('alkalmazott@mosathat.hu')
  await menu(a, 'Igazolólap')
  await a.locator('.fulek button').filter({ hasText: 'Bérletek' }).click(); await a.waitForTimeout(1200)
  await a.locator('.igazolo-ceg').filter({ hasText: 'Kovács Péter' }).getByRole('button', { name: 'Megnyitás' }).click()
  await a.waitForTimeout(1500)
  const lap = a.locator('[aria-label^="Bérlet igazolólap:"]')
  ok('a lap megnyílik', 2, await lap.locator('.igazolo-tabla tbody tr').count())
  ok('nincs „Korábbi alkalom" gomb', 0, await lap.getByRole('button', { name: '+ Korábbi alkalom' }).count())
  await c2.close()
}

console.log('\n=== 9) Telefon: a bérlet lapja nem lóg ki ===\n')
{
  const { ctx: c3, p: m, belep: be } = await adminOldal(b, {
    viewport: { width: 390, height: 844 }, kontextus: { isMobile: true, hasTouch: true }, hiba: jsHiba })
  await be('tulaj@mosathat.hu')
  await menu(m, 'Igazolólap')
  await m.locator('.fulek button').filter({ hasText: 'Bérletek' }).click(); await m.waitForTimeout(1200)
  await m.locator('.igazolo-ceg').filter({ hasText: 'Kovács Péter' }).getByRole('button', { name: 'Megnyitás' }).click()
  await m.waitForTimeout(1500)
  const lap = m.locator('[aria-label^="Bérlet igazolólap:"] .lap-igazolo')
  const r = await lap.evaluate((e) => {
    const t = e.querySelector('.lap-torzs')
    return { sw: t.scrollWidth, cw: t.clientWidth }
  })
  ok('nem lóg ki oldalra', true, r.sw <= r.cw + 1)
  await kep(lap, '9-telefon-lap')
  await c3.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
