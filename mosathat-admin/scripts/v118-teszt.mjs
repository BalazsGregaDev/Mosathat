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
const kep = async (el, nev) => { if (KEPEK) await el.screenshot({ path: join(KEPEK, `${nev}.png`) }) }
const sima = (s) => s.replace(/\s+/g, ' ').trim()
const jsHiba = (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ }
const DEMO = 'http://localhost:5180'

console.log('=== 1) Céges link: egyedi cím ===\n')
{
  const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: DEMO })
  await belep('tulaj@mosathat.hu')
  await p.locator('.oldalsav .menu button').filter({ hasText: 'Cégek és bérletesek' }).click()
  const sor = p.locator('.cegtabla-sor[data-ceg="Autó Trans Kft."]')
  await sor.locator('.ceglink-cim').waitFor({ timeout: 30000 })
  const mezo = sor.getByRole('textbox', { name: 'A link egyedi címe: Autó Trans Kft.' })
  ok('a mezőben a mostani cím, előtte a link eleje', ['autotransdemo2026link', 'localhost:5180/ceg/'],
    [await mezo.inputValue(), await sor.locator('.linkcim-elotag').innerText()])
  ok('változatlanul nincs Mentés gomb', 0, await sor.locator('.linkcim').getByRole('button', { name: 'Mentés' }).count())
  await mezo.fill('')
  await mezo.pressSequentially('Autó Trans Győr')
  ok('gépelés közben kisbetű, ékezet nélkül, kötőjellel', 'auto-trans-gyor', await mezo.inputValue())
  ok('figyelmeztet, hogy a mostani link megszűnik', true,
    (await sor.locator('.linkcim small').innerText()).includes('a mostani link megszűnik'))
  await kep(sor.locator('.cegtabla-link'), '1-ceg-szerkesztes')
  await mezo.fill('ab')
  ok('két karakter: nem menthető, tipp', [true, true],
    [await sor.locator('.linkcim').getByRole('button', { name: 'Mentés' }).isDisabled(),
      (await sor.locator('.linkcim small').innerText()).includes('Legalább 3 karakter')])
  await sor.locator('.linkcim').getByRole('button', { name: 'Elvetés' }).click()
  ok('Elvetés: visszaáll', 'autotransdemo2026link', await mezo.inputValue())

  await mezo.fill('auto-trans')
  await sor.locator('.linkcim').getByRole('button', { name: 'Mentés' }).click()
  await p.locator('.kerdes-ablak').waitFor()
  ok('mentés előtt rákérdez', [true, true],
    [(await p.locator('.kerdes-ablak').innerText()).includes('azonnal megszűnik'), (await p.locator('.kerdes-ablak h2, .kerdes-ablak .cim').first().innerText()).includes('Link átírása')])
  await kep(p.locator('.kerdes-ablak'), '1-ceg-kerdes')
  await p.locator('.kerdes-ablak').getByRole('button', { name: 'Átírás' }).click()
  await p.waitForTimeout(800)
  ok('a link már az új címmel', true, (await sor.locator('.ceglink-cim').innerText()).endsWith('/ceg/auto-trans'))
  ok('a mező az új címet mutatja, gombok nélkül', ['auto-trans', 0],
    [await mezo.inputValue(), await sor.locator('.linkcim').getByRole('button', { name: 'Mentés' }).count()])
  const vagolap = await p.evaluate(() => navigator.clipboard.readText())
  ok('a vágólapon a címváltozásról szóló levél az új linkkel', [true, true],
    [vagolap.includes('Megváltozott az időpontfoglaláshoz használható link címe'), vagolap.includes(`${DEMO}/ceg/auto-trans`)])
  ok('visszajelzés', 'Cím átírva, a levél a vágólapon', await sor.locator('.ceglink-jelzes').innerText())
  const [x] = await sql(`select ceg_link_adat('auto-trans') is not null uj, ceg_link_adat('autotransdemo2026link') is null regi`)
  ok('az adatbázisban: az új cím él, a régi nem', { uj: true, regi: true }, x)
  await kep(sor.locator('.cegtabla-link'), '1-ceg-kesz')

  await sql(`insert into companies (name) values ('Másik Kft.') returning id`).then(([c]) =>
    sql(`insert into company_booking_links (company_id, token) values ($1, 'foglalt-cim')`, [c.id]))
  await mezo.fill('foglalt-cim')
  await sor.locator('.linkcim').getByRole('button', { name: 'Mentés' }).click()
  await p.locator('.kerdes-ablak').getByRole('button', { name: 'Átírás' }).click()
  await p.waitForTimeout(800)
  ok('foglalt címnél hibaüzenet, a link marad', [true, true],
    [(await sor.locator('.ceglink-jelzes').innerText()).includes('már egy másik cég linkje'),
      (await sor.locator('.ceglink-cim').innerText()).endsWith('/ceg/auto-trans')])
  await kep(sor.locator('.cegtabla-link'), '1-ceg-foglalt')
  await sor.locator('.linkcim').getByRole('button', { name: 'Elvetés' }).click()

  await sor.getByRole('button', { name: 'Új link' }).click()
  await p.locator('.kerdes-ablak').getByRole('button', { name: 'Új link' }).click()
  await p.waitForTimeout(800)
  ok('Új link: ismét véletlen, 24 karakteres cím', true, /^[a-z0-9]{24}$/.test(await mezo.inputValue()))

  console.log('\n=== 2) Bérletes link: egyedi cím ===\n')
  await p.locator('.fulek button').filter({ hasText: 'Bérletek' }).click(); await p.waitForTimeout(600)
  const kartya = p.locator('.panel').filter({ hasText: 'Kovács Péter' }).first()
  await kartya.locator('.kartya-nyito').click(); await p.waitForTimeout(500)
  const bm = kartya.getByRole('textbox', { name: 'A link egyedi címe: Kovács Péter' })
  ok('a mezőben a demó cím, előtte a bérletes link eleje', ['berletdemo2026kovacspeter', 'localhost:5180/berlet/'],
    [await bm.inputValue(), await kartya.locator('.linkcim-elotag').innerText()])
  await bm.fill('Kovács Péter')
  ok('tisztítva', 'kovacs-peter', await bm.inputValue())
  await kep(kartya.locator('.berlet-link'), '2-berlet-szerkesztes')
  await bm.press('Enter')
  await p.locator('.kerdes-ablak').getByRole('button', { name: 'Átírás' }).click()
  await p.waitForTimeout(800)
  ok('Enterrel is ment, a link az új címmel', true, (await kartya.locator('.ceglink-cim').innerText()).endsWith('/berlet/kovacs-peter'))
  ok('az adatbázisban', 'Kovács Péter', (await sql(`select berlet_link_adat('kovacs-peter')->>'nev' n`))[0].n)
  await kep(kartya.locator('.berlet-link'), '2-berlet-kesz')
  await ctx.close()
}

console.log('\n=== 3) Telefonon is elfér ===\n')
{
  const { ctx, p, belep } = await adminOldal(b, { viewport: { width: 390, height: 844 }, kontextus: { isMobile: true, hasTouch: true }, hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(500)
  await p.locator('.fiok button').filter({ hasText: 'Cégek és bérletesek' }).first().click()
  const sor = p.locator('.cegtabla-sor[data-ceg="Autó Trans Kft."]')
  await sor.locator('.ceglink-cim').waitFor({ timeout: 30000 })
  await sor.locator('.linkcim').scrollIntoViewIfNeeded()
  ok('nincs vízszintes görgetés', true, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await kep(sor.locator('.cegtabla-link'), '3-telefon')
  await ctx.close()
}

console.log('\n=== 4) Nagybetűvel beírt cím is nyílik ===\n')
{
  const { ctx, p } = await foglalasOldal(b, { ut: '/ceg/AutoTransDemo2026Link', hiba: jsHiba })
  ok('a céges oldal nyílik', 'Autó Trans Kft.', sima(await p.locator('.kv-ceg-sav-ceg').innerText()))
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
