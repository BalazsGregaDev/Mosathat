import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adatbazis, TULAJ } from './_db.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const kep = async (p, nev, egesz = false) => {
  if (!KEPEK) return
  await p.waitForTimeout(400)
  await p.screenshot({ path: join(KEPEK, `${nev}.png`), fullPage: egesz })
}
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const SB = 'http://localhost:5181'
const ASZTALI = { viewport: { width: 1280, height: 900 } }
const TELEFON = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
const egy = async (s, p) => (await q(s, p))[0]
await q(`select set_config('app.uid', $1, false)`, [TULAJ])
await q(`select publikus_tartalom_mentes($1)`, [JSON.stringify({ adatok: { google_ertekeles: 'https://g.page/r/pelda/review' } })])
const START = (await egy(`select id from packages where code = 'START'`)).id
const PREMIUM = (await egy(`select id from packages where code = 'PREMIUM'`)).id
const napok = (await q(`select d::date::text d from generate_series(
    (now() at time zone 'Europe/Budapest')::date + 3,
    (now() at time zone 'Europe/Budapest')::date + 40, interval '1 day') d
  where munkanap(d::date) order by d limit 6`)).map((r) => r.d)

let n = 0
async function foglal(x = {}) {
  n++
  const id = (await egy(`select publikus_foglalas($1) id`, [JSON.stringify({
    category: 'SZEMELYAUTO', scope: 'TELJES', package_id: START, booking_type: 'LEADOS', service_date: napok[0],
    drop_off_time: '09:00', customer_name: `Kovács Péter`, customer_phone: `+36 30 900 ${String(1000 + n)}`,
    customer_email: `peter${n}@pelda.hu`, plate_raw: `ABC-${100 + n}`, brand: 'Skoda', model: 'Octavia', ...x })])).id
  await q(`select set_config('app.uid', $1, false)`, [TULAJ])
  await q(`select online_keres_dontes($1, true)`, [id])
  return { id, token: (await egy(`select token from booking_links where booking_id = $1`, [id])).token }
}

const a = await foglal({ notes: 'Kutyaszőr hátul' })
await q(`select patch_booking($1, $2::jsonb)`, [a.id, JSON.stringify({ drop_off_time: '08:00', package_id: PREMIUM })])
const MIND = `(select coalesce(array_agg(t.id), '{}') from booking_tasks t where t.booking_id = $1)`
const kesz = await foglal({ service_date: napok[1], pick_up_time: '16:30' })
const becsult = (await egy(`select estimated_price_huf p from bookings where id = $1`, [kesz.id])).p
await q(`select booking_finish($1, ${MIND}, $2, 'Erősen kutyaszőrös belső, plusz fél óra porszívózás', false)`, [kesz.id, becsult + 4000])
const atvett = await foglal({ service_date: napok[2] })
await q(`select booking_finish($1, ${MIND})`, [atvett.id])
await q(`select set_booking_status($1, 'COMPLETED', null, true)`, [atvett.id])
const lejart = await foglal({ service_date: napok[3] })
await q(`select booking_finish($1, ${MIND})`, [lejart.id])
await q(`select set_booking_status($1, 'COMPLETED', null, true)`, [lejart.id])
await q(`update bookings set atvetel_at = now() - interval '12 days' where id = $1`, [lejart.id])
const angol = await foglal({ service_date: napok[4], nyelv: 'en', booking_type: 'VAROS', drop_off_time: null, start_time: '10:00' })

async function oldal(opts) {
  const ctx = await b.newContext(opts)
  await ctx.route('https://teszt.supabase.co/**', async (r) => {
    const ut = new URL(r.request().url()).pathname
    const fn = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(ut)?.[1]
    if (fn && (fn.startsWith('publikus_') || fn.startsWith('foglalasom'))) {
      const body = r.request().postData() ? JSON.parse(r.request().postData()) : {}
      const k = Object.keys(body)
      try {
        const x = (await db.query(`select ${fn}(${k.map((nev, i) => `${nev} => $${i + 1}`).join(', ')}) as x`,
          k.map((nev) => (body[nev] !== null && typeof body[nev] === 'object' ? JSON.stringify(body[nev]) : body[nev])))).rows[0].x
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(x) })
      } catch (e) {
        return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) })
      }
    }
    return r.fulfill({ contentType: 'application/json', body: '[]' })
  })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  return { ctx, p, hibak }
}
const nyit = async (p, token, extra = '') => {
  await p.goto(`${SB}/foglalas/${token}${extra}`)
  await p.locator('.ugy-sav h1').waitFor({ timeout: 90000 })
  await p.waitForTimeout(500)
}

