import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adatbazis, ALK, TULAJ } from './_db.mjs'

const CIM = process.env.CIM ?? 'http://localhost:5181'
const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const sima = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

const db = await adatbazis({ demo: true })
const TABLAK = ['packages', 'package_pricing', 'full_service_pricing', 'extras', 'surcharges', 'v_package_matrix', 'v_package_extra']

async function rpc(fn, body, uid) {
  await db.query(`select set_config('app.uid', $1, false)`, [uid])
  const kulcsok = Object.keys(body ?? {})
  const args = kulcsok.map((k, i) => `${k} => $${i + 1}`).join(', ')
  const ertekek = kulcsok.map((k) => (body[k] !== null && typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]))
  return (await db.query(`select ${fn}(${args}) as x`, ertekek)).rows[0].x
}

const b = await chromium.launch()
const szerep = { role: 'TULAJDONOS', id: TULAJ }
const json = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function kornyezet(viewport = { width: 1500, height: 1000 }) {
  const ctx = await b.newContext({ viewport })
  await ctx.route('https://teszt.supabase.co/**', async (r) => {
    const u = new URL(r.request().url())
    const ut = u.pathname
    const belepve = (r.request().headers().authorization ?? '') === 'Bearer t'
    const user = { id: szerep.id, email: 'x@mosathat.hu', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
    if (ut.startsWith('/auth/v1/token')) {
      return json(r, { access_token: 't', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
                       expires_at: Math.floor(Date.now() / 1000) + 3600, user })
    }
    if (ut.startsWith('/auth/v1/user')) return json(r, user)
    if (ut.startsWith('/auth/')) return json(r, {})
    if (ut === '/rest/v1/staff') return json(r, { id: szerep.id, full_name: 'Teszt', role: szerep.role, active: true })
    const tabla = /^\/rest\/v1\/([a-z_]+)$/.exec(ut)?.[1]
    if (tabla && TABLAK.includes(tabla)) return json(r, (await db.query(`select * from ${tabla}`)).rows)
    const fn = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(ut)?.[1]
    if (fn && (fn.startsWith('publikus_') || ['csomag_szerkeszto', 'dashboard_summary'].includes(fn))) {
      try {
        const body = r.request().postData() ? JSON.parse(r.request().postData()) : {}
        return json(r, await rpc(fn, body, belepve ? szerep.id : ''))
      } catch (e) {
        return json(r, { code: 'P0001', message: e.message, details: null, hint: null }, 400)
      }
    }
    if (fn === 'can_edit_customers') return json(r, true)
    if (fn === 'start_perc') return json(r, null)
    return json(r, [])
  })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push((e.stack ?? e.message).slice(0, 300)))
  return { ctx, p, hibak }
}

async function belep(p, telefon = false) {
  await p.goto(CIM + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'x@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  try {
    if (telefon) await p.locator('.mobil-fejlec .hamburger').waitFor({ timeout: 20000 })
    else await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).waitFor({ timeout: 20000 })
  } catch (e) {
    console.log(sima(await p.locator('body').innerText()).slice(0, 400))
    throw e
  }
}

const menuPont = (p, nev) => p.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${nev}$`) })
const ment = async (p) => {
  await p.locator('.pub-fej').getByRole('button', { name: 'Mentés' }).click()
  await p.locator('.pub-mentve, .pub-hiba').first().waitFor({ timeout: 10000 })
  return sima(await p.locator('.pub-mentve, .pub-hiba').first().textContent())
}
const szoveg = (p, kulcs) => p.locator(`.pub-szoveg[data-kulcs="${kulcs}"]`)

console.log('=== 1) Menü: Publikus csoport tulajdonosnak ===\n')
const a = await kornyezet()
const p = a.p
await belep(p)
const menu = await p.locator('aside.oldalsav .menu').evaluate((m) => [...m.children].map((e) =>
  e.classList.contains('menu-cim') ? `# ${e.textContent.trim()}` : e.textContent.trim()))
