import { hetkoznapra } from './_munkanap.mjs'

export const CIM = 'http://localhost:5180'

export async function foglalasOldal(b, { viewport = { width: 1440, height: 1000 }, kontextus = {}, hiba = null, ut = '/publikus' } = {}) {
  const ctx = await b.newContext({ viewport, ...kontextus })
  const p = await ctx.newPage()
  if (hiba) p.on('pageerror', hiba)
  await hetkoznapra(p)
  await p.route(/google\.com\/maps/, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>térkép</p>' }))
  await p.goto(CIM + ut)
  const m = p.locator('.kv-foglalas-elo .fogl')
  await m.waitFor({ timeout: 90000 })
  await p.waitForFunction(() => typeof window.mosathatDemoSql === 'function', null, { timeout: 90000 })
  const sql = (s, par = []) => p.evaluate(([s2, p2]) => window.mosathatDemoSql(s2, p2), [s, par])
  return { ctx, p, m, sql }
}

export async function adminOldal(b, { viewport = { width: 1440, height: 1000 }, kontextus = {}, hiba = null } = {}) {
  const ctx = await b.newContext({ viewport, ...kontextus })
  const p = await ctx.newPage()
  if (hiba) p.on('pageerror', hiba)
  await hetkoznapra(p)
  await p.goto(CIM + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 90000 })
  await p.waitForFunction(() => typeof window.mosathatDemoSql === 'function', null, { timeout: 90000 })
  const sql = (s, par = []) => p.evaluate(([s2, p2]) => window.mosathatDemoSql(s2, p2), [s, par])
  const belep = async (email) => {
    await p.fill('input[type="email"]', email)
    await p.fill('input[type="password"]', 'x')
    await p.getByRole('button', { name: /Belépés/ }).click()
    await p.waitForTimeout(2500)
  }
  return { ctx, p, sql, belep }
}

export async function szabadNap(sql, tol = 1) {
  const [r] = await sql(`select d::date::text d from generate_series(public.budapest_ma() + $1::int, public.budapest_ma() + 40, interval '1 day') d
    where public.munkanap(d::date) and extract(isodow from d) < 6
      and not exists (select 1 from public.bookings b where b.service_date = d::date and b.status not in ('REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW'))
    order by d limit 1`, [tol])
  return r.d
}

let sorszam = 0
export async function onlineKeres(sql, x = {}) {
  sorszam++
  const [cs] = await sql(`select id from public.packages where code = $1`, [x.csomag ?? 'PREMIUM'])
  const nap = x.service_date ?? await szabadNap(sql)
  const adat = {
    category: 'SZEMELYAUTO', scope: 'TELJES', package_id: cs.id, booking_type: 'LEADOS', service_date: nap,
    drop_off_time: '09:00', customer_name: 'Próba Pál', customer_phone: `+36 30 999 ${String(8800 + sorszam)}`,
    customer_email: `pal${sorszam}@pelda.hu`, plate_raw: `PRB-${String(100 + sorszam)}`, brand: 'Skoda', model: 'Octavia',
    ...x,
  }
  delete adat.csomag
  const [r] = await sql(`select public.publikus_foglalas($1::jsonb) id`, [JSON.stringify(adat)])
  return { id: r.id, nap, rendszam: adat.plate_raw.toUpperCase() }
}

export async function napra(p, nap) {
  const ma = await p.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date()))
  const kul = Math.round((Date.parse(`${nap}T12:00:00Z`) - Date.parse(`${ma}T12:00:00Z`)) / 86400000)
  const gomb = p.locator(`button[aria-label="${kul >= 0 ? 'Előre' : 'Vissza'}"]:visible`).first()
  for (let i = 0; i < Math.abs(kul); i++) await gomb.click()
  await p.waitForTimeout(1500)
}

export const valtozas = (p) => p.evaluate(() => window.mosathatDemoValtozas())

export async function urestNapotValaszt(m, sql) {
  const nap = await szabadNap(sql)
  await m.locator('.fogl-nap').filter({ has: m.page().locator('.szam', { hasText: new RegExp(`^${Number(nap.slice(8, 10))}$`) }) }).first().click()
  await m.page().waitForTimeout(600)
  return nap
}