console.log('=== 1) Visszaigazolt foglalás, módosított adatokkal ===\n')
{
  const { ctx, p, hibak } = await oldal(ASZTALI)
  await nyit(p, a.token)
  ok('a cím', 'Visszaigazolt foglalás', (await p.locator('.ugy-sav h1').innerText()).trim())
  ok('a lépések: a második az aktív', 'VISSZAIGAZOLVA', (await p.locator('.ugy-lepesek li[aria-current="step"]').innerText()).trim().toUpperCase())
  ok('a böngészőfül címe', true, (await p.title()).startsWith('Foglalásom: ABC-101'))
  const valtozott = await p.locator('.ugy-sor[data-valtozott] dt').allInnerTexts()
  ok('módosítva: hozás, szolgáltatás, ár', ['HOZOD', 'SZOLGÁLTATÁS', 'BECSÜLT ÁR'], valtozott.map((x) => x.trim().toUpperCase()))
  const hozas = p.locator('.ugy-sor').filter({ hasText: /Hozod/i })
  ok('a régi érték áthúzva, az új kiemelve', ['9:00', '8:00'], [await hozas.locator('.ugy-regi').innerText(), await hozas.locator('.ugy-uj').innerText()])
  ok('nem módosult sor nincs jelölve', 0, await p.locator('.ugy-sor').filter({ hasText: /^Nap/i }).locator('.ugy-regi').count())
  ok('a lemondás kártya látszik', 1, await p.locator('.ugy-lemondas').count())
  ok('az elérhetőség látszik', true, (await p.locator('.ugy-kapcsolat').innerText()).includes('+36'))
  await kep(p, '01-visszaigazolt-asztali', true)

  await p.fill('#ugy-modositas', 'Egy órával korábban hoznám, 7:00 körül, ha belefér.')
  await p.locator('.ugy-modositas .ugy-gomb').click()
  await p.waitForTimeout(1200)
  ok('az üzenet megjelent: elküldve', ['Egy órával korábban hoznám, 7:00 körül, ha belefér.', 'ELKÜLDVE, HAMAROSAN INTÉZZÜK.'],
    [await p.locator('.ugy-uzenetek li p').first().innerText(), (await p.locator('.ugy-uzenet-allapot').first().innerText()).toUpperCase()])
  ok('a mező kiürült', '', await p.inputValue('#ugy-modositas'))
  ok('az adatbázisban a kérés', 1, (await egy(`select count(*)::int n from booking_change_requests where booking_id = $1`, [a.id])).n)
  await kep(p, '02-modositasi-keres-elkuldve')
  await q(`select set_config('app.uid', $1, false)`, [TULAJ])
  await q(`select modositas_elintezve($1)`, [a.id])
  await p.reload()
  await p.locator('.ugy-sav h1').waitFor()
  await p.waitForTimeout(500)
  ok('elintézés után: elintéztük', 'ELINTÉZTÜK.', (await p.locator('.ugy-uzenet-allapot').first().innerText()).toUpperCase())

  await p.locator('.ugy-lemondas .ugy-gomb').click()
  ok('megerősítő kérdés', true, (await p.locator('.ugy-kerdes').innerText()).includes('Biztosan'))
  await kep(p, '03-lemondas-kerdes')
  await p.locator('.ugy-lemondas .ugy-gomb-veszely').click()
  await p.waitForTimeout(1500)
  ok('lemondva', 'A foglalás lemondva', (await p.locator('.ugy-sav h1').innerText()).trim())
  ok('lemondás után: új időpont és főoldal gomb', 2, await p.locator('.ugy-tovabb a').count())
  await kep(p, '04-lemondva')
  ok('nincs JS hiba', [], hibak)
  await ctx.close()
}