const pubIdx = menu.indexOf('# Publikus')
ok('a Publikus címke alatt: Elérhetőség, Tartalom, Csomagok, Cégadatok, Jogi szövegek, Arculat',
  ['Elérhetőség', 'Tartalom', 'Csomagok', 'Cégadatok', 'Jogi szövegek', 'Arculat'], menu.slice(pubIdx + 1, pubIdx + 7))
ok('az Arculat már nem a fő menüben van, a Később alatt nincs Tartalom', [false, ['Készlet', 'Galéria']],
  [menu.slice(0, pubIdx).includes('Arculat'), menu.slice(menu.indexOf('# Később') + 1)])
if (KEPEK) await p.locator('aside.oldalsav').screenshot({ path: join(KEPEK, 'v82-menu.png') })

console.log('\n=== 2) Szolgáltatások: a Csomagok szerkesztése gomb átvisz ===\n')
await menuPont(p, 'Szolgáltatások').click()
await p.getByRole('button', { name: 'Csomagok szerkesztése' }).click()
await p.locator('.csomag-szerk').waitFor({ timeout: 15000 })
ok('a Publikus › Csomagok menüpont nyílik meg, benne a szerkesztővel', ['page', 'Csomagok', 1],
  [await menuPont(p, 'Csomagok').getAttribute('aria-current'), sima(await p.locator('.pub-fej h2').textContent()),
   await p.locator('.szerk-tabla').count()])
if (KEPEK) await p.screenshot({ path: join(KEPEK, 'v82-csomagok.png') })

console.log('\n=== 3) Tartalom ===\n')
await menuPont(p, 'Tartalom').click()
await p.locator('.pub-szoveg').first().waitFor({ timeout: 15000 })
const kulcsok = await p.locator('.pub-szoveg').evaluateAll((l) => l.map((e) => e.dataset.kulcs))
ok('minden szöveg pontosan egyszer, sávokba rendezve (123 mező, 18 sáv)', [123, 123, 18],
  [kulcsok.length, new Set(kulcsok).size, await p.locator('.pub-sav').count()])
ok('nincs már „Így jelenik meg” sor', 0, await p.getByText('Így jelenik meg').count())
const sav = (id) => p.locator(`.pub-sav[data-sav="${id}"]`)
ok('a sávok sorrendje követi az oldalt, a foglalás lépésenként',
  ['menu', 'hero', 'rolunk', 'galeria', 'csomagok', 'fogl-fej', 'fogl-1', 'fogl-2', 'fogl-3', 'fogl-4', 'fogl-5', 'fogl-5fs', 'fogl-6', 'fogl-8', 'fogl-osszeg', 'fogl-siker', 'hely', 'lab'],
  await p.locator('.pub-sav').evaluateAll((l) => l.map((e) => e.dataset.sav)))
await p.waitForTimeout(2500)
const lathato = async (id) => sav(id).locator('.fogl > *').evaluateAll((l) => l.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.dataset.lepes))
ok('a lépés-előnézetek csak a saját lépésüket mutatják', [['auto'], ['csomag'], ['nap'], ['adatok'], ['osszeg'], ['siker']],
  [await lathato('fogl-1'), await lathato('fogl-2'), await lathato('fogl-6'), await lathato('fogl-8'), await lathato('fogl-osszeg'), await lathato('fogl-siker')])
const allapotok = []
for (const a of ['szabad', 'keves', 'tele', 'zarva']) allapotok.push((await sav('fogl-6').locator(`.fogl-nap[data-allapot="${a}"]`).count()) > 0)
ok('a naptár-előnézetben minden állapot látszik, és ki van választva egy nap és egy időpont', [true, true, true, true, 1, 1],
  [...allapotok, await sav('fogl-6').locator('.fogl-nap[aria-pressed="true"]').count(),
   await sav('fogl-6').locator('.fogl-idok button[aria-pressed="true"]').count()])
