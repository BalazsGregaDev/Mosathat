import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p = []) => (await db.query(s, p)).rows
const adat = async () => (await q(`select publikus_oldal() x`))[0].x

let a = await adat()
t.ok('alapból nincs kiválasztott arculat', [null, null], [a.arculat, a.arculat_mod])
t.ok('a három aktív csomag, sorrendben', ['START', 'PREMIUM', 'ELIT'], a.packages.map((p) => p.code))
t.ok('mind a 27 ár (3 csomag × 3 kategória × 3 terjedelem)', 27, a.packagePricing.length)
t.ok('csomagtartalom és „plusz” lista', [true, true], [a.packageItems.length > 30, a.packageExtras.length > 0])

await q(`select set_config('app.uid', $1, false)`, [TULAJ])
await q(`select arculat_valasztas('05', 'SOTET')`)
a = await adat()
t.ok('a kiválasztás azonnal látszik', ['05', 'SOTET'], [a.arculat, a.arculat_mod])

await q(`select set_config('app.uid', '', false)`)
a = await adat()
t.ok('belépés nélkül is ugyanazt adja', ['05', 3], [a.arculat, a.packages.length])
t.ok('csak nyilvános mezők: nincs ügyfél, foglalás, beszerzési adat', [],
  Object.keys(a).filter((k) => !['arculat', 'arculat_mod', 'packages', 'packagePricing', 'packageItems', 'packageExtras'].includes(k)))

const jog = (await q(`select has_function_privilege('anon', 'public.publikus_oldal()', 'execute') a`))[0].a
t.ok('kívülről (anon) hívható', true, jog)
const kivezetett = (await q(`update packages set active = false where code = 'ELIT' returning id`))[0].id
a = await adat()
t.ok('kivezetett csomag nem jelenik meg, az ára sem', [false, false],
  [a.packages.some((p) => p.code === 'ELIT'), a.packagePricing.some((p) => p.package_id === kivezetett)])

await db.close()
t.vege()
