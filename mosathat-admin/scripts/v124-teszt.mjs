import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adminOldal } from './_publikus.mjs'

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
const sima = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const jsHiba = (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ }
const TULAJ = '00000000-0000-4000-8000-000000000002'

const elokeszit = async (sql) => {
  await sql(`select set_config('app.uid', $1, false)`, [TULAJ])
  const uj = async (nev, ceg, rendszam) => {
    const [r] = await sql(`select add_customer($1::jsonb) id`, [JSON.stringify({ name: nev, phone: `+36 30 7${Math.floor(Math.random() * 900000 + 100000)}`, type: 'MAGAN', company_name: ceg })])
    await sql(`select add_vehicle($1::jsonb)`, [JSON.stringify({ customer_id: r.id, plate_raw: rendszam, category: 'SZEMELYAUTO' })])
    return r.id
  }
  await uj('Autós Aladár', 'Autó Trans Kft.', 'ATR-001')
  await uj('Arrow Sofőr', 'Arrow', 'ARW-001')
  await uj('Magán Márta', 'Arrow / Magán', 'ARM-001')
  await uj('Magán Miklós', 'Arrow / Magán', 'ARM-002')
}
const menu = async (p, nev) => { await p.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${nev}$`) }).click(); await p.waitForTimeout(1200) }
const ful = async (p, nev) => { await p.locator('.oldal-fej .fulek button').filter({ hasText: nev }).click(); await p.waitForTimeout(1200) }
const keres = async (p, s) => { await p.getByLabel('Keresés').fill(s); await p.waitForTimeout(1200) }
const ablak = (p) => p.locator('.ceg-atnev')
const pipak = (p) => ablak(p).locator('.ceg-atnev-lista input[type="checkbox"]').evaluateAll((l) => l.map((e) => e.checked))

console.log('=== 1) Ügyfél kártyán: a cégnév átírása minden ügyfélre ===\n')
const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
await belep('tulaj@mosathat.hu')
await elokeszit(sql)
await menu(p, 'Ügyfelek')
await ful(p, 'Ügyfél szerint')
await keres(p, 'Autós Aladár')
const kartya = p.locator('.panel').filter({ hasText: 'Autós Aladár' }).first()
await kartya.locator('.kartya-nyito').first().click()
await p.waitForTimeout(500)
const cegSor = kartya.locator('.szerk-sor').filter({ has: p.locator('.szerk-cimke', { hasText: 'Cégnév' }) })
await cegSor.locator('.szerk-ertek').click()
await cegSor.locator('input').fill('AUTÓ TRANS Kft.')
await cegSor.locator('input').press('Enter')
await ablak(p).waitFor({ timeout: 10000 })
const tagokSzama = await ablak(p).locator('.ceg-atnev-lista li').count()
ok('felugrik az ablak a cég összes ügyfelével, alapból mind kijelölve', [true, true],
  [tagokSzama >= 3, (await pipak(p)).every(Boolean)])
ok('a rendszámok is látszanak', true, (await ablak(p).locator('.rendszam').allInnerTexts()).includes('ATR-001'))
ok('jelzi, hogy a cég neve mindenkinél átíródik', true, /minden ügyfelénél és autójánál erre íródik át/.test(sima(await ablak(p).locator('.ceg-atnev-allapot').innerText())))
await kep(ablak(p), '01-ablak-mind')
await ablak(p).locator('.ceg-atnev-lista .jelolo').filter({ hasText: 'Autós Aladár' }).locator('input').uncheck()
ok('egy kivéve: új cég jön létre, a többiek maradnak', [true, false],
  [/Új cég jön létre/.test(sima(await ablak(p).locator('.ceg-atnev-allapot').innerText())), await ablak(p).locator('.ceg-atnev-mind input').isChecked()])
await kep(ablak(p), '02-ablak-reszleges')
await ablak(p).locator('.ceg-atnev-mind input').check()
ok('a Mind pipa mindet visszajelöli', true, (await pipak(p)).every(Boolean))
await ablak(p).getByRole('button', { name: 'Mentés' }).click()
await ablak(p).waitFor({ state: 'detached', timeout: 10000 })
await p.waitForTimeout(800)
const nevek = await sql(`select distinct company_name from customers where company_id = (select company_id from customers where name = 'Autós Aladár')`)
ok('minden ügyfélnél az új név, nem áll vissza', ['AUTÓ TRANS Kft.'], nevek.map((x) => x.company_name))
ok('a cég típusú ügyfél neve is', 1, (await sql(`select count(*)::int n from customers where type = 'CEG' and name = 'AUTÓ TRANS Kft.'`))[0].n)
ok('a kártyán is az új név', true, (await kartya.innerText()).includes('AUTÓ TRANS Kft.'))
await kep(kartya, '03-kartya-utana')

console.log('\n=== 2) Cég szerint: a másik cég autói egy meglévő céghez ===\n')
await ful(p, 'Cég szerint')
await keres(p, 'Arrow')
ok('két külön cég: Arrow és Arrow / Magán', ['Arrow', 'Arrow / Magán'],
  (await p.locator('.panelek .panel .kartya-nyito .cim').evaluateAll((l) => l.map((e) => e.firstChild.textContent.trim()))).sort())
const magan = p.locator('.panelek .panel').filter({ hasText: 'Arrow / Magán' }).first()
await magan.locator('.kartya-nyito').first().click()
await p.waitForTimeout(500)
await magan.getByRole('button', { name: /Autók áthelyezése másik céghez/ }).click()
await ablak(p).waitFor({ timeout: 10000 })
ok('üres név, a két ügyfél kijelölve', ['', [true, true]], [await ablak(p).locator('[data-mezo="ceg-uj-nev"]').inputValue(), await pipak(p)])
await ablak(p).locator('[data-mezo="ceg-uj-nev"]').fill('Arr')
await ablak(p).locator('.ceg-javaslatok button').filter({ hasText: /^Arrow ·/ }).first().waitFor({ timeout: 5000 })
await kep(ablak(p), '04-javaslatok')
await ablak(p).locator('.ceg-javaslatok button').filter({ hasText: /^Arrow ·/ }).first().click()
await p.waitForTimeout(600)
ok('a meglévő cég kiválasztva, jelzi az összevonást', ['Arrow', true, true], [
  await ablak(p).locator('[data-mezo="ceg-uj-nev"]').inputValue(),
  /Már van ilyen cég: Arrow/.test(sima(await ablak(p).locator('.ceg-atnev-allapot').innerText())),
  /megszűnik/.test(sima(await ablak(p).locator('.ceg-atnev-allapot').innerText()))])
await kep(ablak(p), '05-meglevo-ceg')
await ablak(p).getByRole('button', { name: 'Áthelyezés' }).click()
await ablak(p).waitFor({ state: 'detached', timeout: 10000 })
await p.waitForTimeout(1200)
const arrow = await sql(`select co.name, array_agg(v.plate_raw order by v.plate_raw) autok from companies co
                          join customers c on c.company_id = co.id join vehicles v on v.customer_id = c.id
                         where co.name_key = 'arow' group by co.name`)
ok('mind a három autó az Arrow alatt, a Magán cég megszűnt', [[{ name: 'Arrow', autok: ['ARM-001', 'ARM-002', 'ARW-001'] }], 0],
  [arrow, (await sql(`select count(*)::int n from companies where name = 'Arrow / Magán'`))[0].n])
ok('a listában egy Arrow kártya, három autóval', [1, true],
  [await p.locator('.panelek .panel').count(), (await p.locator('.panelek .panel').first().innerText()).includes('Autók (3)')])
await kep(p.locator('.panelek'), '06-osszevonva')

console.log('\n=== 3) Cég szerint: a cégnév itt is átírható ===\n')
const ak = p.locator('.panelek .panel').first()
const sor = ak.locator('.szerk-sor').filter({ has: p.locator('.szerk-cimke', { hasText: 'Cégnév' }) })
await sor.locator('.szerk-ertek').click()
await sor.locator('input').fill('Arrow Hungary Kft.')
await sor.locator('input').press('Enter')
await ablak(p).waitFor({ timeout: 10000 })
await ablak(p).getByRole('button', { name: 'Mentés' }).click()
await ablak(p).waitFor({ state: 'detached', timeout: 10000 })
await p.waitForTimeout(800)
ok('az új név a cégnél és mindhárom ügyfélnél', [['Arrow Hungary Kft.'], 3],
  [(await sql(`select distinct company_name from customers where company_name like 'Arrow%'`)).map((x) => x.company_name),
   (await sql(`select count(*)::int n from customers where company_name = 'Arrow Hungary Kft.'`))[0].n])
await ctx.close()

console.log('\n=== 4) Alkalmazott: nem módosíthat ===\n')
{
  const { ctx, p, belep } = await adminOldal(b, { hiba: jsHiba })
  await belep('alkalmazott@mosathat.hu')
  await menu(p, 'Ügyfelek')
  await ful(p, 'Cég szerint')
  const k = p.locator('.panelek .panel').first()
  await k.locator('.kartya-nyito').first().click()
  await p.waitForTimeout(500)
  ok('nincs átírás és áthelyezés gomb', [0, 0], [await k.locator('.szerk-ertek').count(), await k.getByRole('button', { name: /áthelyezése/ }).count()])
  await ctx.close()
}

console.log('\n=== 5) Telefonon ===\n')
{
  const { ctx, p, sql, belep } = await adminOldal(b, { viewport: { width: 390, height: 844 }, kontextus: { isMobile: true, hasTouch: true }, hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  await elokeszit(sql)
  await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
  await p.locator('.fiok .menu button').filter({ hasText: /^Ügyfelek$/ }).click(); await p.waitForTimeout(1200)
  await ful(p, 'Cég szerint')
  await keres(p, 'Arrow')
  const m = p.locator('.panelek .panel').filter({ hasText: 'Arrow / Magán' }).first()
  await m.locator('.kartya-nyito').first().click()
  await p.waitForTimeout(400)
  await m.getByRole('button', { name: /Autók áthelyezése/ }).click()
  await ablak(p).waitFor({ timeout: 10000 })
  await ablak(p).locator('[data-mezo="ceg-uj-nev"]').fill('Arrow')
  await p.waitForTimeout(800)
  ok('az ablak kifér, nincs vízszintes görgetés', true, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await kep(p, '07-telefon')
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