ok('alapból az eredeti szövegek állnak benne', 'Az autó nem tárgy.\n*Évekig* veled van.', await szoveg(p, 'hero.cim').locator('textarea').inputValue())
await szoveg(p, 'hero.cim').locator('textarea').fill('Teszt nyitó cím.\n*Kiemelt* második sor')
await szoveg(p, 'hero.felcim').locator('input').fill('Hívj: {telefon}')
await szoveg(p, 'foglalas.auto').locator('input').fill('Mivel érkezel?')
await szoveg(p, 'foglalas.kuldes').locator('input').fill('Kérés elküldése')
await p.waitForTimeout(600)
ok('az előnézet élőben követi a gépelést: kiemelés, behelyettesített telefonszám, foglalás lépései', ['Kiemelt', true, true, 'Kérés elküldése'],
  [sima(await sav('hero').locator('.kv-hero h1 em').textContent()),
   /Hívj: \+36 1 506 0420/i.test(sima(await sav('hero').locator('.kv-kicker').textContent())),
   /Mivel érkezel\?/.test(await sav('fogl-1').locator('[data-lepes="auto"] h2').textContent()),
   sima(await sav('fogl-osszeg').locator('.fogl-osszeg .btn-fo').textContent())])
ok('jelzi a nem mentett változást és a módosított mezőket', [true, 4],
  [await p.locator('.pub-valtozott').isVisible(), await p.locator('.pub-szoveg[data-valtozott]').count()])
if (KEPEK) {
  await p.locator('.tartalom').evaluate((e) => e.scrollTo(0, 0))
  await p.screenshot({ path: join(KEPEK, 'v82-tartalom-teteje.png') })
  for (const id of ['hero', 'fogl-2', 'fogl-6', 'fogl-osszeg']) {
    await sav(id).locator('h3').evaluate((h) => { const t = document.querySelector('.tartalom'); t.scrollTo(0, t.scrollTop + h.getBoundingClientRect().top - 150) })
    await p.waitForTimeout(300)
    await p.screenshot({ path: join(KEPEK, `v82-tartalom-${id}.png`) })
  }
}
ok('mentés', 'Mentve, a publikus oldalon már látszik', await ment(p))
ok('mentés után a módosított mezők jelölve maradnak, változás nincs', [4, 0],
  [await p.locator('.pub-szoveg .cimke-pill').count(), await p.locator('.pub-szoveg[data-valtozott]').count()])
await p.locator('.pub-keres input').fill('ülés')
const talalat = await p.locator('.pub-szoveg').evaluateAll((l) => l.map((e) => ({
  k: e.dataset.kulcs, sz: (e.querySelector('label').textContent + ' ' + e.querySelector('.beviteli').value).toLowerCase() })))
ok('keresés: csak az ülésre vonatkozó szövegek látszanak', [true, true, true],
  [talalat.length > 3 && talalat.length < 20, talalat.some((x) => x.k === 'foglalas.ules'), talalat.every((x) => x.sz.includes('ülés'))])
await p.locator('.pub-keres input').fill('')

console.log('\n=== 4) Elérhetőség ===\n')
await menuPont(p, 'Elérhetőség').click()
await p.locator('[data-mezo="telefon"]').waitFor({ timeout: 15000 })
ok('az aktuális adatok állnak benne', ['+36 1 506 0420', 'info@mosathat.hu', 'Dagály utca felől'],
  [await p.locator('[data-mezo="telefon"]').inputValue(), await p.locator('[data-mezo="email"]').inputValue(), await p.locator('[data-mezo="bejarat"]').inputValue()])
ok('a nyitvatartás és a leadás a Beállításokból, csak megjelenítve (a demóban szombat is nyitva)', 'Nyitvatartás Hétfő–Péntek 9:00–17:00, Szombat 8:00–14:00 Leadás legkorábban 7:15',
  sima(await p.locator('.pub-adatsor').textContent()).replace(/(Nyitvatartás|Leadás legkorábban)/g, ' $1 ').replace(/\s+/g, ' ').trim())
