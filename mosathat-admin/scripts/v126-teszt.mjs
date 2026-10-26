import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adminOldal, CIM } from './_publikus.mjs'
import { munkanap } from './_munkanap.mjs'

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
const { nap } = munkanap()
const menu = async (p, nev) => { await p.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${nev}$`) }).click(); await p.waitForTimeout(1300) }

const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
await belep('tulaj@mosathat.hu')
await sql(`select set_config('app.uid', $1, false)`, [TULAJ])
const [{ masik }] = await sql(`select id masik from staff where id <> $1 and active order by full_name limit 1`, [TULAJ])
const holnap = (await sql(`select (public.budapest_ma() + 3)::text d`))[0].d
await sql(`select set_absence($1::jsonb)`, [JSON.stringify({ staff_id: masik, day: holnap, kind: 'KESOBB_ERKEZIK', ends: '10:30', note: 'orvos' })])

console.log('=== 1) Profilom: szabadság és munkaidő-változás egy kártyán ===\n')
await menu(p, 'Profilom')
await p.locator('#sz-tol').fill(holnap)
await p.locator('#sz-megj').fill('nyaralás')
await p.getByRole('button', { name: 'Szabadság rögzítése' }).click()
await p.waitForTimeout(1200)
const kartya = p.locator('.tavollet-kartya')
ok('egy közös kártya, a régi külön lista nincs', [1, 0, 0],
  [await kartya.count(), await p.getByText('Bejelentett változások').count(), await p.locator('.szabadsag-lista-cim').count()])
ok('mindkét fajta benne van, jelölve', [true, true],
  [(await kartya.locator('.tavollet-jel[data-tipus="szabadsag"]').count()) >= 1, (await kartya.locator('.tavollet-jel[data-tipus="valtozas"]').count()) >= 1])
const sz = kartya.locator('li[data-tipus="szabadsag"]').filter({ hasText: 'nyaralás' })
await sz.getByRole('button', { name: 'Módosítás' }).click()
await p.waitForTimeout(400)
ok('Módosítás: a szabadság űrlapja töltődik be', ['SZABADSÁG MÓDOSÍTÁSA', 'nyaralás'],
  [sima(await p.locator('#szabadsag-urlap h3').innerText()), await p.locator('#sz-megj').inputValue()])
await kep(p.locator('.profil-racs'), '01-profilom')
await p.getByRole('button', { name: 'Mégse' }).click()

console.log('\n=== 2) Áttekintés: tulajdonosnak látszik ===\n')
await menu(p, 'Áttekintés')
const at = p.locator('.attekintes .tavollet-kartya')
ok('a kártya az áttekintésben, gombok nélkül, a másik dolgozó nevével', [1, true, 0],
  [await at.count(), (await at.innerText()).includes('orvos'), await at.getByRole('button', { name: 'Törlés' }).count()])
await at.scrollIntoViewIfNeeded()
await kep(at, '02-attekintes')

console.log('\n=== 3) Vélemények: összecsukva, fent is van + gomb ===\n')
await menu(p, 'Vélemények')
const vel = p.locator('details.pub-velemeny')
ok('mind csukva, a fejlécben a név', [false, true],
  [(await vel.evaluateAll((l) => l.some((d) => d.open))), sima(await vel.first().locator('summary').innerText()).length > 2])
ok('két + Vélemény gomb: fent és lent', 2, await p.getByRole('button', { name: '+ Vélemény' }).count())
const db = await vel.count()
await p.locator('[data-uj="fent"]').click()
await p.waitForTimeout(300)
ok('a felső gomb az elejére tesz egy nyitott újat', [db + 1, true, 'Új vélemény'],
  [await vel.count(), await vel.first().evaluate((d) => d.open), sima(await vel.first().locator('.pub-velemeny-nev').innerText())])
await vel.first().locator('[data-mezo="nev"]').fill('Fenti Feri')
ok('a név a fejlécben azonnal', 'Fenti Feri', sima(await vel.first().locator('.pub-velemeny-nev').innerText()))
await vel.nth(1).locator('summary').click()
ok('egyenként lenyitható', true, await vel.nth(1).evaluate((d) => d.open))
await kep(p.locator('.pub-velemeny-lista'), '03-velemenyek')
await p.locator('.pub-fej').getByRole('button', { name: 'Elvetés' }).click().catch(() => {})

console.log('\n=== 4) Heti nézet: minden foglalás, csomagbetűvel ===\n')
const csomagok = await sql(`select id, code from packages where active order by sort_order`)
const extra = (await sql(`select id from extras where active order by sort_order limit 2`)).map((x) => ({ extra_id: x.id, quantity: 1 }))
for (let i = 0; i < 12; i++) {
  await sql(`select create_booking($1::jsonb)`, [JSON.stringify({
    category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', drop_off_time: '08:00', service_date: nap,
    package_id: csomagok[i % csomagok.length].id, extras: i === 0 ? extra : [], notes: i === 0 ? 'kutyaszőr a hátsó ülésen' : null, customer_name: `Heti ${i}`, customer_phone: `+36 30 126 ${String(1000 + i)}`, plate_raw: `HET-${100 + i}`,
  })])
}
await menu(p, 'Időpontok')
await p.locator('.nezetvalto button:visible').filter({ hasText: /^Hét$/ }).first().click()
await p.waitForTimeout(1800)
const oszlop = p.locator('.naposzlop').filter({ has: p.locator('.minikartya', { hasText: 'HET-100' }) })
const dbNap = (await sql(`select count(*)::int n from bookings where service_date = $1 and status <> 'COMPLETED' and fleet_group is null`, [nap]))[0].n
ok('nincs „további” gomb, minden foglalás látszik', [0, true], [await p.locator('.tovabb').count(), (await oszlop.locator('.minikartya').count()) >= Math.min(dbNap, 12)])
const betuk = await oszlop.locator('.minikartya .csomag-betu').allInnerTexts()
ok('csomag kezdőbetűk S, P, E', true, ['S', 'P', 'E'].every((x) => betuk.some((y) => y.startsWith(x))))
const szinek = await oszlop.locator('.csomag-betu').evaluateAll((l) => [...new Set(l.map((e) => `${e.dataset.betu}:${getComputedStyle(e).backgroundColor}`))])
ok('betűnként más szín', true, new Set(szinek.map((x) => x.split(':')[1])).size >= 3)
const elso = oszlop.locator('.minikartya').filter({ hasText: 'HET-100' })
ok('az extrák rövidítve, utánuk a megjegyzés', [true, true],
  [/^\+ \S+/.test(sima(await elso.locator('.mini-extrak').innerText())), sima(await elso.locator('.mini-extrak').innerText()).includes('kutyaszőr')])
const sorok = await elso.evaluate((e) => {
  const t = (s) => Math.round(e.querySelector(s).getBoundingClientRect().top)
  return { azon: t('.azon'), extra: t('.mini-extrak'), ido: t('.ido') }
})
ok('az extra és a megjegyzés a rendszám sorában, nem új sorban', [true, true],
  [Math.abs(sorok.extra - sorok.azon) <= 4, sorok.ido > sorok.azon + 4 && (await elso.locator('> span').count()) === 2])
await kep(oszlop, '04-heti-oszlop')
await kep(p.locator('.hetracs').last(), '05-heti-nezet')
await p.setViewportSize({ width: 390, height: 844 })
await p.waitForTimeout(800)
await elso.scrollIntoViewIfNeeded()
await kep(p, '05b-heti-telefon')
await p.setViewportSize({ width: 1440, height: 1000 })
await p.waitForTimeout(600)

console.log('\n=== 5) Cég módosítása: rákérdez a többi aktív foglalásra ===\n')
const uj = async (rsz) => (await sql(`select create_booking($1::jsonb) id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', drop_off_time: '10:00', service_date: nap,
  package_id: csomagok[0].id, extras: [], customer_name: 'Kettős Klára', customer_phone: '+36 30 126 9999', company_name: 'Omega Trans Kft.', plate_raw: rsz,
})]))[0].id
const k1 = await uj('OMG-001')
const k2 = await uj('OMG-002')
const k3 = await uj('OMG-003')
const cege = async (id) => (await sql(`select c.company_name from bookings b join customers c on c.id = b.customer_id where b.id = $1`, [id]))[0].company_name
await p.locator('.nezetvalto button:visible').filter({ hasText: /^Nap$/ }).first().click()
await p.waitForTimeout(1500)
await p.locator('.napi-lista .kartya').filter({ hasText: 'OMG-001' }).first().locator('.kartya-nyit').click()
await p.waitForTimeout(1500)
const ml = p.locator('dialog[aria-label="Munkalap"]')
const cegSor = ml.locator('.szerk-sor').filter({ has: p.locator('.szerk-cimke', { hasText: /^Cég$/ }) })
await cegSor.locator('.szerk-ertek').click()
await p.locator('#munkalap-ceg').fill('Szigma Kft.')
await p.locator('#munkalap-ceg').press('Enter')
await p.waitForTimeout(800)
const egyeztet = async () => {
  const d = p.locator('dialog').filter({ has: p.locator('#ceg-kerdes') })
  if (await d.count()) { await d.locator('.btn-fo').first().click(); await p.waitForTimeout(600) }
}
await egyeztet()
const va = p.locator('.ceg-valtas')
await va.waitFor({ timeout: 10000 })
ok('felugrik: a másik két aktív foglalás, alapból nincs kijelölve', [2, [false, false]],
  [await va.locator('.ceg-valtas-lista li').count(), await va.locator('.ceg-valtas-lista input').evaluateAll((l) => l.map((e) => e.checked))])
