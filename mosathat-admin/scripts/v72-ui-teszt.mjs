import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adatbazis, TULAJ } from './_db.mjs'

const CIM = process.env.CIM ?? 'http://localhost:5181/'
const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const var_ = (ms) => new Promise((r) => setTimeout(r, ms))

const ma = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date())
const db = await adatbazis({ demo: true })
await db.query(`select set_config('app.uid', $1, false)`, [TULAJ])
const nap = (await db.query(`select service_date::text d from bookings group by 1 order by count(*) desc limit 1`)).rows[0].d
const at = (sor) => JSON.parse(JSON.stringify(sor).replaceAll(nap, ma))
const lekér = async (fn) => {
  const sorok = (await db.query(`select * from ${fn}($1)`, [nap])).rows
  return at(sorok.map((r) => (Object.keys(r).length === 1 && fn in r ? r[fn] : r)))
}
const FIX = {
  day_bookings: await lekér('day_bookings'),
  day_capacity: await lekér('day_capacity'),
  work_windows: await lekér('work_windows'),
  day_lanes: await lekér('day_lanes'),
  dashboard_summary: at((await db.query(`select dashboard_summary($1) x`, [nap])).rows[0].x),
}
await db.close()
const rendszam = FIX.day_bookings.find((b) => b.status !== 'CANCELLED')?.plate_raw

const allas = { hibas: 0, tartos: false, napiHivas: 0 }
const USER = { id: TULAJ, email: 'tulaj@mosathat.hu', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

async function kornyezet(viewport) {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport })
  await ctx.route('https://teszt.supabase.co/**', async (r) => {
    const u = new URL(r.request().url())
    const ut = u.pathname
    if (ut.startsWith('/auth/v1/token')) {
      return json(r, { access_token: 't', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
                       expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER })
    }
    if (ut.startsWith('/auth/v1/user')) return json(r, USER)
    if (ut.startsWith('/auth/')) return json(r, {})
    if (ut === '/rest/v1/staff') return json(r, { id: TULAJ, full_name: 'Tulaj Tamás', role: 'TULAJDONOS', active: true })
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(ut)?.[1]
    if (rpc === 'day_bookings') {
      allas.napiHivas++
      if (allas.tartos || allas.hibas > 0) {
        if (allas.hibas > 0) allas.hibas--
        return r.abort('failed')
      }
      return json(r, FIX.day_bookings)
    }
    if (rpc && FIX[rpc]) return json(r, FIX[rpc])
    if (rpc === 'can_edit_customers') return json(r, true)
    if (rpc === 'start_perc') return json(r, null)
    return json(r, [])
  })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push((e.stack ?? e.message).slice(0, 600)))
  return { b, p, hibak }
}

async function belep(p) {
  await p.goto(CIM)
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).click({ timeout: 20000 })
  await p.setViewportSize({ width: 390, height: 844 })
}

const ebresztes = (p) => p.evaluate(() => {
  for (const v of ['hidden', 'visible']) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
    document.dispatchEvent(new Event('visibilitychange'))
  }
})
const kartyak = (p) => p.getByText(rendszam, { exact: true }).count()

console.log(`=== 1) Betöltés (szimulált Supabase, ${FIX.day_bookings.length} foglalás) ===\n`)
const { b, p, hibak } = await kornyezet({ width: 1600, height: 1000 })
await belep(p)
await p.getByText(rendszam, { exact: true }).first().waitFor({ timeout: 20000 })
const eredeti = await kartyak(p)
ok('a nap betölt', true, eredeti > 0)

console.log('\n=== 2) Ébredéskor két hálózati hiba ===\n')
allas.hibas = 2
let elotte = allas.napiHivas
await ebresztes(p)
await var_(3500)
ok('magától újrapróbált és sikerült (3 kérés)', 3, allas.napiHivas - elotte)
ok('nincs hibaüzenet', [0, 0], [await p.locator('.nap-frissites-hiba').count(), await p.locator('.hibauzenet').count()])
ok('a foglalások ott vannak', eredeti, await kartyak(p))

console.log('\n=== 3) Tartósan nincs net ébredéskor ===\n')
allas.tartos = true
await ebresztes(p)
await p.locator('.nap-frissites-hiba').waitFor({ timeout: 12000 })
const banner = (await p.locator('.nap-frissites-hiba').innerText()).replace(/\s+/g, ' ')
ok('felül sárga sáv, csak ennyi: Nem sikerült frissíteni + Újra', 'Nem sikerült frissíteni Újra', banner.trim())
ok('a foglalások NEM tűntek el', eredeti, await kartyak(p))
if (KEPEK) await p.screenshot({ path: join(KEPEK, 'v72-frissitesi-hiba.png') })

console.log('\n=== 4) Visszajön a net ===\n')
allas.tartos = false
await p.locator('.nap-frissites-hiba').waitFor({ state: 'detached', timeout: 12000 })
ok('pár másodpercen belül magától eltűnik a sáv', 0, await p.locator('.nap-frissites-hiba').count())
ok('foglalások rendben', eredeti, await kartyak(p))
ok('nincs JS hiba', [], hibak)
await b.close()

console.log('\n=== 5) Már megnyitáskor nincs net ===\n')
allas.tartos = true
const k2 = await kornyezet({ width: 1600, height: 1000 })
await belep(k2.p)
await k2.p.locator('.nap-hiba').waitFor({ timeout: 20000 })
const hiba = (await k2.p.locator('.nap-hiba').innerText()).replace(/\s+/g, ' ')
ok('csak ennyi: Nem sikerült frissíteni + Újra', 'Nem sikerült frissíteni Újra', hiba.trim())
if (KEPEK) await k2.p.screenshot({ path: join(KEPEK, 'v72-megnyitasi-hiba.png') })
allas.tartos = false
await k2.p.getByText(rendszam, { exact: true }).first().waitFor({ timeout: 15000 })
ok('visszajövő netnél gombnyomás nélkül betölt', true, (await kartyak(k2.p)) > 0)
if (KEPEK) await k2.p.screenshot({ path: join(KEPEK, 'v72-helyreallt.png') })

ok('nincs JS hiba', [], k2.hibak)
await k2.b.close()

console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