await p.locator('[data-mezo="telefon"]').fill('+36 1 777 8888')
await p.locator('[data-mezo="email"]').fill('nem-email')
ok('hibás e-mail: a szerver elutasítja, érthető üzenettel', true, /formátuma nem megfelelő/.test(await ment(p)))
await p.locator('[data-mezo="email"]').fill('foglalas@mosathat.hu')
ok('mentés', 'Mentve, a publikus oldalon már látszik', await ment(p))
if (KEPEK) await p.screenshot({ path: join(KEPEK, 'v82-elerhetoseg.png') })
await p.getByRole('button', { name: 'Beállítások megnyitása' }).click()
ok('a Beállítások gomb átvisz', 'page', await menuPont(p, 'Beállítások').getAttribute('aria-current'))

console.log('\n=== 5) Cégadatok ===\n')
await menuPont(p, 'Cégadatok').click()
await p.locator('[data-mezo="ceg_adoszam"]').waitFor({ timeout: 15000 })
ok('a cégadatok előre kitöltve', ['13562496-2-41', '01-09-861782', true],
  [await p.locator('[data-mezo="ceg_adoszam"]').inputValue(), await p.locator('[data-mezo="ceg_cegjegyzekszam"]').inputValue(),
   await p.locator('[data-mezo="jogi_tervezet"]').isChecked()])
await p.locator('[data-mezo="konyvelo_nev"]').fill('Példa Könyvelő Kft.')
await p.locator('[data-mezo="konyvelo_cim"]').fill('1111 Budapest, Teszt utca 1.')
await p.locator('[data-mezo="kamera_megorzes"]').fill('3 munkanapig')
await p.getByRole('button', { name: '+ Kamera' }).click()
ok('üres kamerasor: a szerver elutasítja', true, /helyét/.test(await ment(p)))
await p.getByLabel('1. kamera helye').fill('Bejárat')
await p.getByLabel('1. kamera látótere').fill('a beálló autókat')
await p.getByRole('button', { name: '+ Kamera' }).click()
await p.getByLabel('2. kamera helye').fill('Mosótér')
await p.getByLabel('2. kamera látótere').fill('a két mosóhelyet')
await p.locator('.pub-kamera').nth(1).getByRole('button', { name: 'Fel' }).click()
await p.locator('[data-mezo="jogi_tervezet"]').uncheck()
ok('mentés', 'Mentve, a publikus oldalon már látszik', await ment(p))
if (KEPEK) {
  await p.locator('.tartalom').evaluate((e) => e.scrollTo(0, 0))
  await p.screenshot({ path: join(KEPEK, 'v82-cegadatok.png') })
}
ok('nincs JS hiba az adminban', [], a.hibak)

console.log('\n=== 6) A publikus oldal a mentett tartalmat mutatja ===\n')
const n = await kornyezet({ width: 1440, height: 900 })
await n.p.goto(CIM + '/publikus')
await n.p.locator('.kv-hero h1').waitFor({ timeout: 60000 })
ok('nagy cím sortöréssel és kiemeléssel', ['Teszt nyitó cím. Kiemelt második sor', 'Kiemelt', 1],
  [sima(await n.p.locator('.kv-hero h1').innerText()), sima(await n.p.locator('.kv-hero h1 em').textContent()), await n.p.locator('.kv-hero h1 br').count()])
ok('felcím az új telefonszámmal (az Elérhetőségből)', 'HÍVJ: +36 1 777 8888', sima(await n.p.locator('.kv-kicker').innerText()))
ok('a foglalás 1. lépése', true, /Mivel érkezel\?/.test(await n.p.locator('.kv-foglalas-elo .fogl-kartya h2').first().textContent()))
ok('lábléc: új telefon hívható linkkel, új e-mail', ['tel:+3617778888', 'mailto:foglalas@mosathat.hu'],
  [await n.p.locator('.kv-lab a[href^="tel:"]').getAttribute('href'), await n.p.locator('.kv-lab a[href^="mailto:"]').getAttribute('href')])
