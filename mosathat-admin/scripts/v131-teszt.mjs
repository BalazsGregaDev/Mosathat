import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { foglalasOldal, urestNapotValaszt } from './_publikus.mjs'

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
const jsHiba = (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ }

async function kitolt(m, sql, rendszam, telefon) {
  await m.locator('.fogl-csomag').first().click()
  await m.page().waitForTimeout(400)
  await m.locator('[data-lepes="mit"] .fogl-valaszto button').first().click()
  await m.page().waitForTimeout(300)
  await m.locator('[data-lepes="tipus"] button[aria-pressed]').nth(1).click()
  await m.page().waitForTimeout(400)
  await urestNapotValaszt(m, sql)
  await m.locator('.fogl-idok button').first().click()
  await m.page().waitForTimeout(400)
  if (await m.locator('.fogl-hataridok button').count()) await m.locator('.fogl-hataridok button').first().click()
  await m.locator('#fo-nev').fill('Teszt Elek')
  await m.locator('#fo-tel').fill(telefon)
  await m.locator('#fo-email').fill('elek@pelda.hu')
  await m.locator('#fo-rsz').fill(rendszam)
  await m.locator('.fogl-feltetel input').check()
}

const kuld = (m) => m.locator('.fogl-osszeg button:not([disabled])').filter({ hasText: /Foglalás|küld|Küld/i }).first()

console.log('=== 1) A láthatatlan mező valóban láthatatlan ===\n')
{
  const { ctx, p, m, sql } = await foglalasOldal(b, { hiba: jsHiba })
  await kitolt(m, sql, 'LAT-131', '+36 30 131 5555')
  const doboz = await m.locator('#fo-weboldal').boundingBox()
  ok('a foglalásnál a képernyőn kívül van', true, doboz === null || doboz.x + doboz.width < 0)
  ok('Tab billentyűvel nem érhető el, felolvasó nem olvassa fel', ['-1', 'true'],
    [await m.locator('#fo-weboldal').getAttribute('tabindex'), await m.locator('.fogl-csapda').getAttribute('aria-hidden')])
  await p.locator('.kv-hero .kv-gomb-masod').first().click()
  await p.waitForTimeout(500)
  const kdoboz = await p.locator('#fk-weboldal').boundingBox()
  ok('a foglaláskeresőben is ott van, láthatatlanul', [1, true], [await p.locator('#fk-weboldal').count(), kdoboz === null || kdoboz.x + kdoboz.width < 0])
  await kep(p, '01-kereso-ablak')
  await ctx.close()
}

console.log('\n=== 2) Ember foglal: minden a régiben ===\n')
{
  const { ctx, p, m, sql } = await foglalasOldal(b, { hiba: jsHiba })
  await kitolt(m, sql, 'EMB-131', '+36 30 131 1310')
  await kep(p, '02-kitoltott-urlap')
  await kuld(m).click()
  await p.waitForTimeout(2000)
  ok('megjelenik a köszönő üzenet', 1, await m.locator('.fogl-siker').count())
  const [f] = await sql(`select count(*)::int n from public.bookings b join public.vehicles v on v.id = b.vehicle_id where v.plate_raw = 'EMB-131'`)
  ok('a foglalás létrejött', 1, f.n)
  const [nap] = await sql(`select hol, bot from public.vedelem_naplo order by id desc limit 1`)
  ok('a napló szerint ember volt (időt is küldött)', { hol: 'FOGLALAS', bot: null }, nap)
  await kep(m, '03-sikeres-foglalas')
  await p.locator('.kv-hero .kv-gomb-masod').first().click()
  await p.waitForTimeout(600)
  await p.locator('#fk-rendszam').fill('EMB-131')
  await p.locator('#fk-telefon').fill('+36 30 131 1310')
  await p.waitForTimeout(1600)
  await p.locator('.kv-kereso-ablak button[type="submit"]').click()
  await p.waitForTimeout(2500)
  ok('a foglaláskereső megtalálja és átvisz a foglalás oldalára', true, /\/foglalas\//.test(p.url()))
  await ctx.close()
}

console.log('\n=== 3) Bot tölti ki a láthatatlan mezőt ===\n')
{
  const { ctx, p, m, sql } = await foglalasOldal(b, { hiba: jsHiba })
  await kitolt(m, sql, 'BOT-131', '+36 30 131 9999')
  await m.locator('#fo-weboldal').evaluate((e) => { e.focus() })
  await p.keyboard.type('http://spam.example')
  await kuld(m).click()
  await p.waitForTimeout(2000)
  ok('a bot „sikert” lát, nem tudja meg, hogy kiszűrtük', 1, await m.locator('.fogl-siker').count())
  const [f] = await sql(`select count(*)::int n from public.bookings b join public.vehicles v on v.id = b.vehicle_id where v.plate_raw = 'BOT-131'`)
  ok('de foglalás nem jött létre', 0, f.n)
  const [nap] = await sql(`select hol, bot from public.vedelem_naplo order by id desc limit 1`)
  ok('naplózva botként', { hol: 'FOGLALAS', bot: 'MEZO' }, nap)
  await p.locator('.kv-hero .kv-gomb-masod').first().click()
  await p.waitForTimeout(600)
  await p.locator('#fk-rendszam').fill('ABC-123')
  await p.locator('#fk-telefon').fill('+36 30 123 4567')
  await p.locator('#fk-weboldal').evaluate((e) => { e.focus() })
  await p.keyboard.type('x')
  await p.waitForTimeout(1600)
  await p.locator('.kv-kereso-ablak button[type="submit"]').click()
  await p.waitForTimeout(1500)
  ok('a keresőben a bot „nincs találat” választ kap', 1, await p.locator('.kv-kereso-nincs').count())
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
