import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adminOldal, foglalasOldal, urestNapotValaszt } from './_publikus.mjs'

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
const TOKEN = 'berletdemo2026kovacspeter'

async function menu(p, nev) {
  await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  await p.waitForTimeout(1500)
}

console.log('=== 1) Új bérlet: jármű nélküli ügyfél is kiválasztható, új ügyfél helyben ===\n')
{
  const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  await sql(`select add_customer($1::jsonb)`, [JSON.stringify({ name: 'Videoinfo-1 Kft.', phone: '+36 1 222 3344' })])
  await menu(p, 'Cégek és bérletesek')
  await p.locator('.fulek button').filter({ hasText: 'Bérletek' }).click(); await p.waitForTimeout(600)
  await p.getByRole('button', { name: '+ Új bérlet' }).click(); await p.waitForTimeout(600)
  const lap = p.locator('dialog[aria-label="Új bérlet"]')
  const gomb = lap.getByRole('button', { name: 'Bérlet létrehozása' })
  ok('ügyfél nélkül a gomb tiltva, és alatta a magyarázat', [true, true],
    [await gomb.isDisabled(), (await lap.locator('.berlet-miert').innerText()).includes('válaszd ki az ügyfelet')])
  await lap.getByRole('textbox', { name: 'Ügyfél keresése' }).fill('Videoinfo-1'); await p.waitForTimeout(900)
  ok('a jármű nélküli ügyfél is megjelenik', 1, await lap.locator('.talalatsor').filter({ hasText: 'Videoinfo-1 Kft.' }).count())
  await lap.locator('.talalatsor').filter({ hasText: 'Videoinfo-1 Kft.' }).click(); await p.waitForTimeout(400)
  ok('kiválasztva, a gomb már él', [true, false],
    [(await lap.locator('.talalat').innerText()).includes('Videoinfo-1 Kft.'), await gomb.isDisabled()])

  const db = lap.getByRole('textbox', { name: 'Alkalmak száma' }).first()
  await db.click()
  await db.press('End'); await db.press('Backspace'); await db.press('Backspace')
  ok('a darabszám billentyűzettel teljesen törölhető (nem marad 0)', '', await db.inputValue())
  await db.type('8')
  ok('utána sima 8 írható be (nem 08)', '8', await db.inputValue())
  await db.fill('05')
  ok('a kezdő nulla magától eltűnik', '5', await db.inputValue())
  await lap.getByRole('button', { name: '+ Tétel' }).click()
  ok('az új tétel üres mezővel indul', '', await lap.getByRole('textbox', { name: 'Alkalmak száma' }).nth(1).inputValue())
  await lap.getByRole('textbox', { name: 'Alkalmak száma' }).nth(1).fill('2')
  ok('összesen 7 alkalom', true, (await lap.locator('.lap-lab .alatta').innerText()).includes('7 alkalom'))
  await kep(lap.locator('.lap'), '1-uj-berlet')
  await gomb.click(); await p.waitForTimeout(1500)
  ok('a bérlet létrejött', 1, await p.locator('.panel').filter({ hasText: 'Videoinfo-1 Kft.' }).count())

  await p.getByRole('button', { name: '+ Új bérlet' }).click(); await p.waitForTimeout(600)
  await lap.getByRole('textbox', { name: 'Ügyfél keresése' }).fill('Bérletes Bálint'); await p.waitForTimeout(900)
  await lap.getByRole('button', { name: 'Új ügyfél felvétele' }).click()
  ok('a mezők: név (a keresett szöveggel), telefon, e-mail, cég, rendszám', ['Bérletes Bálint', '', '', '', ''],
    await Promise.all(['#bu-nev', '#bu-tel', '#bu-email', '#bu-ceg', '#bu-rsz'].map((x) => lap.locator(x).inputValue())))
  await lap.locator('#bu-nev').fill('')
  const ment = lap.getByRole('button', { name: 'Ügyfél mentése' })
  ok('üres adatokkal nem menthető', true, await ment.isDisabled())
  await lap.locator('#bu-rsz').fill('ujb-001')
  ok('egy kitöltött mezővel (rendszám) már menthető', false, await ment.isDisabled())
  await kep(lap.locator('.lap'), '1-uj-ugyfel')
  await ment.click(); await p.waitForTimeout(1200)
  ok('az új ügyfél fel is került, ki is van választva, a bérlet menthető', [true, false],
    [(await lap.locator('.talalat').innerText()).includes('UJB-001'), await gomb.isDisabled()])
  ok('az adatbázisban: Névtelen ügyfél az autóval', [{ name: 'Névtelen', phone: '—' }],
    await sql(`select c.name, c.phone from customers c join vehicles v on v.customer_id = c.id where v.plate_raw = 'UJB-001'`))
  await lap.getByRole('button', { name: 'Mégse' }).click(); await p.waitForTimeout(400)
  const k = p.locator('.kerdes-gombok .btn-veszelyes, .kerdes-gombok .btn-veszelyes-teli')
  if (await k.count()) { await k.first().click(); await p.waitForTimeout(400) }

  console.log('\n=== 2) A bérlet kártyáján a foglalási link ===\n')
  const kartya = p.locator('.panel').filter({ hasText: 'Kovács Péter' }).first()
  await kartya.locator('.kartya-nyito').click(); await p.waitForTimeout(500)
  ok('a demó linkje látszik', true, (await kartya.locator('.berlet-link').innerText()).includes(`/berlet/${TOKEN}`))
  ok('van Új link és QR-kód gomb', [1, 1],
    [await kartya.getByRole('button', { name: 'Új link' }).count(), await kartya.getByRole('button', { name: 'QR-kód' }).count()])
  await kep(kartya, '2-berlet-kartya-link')
  await ctx.close()
}

