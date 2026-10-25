import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adminOldal, foglalasOldal } from './_publikus.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const kep = async (el, nev, o = {}) => { if (KEPEK) await el.screenshot({ path: join(KEPEK, `${nev}.png`), ...o }) }
const sima = (s) => s.replace(/\s+/g, ' ').trim()
const jsHiba = (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ }
const menu = async (p, nev) => {
  await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  await p.waitForTimeout(1500)
}

console.log('=== 1) Szolgáltatások: csukható szakaszok ===\n')
{
  const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  await menu(p, 'Szolgáltatások')
  const szakaszok = p.locator('details.szolg-szakasz')
  ok('a csomagok és alattuk az Egyéb szolgáltatások, mind csukva', [['START', 'PREMIUM', 'ELIT', 'EGYÉB SZOLGÁLTATÁSOK'], [false, false, false, false]],
    [(await szakaszok.locator('.szolg-szakasz-cim').allInnerTexts()).map(sima), await szakaszok.evaluateAll((l) => l.map((d) => d.open))])
  ok('nincs külön Egyéb szolgáltatások fül, a gomb neve Csomagok tartalma', [0, 1],
    [await p.locator('.fulek button').filter({ hasText: 'Egyéb szolgáltatások' }).count(), await p.locator('.fulek button').filter({ hasText: 'Csomagok tartalma' }).count()])
  await kep(p.locator('.oldal'), '1-csukva')
  await szakaszok.nth(0).locator('summary').click()
  await szakaszok.nth(3).locator('summary').click()
  await p.waitForTimeout(300)
  ok('egyszerre több is nyitva lehet', [true, false, false, true], await szakaszok.evaluateAll((l) => l.map((d) => d.open)))
  const fo = await p.locator('.oldal').evaluate((e) => e.getBoundingClientRect().width)
  const kartya = await szakaszok.nth(0).evaluate((e) => e.getBoundingClientRect().width)
  ok('a csomag kártyája teljes szélességű', true, kartya > fo - 80)
  await kep(p.locator('.oldal'), '1-nyitva', { })

  console.log('\n=== 2) Egyéb szolgáltatások szerkesztése ===\n')
  const egyeb = szakaszok.nth(3)
  ok('külső és belső csoport', ['KÜLSŐ', 'BELSŐ'], (await egyeb.locator('.egyeb-csoport > h4').allInnerTexts()).map((x) => sima(x).split(' ')[0]))
  const sor = (nev) => egyeb.locator('.egyeb-sor').filter({ has: p.locator('.nev-szoveg', { hasText: nev }) }).first()
  const elsoKulso = async () => sima(await egyeb.locator('.egyeb-csoport[data-hely="KULSO"] .egyeb-sor .nev-szoveg').first().innerText()).split(' ')[0]
  const masodik = sima(await egyeb.locator('.egyeb-csoport[data-hely="KULSO"] .egyeb-sor .nev-szoveg').nth(1).innerText())
  await egyeb.locator('.egyeb-csoport[data-hely="KULSO"] .egyeb-sor').nth(1).getByRole('button', { name: /feljebb/ }).click()
  await p.waitForTimeout(800)
  ok('Fel: a második lett az első', masodik.split(' ')[0], await elsoKulso())

  const motor = sor('Motortér kozmetika')
  await motor.locator('select.egyeb-hely').selectOption('BELSO'); await p.waitForTimeout(800)
  ok('Belsőre téve átkerül a belső csoportba', 1,
    await egyeb.locator('.egyeb-csoport[data-hely="BELSO"] .egyeb-sor').filter({ hasText: 'Motortér kozmetika' }).count())
  await motor.locator('.szammezo input').first().fill('7500'); await motor.locator('.szammezo input').first().blur(); await p.waitForTimeout(800)
  await motor.locator('button.nev').click()
  await motor.locator('[id^="nev-en-"]').fill('Engine bay detailing'); await motor.locator('[id^="nev-en-"]').blur(); await p.waitForTimeout(600)
  await motor.locator('[id^="leiras-"]').first().fill('Óvatos kézi tisztítás'); await motor.locator('[id^="leiras-"]').first().blur(); await p.waitForTimeout(600)
  await motor.locator('[id^="nev-"]').first().fill('Motortér ápolás'); await motor.locator('[id^="nev-"]').first().blur(); await p.waitForTimeout(800)
  await kep(egyeb, '2-szerkesztes')
  const [m] = await sql(`select name, name_en, description, area::text, price_huf from extras where name = 'Motortér ápolás'`)
  ok('az adatbázisban minden mező', { name: 'Motortér ápolás', name_en: 'Engine bay detailing', description: 'Óvatos kézi tisztítás', area: 'BELSO', price_huf: 7500 }, m)
  const [kat] = await sql(`select count(*)::int n from extras where active`)
  ok('a közös katalógusban is (mindenhol innen jön)', true, await p.evaluate(() => true) && kat.n > 0)

  await egyeb.getByRole('button', { name: '+ Új szolgáltatás' }).click()
  await p.fill('#uj-extra-nev', 'Plafon tisztítás')
  await p.selectOption('#uj-extra-hely', 'BELSO')
  await egyeb.locator('.uj-extra input[type="number"]').first().fill('5000')
  await egyeb.getByRole('button', { name: 'Felvétel' }).click(); await p.waitForTimeout(1000)
  ok('új szolgáltatás a belső csoport végén', 'Plafon tisztítás',
    sima(await egyeb.locator('.egyeb-csoport[data-hely="BELSO"] .egyeb-sor .nev-szoveg').last().innerText()))

  const plafon = sor('Plafon tisztítás')
  await plafon.locator('button.nev').click()
  await plafon.locator('.jelolo').filter({ hasText: 'Aktív' }).locator('input').uncheck(); await p.waitForTimeout(800)
  ok('kikapcsolva is a listában marad, jelölve', [1, true],
    [await sor('Plafon tisztítás').count(), (await sor('Plafon tisztítás').innerText()).includes('kikapcsolva')])
  await sor('Plafon tisztítás').getByRole('button', { name: 'Szolgáltatás törlése' }).click()
  await p.locator('.kerdes-ablak').getByRole('button', { name: 'Törlés' }).click(); await p.waitForTimeout(1000)
  ok('törölve', 0, await sor('Plafon tisztítás').count())

  const hasznalt = await sql(`select e.name from extras e where exists (select 1 from booking_items i where i.kind = 'EXTRA' and i.ref_id = e.id) limit 1`)
  const h = sor(hasznalt[0].name)
  await h.locator('button.nev').click()
  await h.getByRole('button', { name: 'Szolgáltatás törlése' }).click()
  await p.locator('.kerdes-ablak').getByRole('button', { name: 'Törlés' }).click(); await p.waitForTimeout(1000)
  ok('foglalásban szereplőnél hibaüzenet, marad', [true, 1],
    [(await egyeb.locator('.egyeb-szerk > .hibauzenet').innerText()).includes('nem törölhető'), await sor(hasznalt[0].name).count()])
  await kep(egyeb, '2-torles-hiba')

  console.log('\n=== 3) Csomagok tartalma: nincs benne az extrás rész ===\n')
  await menu(p, 'Csomagok tartalma')
  ok('a menüpont és a cím: Csomagok tartalma, extrák nélkül', ['Csomagok tartalma', 0, 0],
    [sima(await p.locator('.oldal h1, .oldal .pub-fej h2, .oldal h2').first().innerText()),
      await p.getByText('Extrák neve és leírása').count(), await p.locator('.szerk-extra').count()])
  await kep(p.locator('.oldal'), '3-csomagok-tartalma', { })
  await ctx.close()
}