ok('a rendszámok látszanak', ['OMG-002', 'OMG-003'], (await va.locator('.ceg-valtas-lista .rendszam').allInnerTexts()).sort())
await kep(va, '06-cegvaltas-ablak')
await va.getByRole('button', { name: 'Csak ennél a foglalásnál' }).click()
await p.waitForTimeout(1500)
ok('csak ennél a foglalásnál változott', ['Szigma Kft.', 'Omega Trans Kft.', 'Omega Trans Kft.'], [await cege(k1), await cege(k2), await cege(k3)])
await p.keyboard.press('Escape')
await p.waitForTimeout(600)

await p.locator('.napi-lista .kartya').filter({ hasText: 'OMG-002' }).first().locator('.kartya-nyit').click()
await p.waitForTimeout(1500)
await ml.getByRole('button', { name: 'Szerkesztés' }).click()
await p.waitForTimeout(1500)
const urlap = p.locator('dialog[aria-label="Időpont módosítása"]')
const cegMezo = urlap.locator('#ceg')
await cegMezo.fill('Szigma Kft.')
await p.waitForTimeout(600)
await urlap.getByRole('button', { name: 'Módosítás mentése' }).click()
await p.waitForTimeout(800)
await egyeztet()
await va.waitFor({ timeout: 10000 })
ok('az űrlapból is rákérdez, itt már csak egy társ van', 1, await va.locator('.ceg-valtas-lista li').count())
await va.locator('.ceg-valtas-lista input').first().check()
await va.getByRole('button', { name: /Mentés \(2 foglalás\)/ }).click()
await p.waitForTimeout(2000)
ok('a kijelölttel együtt mindkettő módosult', ['Szigma Kft.', 'Szigma Kft.', 'Szigma Kft.'], [await cege(k1), await cege(k2), await cege(k3)])
await ctx.close()

console.log('\n=== 6) Publikus oldal: a Galéria a foglalás alatt ===\n')
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const q = await c.newPage()
  await q.goto(`${CIM}/publikus`)
  await q.locator('.kv-galeria').waitFor({ timeout: 90000 })
  const sor = await q.evaluate(() => [...document.querySelector('.kv').children]
    .map((e) => [...e.classList].find((x) => ['kv-rolunk', 'kv-ketoszlop', 'kv-galeria', 'kv-velemenyek', 'kv-hely'].includes(x))).filter(Boolean))
  ok('sorrend: Rólunk, Csomagok + Foglalás, Galéria, Vélemények, Hol vagyunk', ['kv-rolunk', 'kv-ketoszlop', 'kv-galeria', 'kv-velemenyek', 'kv-hely'],
    sor.filter((x) => x !== 'kv-velemenyek' || true))
  ok('a menü is ebben a sorrendben', ['Rólunk', 'Csomagok', 'Foglalás', 'Galéria', 'Kapcsolat'], (await q.locator('.kv-nav nav a').allTextContents()).map(sima))
  await q.locator('.kv-galeria').scrollIntoViewIfNeeded()
  await q.waitForTimeout(800)
  await kep(q, '07-publikus-galeria')
  await c.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