console.log('\n=== 3) A bérletes foglalási oldal ===\n')
{
  const { ctx, p, m, sql } = await foglalasOldal(b, { ut: `/berlet/${TOKEN}`, hiba: jsHiba })
  ok('cím és név', ['Bérletes időpontfoglalás', 'Kovács Péter'],
    [sima(await p.locator('.kv-ceg-sav h1').innerText()), sima(await p.locator('.kv-ceg-sav-ceg').innerText())])
  ok('a bérlet állása: Start még 6, Premium még 2', ['még 6 alkalom', 'még 2 alkalom'],
    (await p.locator('.kv-berlet-sor strong').allInnerTexts()).map(sima))
  await m.locator('.fogl-valaszto button').filter({ hasText: 'Személyautó' }).click()
  const csAr = async (nev) => sima(await m.locator('.fogl-csomag', { has: p.locator('.nev', { hasText: new RegExp(`^${nev}$`) }) }).locator('.ar').innerText())
  ok('Start és Premium: Bérletből, Elit: ár', ['Bérletből', 'Bérletből', true], [await csAr('Start'), await csAr('Premium'), /Ft/.test(await csAr('Elit'))])
  await kep(p, '3-berlet-oldal-teteje')
  await m.locator('.fogl-csomag', { has: p.locator('.nev', { hasText: /^Start$/ }) }).click(); await p.waitForTimeout(800)
  await m.locator('.fogl-valaszto button').filter({ hasText: 'Itt hagyom' }).click(); await p.waitForTimeout(3000)
  await urestNapotValaszt(m, sql)
  await m.locator('.fogl-idok button').first().click(); await p.waitForTimeout(800)
  ok('a név előre kitöltve', 'Kovács Péter', await p.locator('#fo-nev').inputValue())
  ok('összeg: 0 Ft, a csomag a bérletedből megy', ['0 Ft', 'a csomag a bérletedből megy'],
    [sima(await m.locator('.fogl-osszeg .osszeg .ar').innerText()), sima(await m.locator('.fogl-osszeg .fogl-berlet').innerText())])
  await p.fill('#fo-tel', '+36 30 111 2233')
  await p.fill('#fo-rsz', 'abc-123')
  await m.locator('.fogl-feltetel input').check()
  await kep(m.locator('.fogl-osszeg'), '3-berlet-oldal-osszeg')
  await m.getByRole('button', { name: 'Foglalási kérés küldése' }).click(); await p.waitForTimeout(2500)
  ok('rögzítve (csendes napon azonnal)', 'Az időpontodat rögzítettük, várunk!', sima(await m.locator('.fogl-siker h2').innerText()))
  const [f] = await sql(`select b.status::text, b.pass_item_id is not null fed, c.name from bookings b join customers c on c.id = b.customer_id
    where b.berlet_link order by b.created_at desc limit 1`)
  ok('az adatbázisban: Kovács Péter, bérletből, visszaigazolva', { status: 'CONFIRMED', fed: true, name: 'Kovács Péter' }, f)
  await kep(p, '3-berlet-oldal-kesz')
  await ctx.close()
}
{
  const { ctx, p } = await foglalasOldal(b, { ut: '/publikus', hiba: jsHiba })
  await p.goto(`http://localhost:5180/berlet/${'x'.repeat(24)}`)
  await p.waitForSelector('.kv-ceg-ervenytelen h2', { timeout: 90000 })
  ok('ismeretlen link: érvénytelen', 'Ez a foglalási link nem érvényes', sima(await p.locator('.kv-ceg-ervenytelen h2').innerText()))
  await ctx.close()
}
{
  const { ctx, p } = await foglalasOldal(b, {
    ut: `/berlet/${TOKEN}`, viewport: { width: 390, height: 844 }, kontextus: { isMobile: true, hasTouch: true }, hiba: jsHiba })
  const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  ok('telefonon nem lóg ki', true, r.sw <= r.cw + 1)
  await kep(p, '3-berlet-oldal-telefon')
  await ctx.close()
}

console.log('\n=== 4) Publikus oldal: egyszerre egy egyéb szolgáltatás nyitva ===\n')
{
  const { ctx, p } = await foglalasOldal(b, { hiba: jsHiba })
  const eg = p.locator('.kv-egyeb')
  await eg.scrollIntoViewIfNeeded()
  const kartyak = eg.locator('.kv-egyeb-kartya')
  await kartyak.nth(0).locator('summary').click(); await p.waitForTimeout(300)
  ok('egyet kinyitva egy nyitva', 1, await eg.locator('.kv-egyeb-kartya[open]').count())
  await kartyak.nth(1).locator('summary').click(); await p.waitForTimeout(300)
  ok('a következőt kinyitva az előző bezárul', [1, false, true],
    [await eg.locator('.kv-egyeb-kartya[open]').count(), await kartyak.nth(0).evaluate((d) => d.open), await kartyak.nth(1).evaluate((d) => d.open)])
  const belso = eg.locator('[data-terulet="BELSO"] .kv-egyeb-kartya').first()
  await belso.locator('summary').click(); await p.waitForTimeout(300)
  ok('a másik oszlopban nyitva is bezárja a külsőt', [1, true], [await eg.locator('.kv-egyeb-kartya[open]').count(), await belso.evaluate((d) => d.open)])
  await belso.locator('summary').click(); await p.waitForTimeout(300)
  ok('a nyitottat újra megnyomva bezárul', 0, await eg.locator('.kv-egyeb-kartya[open]').count())
  await ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