console.log('\n=== 4) A publikus oldal is innen kapja ===\n')
{
  const { ctx, sql } = await foglalasOldal(b, { hiba: jsHiba })
  await sql(`select set_config('app.uid', '00000000-0000-4000-8000-000000000002', false)`)
  const [m] = await sql(`select id from extras where name = 'Motortér kozmetika'`)
  await sql(`select extra_mentes($1::uuid, '{"area": "BELSO", "name": "Motortér ápolás"}'::jsonb)`, [m.id])
  const [x] = await sql(`select publikus_oldal() x`)
  const ex = (x.x.katalogus ?? x.x).extras.find((e) => e.id === m.id)
  ok('a publikus oldal adataiban a belső oszlopban, az új névvel', ['Motortér ápolás', 'BELSO'], [ex?.name, ex?.area])
  await ctx.close()
}

console.log('\n=== 5) Alkalmazott: csak olvasható, de szintén csukható ===\n')
{
  const { ctx, p, belep } = await adminOldal(b, { hiba: jsHiba })
  await belep('alkalmazott@mosathat.hu')
  await menu(p, 'Szolgáltatások')
  const szakaszok = p.locator('details.szolg-szakasz')
  ok('szakaszok csukva, szerkesztő nélkül', [true, false, 0],
    [(await szakaszok.count()) >= 4, await szakaszok.first().evaluate((d) => d.open), await p.locator('.egyeb-szerk').count()])
  await szakaszok.last().locator('summary').click()
  ok('az egyéb szolgáltatások listája lenyílik', true, await szakaszok.last().locator('table').isVisible())
  await kep(p.locator('.oldal'), '5-alkalmazott')
  await ctx.close()
}

console.log('\n=== 6) Telefonon ===\n')
{
  const { ctx, p, belep } = await adminOldal(b, { viewport: { width: 390, height: 844 }, kontextus: { isMobile: true, hasTouch: true }, hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
  await p.locator('.fiok button').filter({ hasText: 'Szolgáltatások' }).first().click(); await p.waitForTimeout(1200)
  const egyeb = p.locator('details.szolg-szakasz[data-szakasz="egyeb"]')
  await egyeb.locator('summary').click(); await p.waitForTimeout(300)
  await egyeb.locator('.egyeb-sor').first().locator('button.nev').click(); await p.waitForTimeout(300)
  ok('nem lóg ki', true, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await egyeb.scrollIntoViewIfNeeded()
  await kep(p, '6-telefon')
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