console.log('\n=== 2) Elkészült ===\n')
{
  const { ctx, p, hibak } = await oldal(ASZTALI)
  await nyit(p, kesz.token)
  ok('a cím', 'Elkészült az autód', (await p.locator('.ugy-sav h1').innerText()).trim())
  ok('legkésőbb a megbeszélt időpont', true, (await p.locator('.ugy-kesz-fej strong').innerText()).endsWith('16:30'))
  ok('végösszeg és az eredeti ár áthúzva', [true, true],
    [(await p.locator('.ugy-vegosszeg strong').innerText()).replace(/\s/g, '').includes(String(becsult + 4000)),
     (await p.locator('.ugy-vegosszeg s').count()) === 1])
  ok('a felár oka', true, (await p.locator('.ugy-indok').innerText()).includes('Erősen kutyaszőrös belső'))
  ok('a harmadik lépés az aktív', 'KÉSZ', (await p.locator('.ugy-lepesek li[aria-current="step"]').innerText()).trim().toUpperCase())
  ok('nincs kimaradt munka', 1, await p.locator('.ugy-indok').count())
  ok('kész állapotban már nem mondható le', 0, await p.locator('.ugy-lemondas').count())
  await kep(p, '05-elkeszult-asztali', true)
  ok('nincs JS hiba', [], hibak)
  await ctx.close()
  const t = await oldal(TELEFON)
  await nyit(t.p, kesz.token)
  await kep(t.p, '06-elkeszult-telefon', true)
  await t.ctx.close()
}

console.log('\n=== 3) Átvéve: köszönjük, értékelés ===\n')
{
  const { ctx, p, hibak } = await oldal(ASZTALI)
  await nyit(p, atvett.token)
  ok('a cím', 'Köszönjük, hogy minket választottál!', (await p.locator('.ugy-sav h1').innerText()).trim())
  ok('a Google-értékelés linkje', 'https://g.page/r/pelda/review', await p.locator('.ugy-ertekeles a').getAttribute('href'))
  ok('két gomb: főoldal és új időpont', ['/publikus', '/publikus#foglalas'],
    await p.locator('.ugy-tovabb a').evaluateAll((l) => l.map((x) => x.getAttribute('href'))))
  ok('az adatok és a módosítás már nem látszik', [0, 0], [await p.locator('.ugy-adatok').count(), await p.locator('.ugy-modositas').count()])
  await kep(p, '07-atveve-asztali', true)
  ok('nincs JS hiba', [], hibak)
  await ctx.close()
  const t = await oldal(TELEFON)
  await nyit(t.p, atvett.token)
  await kep(t.p, '08-atveve-telefon', true)
  await t.ctx.close()
}

console.log('\n=== 4) Lejárt és ismeretlen link ===\n')
{
  const { ctx, p } = await oldal(ASZTALI)
  await nyit(p, lejart.token)
  ok('lejárt', 'Ez a link már nem érvényes', (await p.locator('.ugy-sav h1').innerText()).trim())
  ok('nincs rendszám a fejlécben', 'FOGLALÁSOM', (await p.locator('.ugy-felcim').innerText()).trim().toUpperCase())
  await kep(p, '09-lejart')
  await nyit(p, '0'.repeat(32))
  ok('ismeretlen', 'Ezt a foglalást nem találjuk', (await p.locator('.ugy-sav h1').innerText()).trim())
  await ctx.close()
}

console.log('\n=== 5) Angolul foglalt: angol oldal ===\n')
{
  const { ctx, p, hibak } = await oldal(TELEFON)
  await nyit(p, angol.token)
  ok('angol cím', 'Your booking is confirmed', (await p.locator('.ugy-sav h1').innerText()).trim())
  ok('megvárós: kezdés és várható vége', ['START', 'EXPECTED TO BE READY'],
    (await p.locator('.ugy-sor dt').allInnerTexts()).slice(1, 3).map((x) => x.trim().toUpperCase()))
  await kep(p, '10-angol-telefon', true)
  await p.locator('button.nyelv-kapcsolo:visible').first().click()
  await p.waitForTimeout(600)
  ok('átváltható magyarra', 'Visszaigazolt foglalás', (await p.locator('.ugy-sav h1').innerText()).trim())
  ok('nincs JS hiba', [], hibak)
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