ok('a nem módosított szövegek változatlanok', ['Csomagok', 'Hol vagyunk'],
  [sima(await n.p.locator('.kv-csomagok h2').textContent()), sima(await n.p.locator('.kv-hely h2').textContent())])
if (KEPEK) await n.p.screenshot({ path: join(KEPEK, 'v82-publikus.png') })

await n.p.goto(CIM + '/adatvedelem')
await n.p.locator('.kv-jogi h1').waitFor({ timeout: 60000 })
const at = sima(await n.p.locator('.kv-jogi').innerText())
ok('adatvédelem: könyvelő a táblázatban, új elérhetőségek, nincs Tervezet jelzés', [true, true, true, false],
  [/Példa Könyvelő Kft\. könyvelés.* 1111 Budapest, Teszt utca 1\./.test(at), /\+36 1 777 8888/.test(at), /foglalas@mosathat\.hu/.test(at), /Tervezet:/.test(at)])
const kam = sima(await n.p.locator('.kv-jogi-kezeles').nth(7).innerText())
ok('kamerák a beállított sorrendben, megőrzési idő a mondatban', [true, true],
  [/Mosótér: a két mosóhelyet Bejárat: a beálló autókat/.test(kam), /a rögzítéstől számított 3 munkanapig, utána/.test(kam)])
if (KEPEK) await n.p.locator('.kv-jogi-kezeles').nth(7).screenshot({ path: join(KEPEK, 'v82-kamera.png') })
ok('nincs JS hiba a publikus oldalon', [], n.hibak)
await n.ctx.close()

console.log('\n=== 7) Eredeti szöveg visszaállítása ===\n')
await menuPont(p, 'Tartalom').click()
await szoveg(p, 'hero.cim').locator('textarea').waitFor({ timeout: 15000 })
await szoveg(p, 'hero.cim').getByRole('button', { name: 'Eredeti szöveg' }).click()
ok('mentés', 'Mentve, a publikus oldalon már látszik', await ment(p))
ok('az adatbázisban már nincs saját szöveg a címhez', false,
  'hero.cim' in (await rpc('publikus_oldal', {}, '')).szovegek)
await a.ctx.close()

console.log('\n=== 8) Alkalmazott: nincs Publikus menü ===\n')
szerep.role = 'STAFF'; szerep.id = ALK
const s = await kornyezet()
await belep(s.p)
const smenu = await s.p.locator('aside.oldalsav .menu').evaluate((m) => [...m.children].map((e) => e.textContent.trim()))
ok('a Publikus csoport és pontjai nem látszanak', [false, false, false], [smenu.includes('Publikus'), smenu.includes('Tartalom'), smenu.includes('Arculat')])
await s.ctx.close()

console.log('\n=== 9) Telefonon ===\n')
szerep.role = 'TULAJDONOS'; szerep.id = TULAJ
const t = await kornyezet({ width: 390, height: 844 })
await belep(t.p, true)
await t.p.locator('.mobil-fejlec .hamburger').click()
await t.p.locator('aside.fiok .menu button').filter({ hasText: /^Tartalom$/ }).click()
await t.p.locator('.pub-szoveg').first().waitFor({ timeout: 15000 })
ok('a Tartalom oldal telefonon sem lóg ki', true, await t.p.evaluate(() => document.querySelector('.tartalom').scrollWidth <= document.querySelector('.tartalom').clientWidth + 1))
if (KEPEK) await t.p.screenshot({ path: join(KEPEK, 'v82-tartalom-telefon.png') })
await t.ctx.close()

await b.close()
await db.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
