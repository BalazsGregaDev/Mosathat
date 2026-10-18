import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adatbazis, TULAJ } from './_db.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch()
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const DEMO = 'http://localhost:5180'
const SB = 'http://localhost:5181'
const sima = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kep = async (p, nev, opts = {}) => { if (KEPEK) { await p.waitForTimeout(300); await p.screenshot({ path: join(KEPEK, nev), ...opts }) } }
const kepElem = async (l, nev) => { if (KEPEK) { await l.page().waitForTimeout(300); await l.screenshot({ path: join(KEPEK, nev) }) } }

async function oldal(ut, opts = { viewport: { width: 1440, height: 900 } }, alap = DEMO) {
  const ctx = await b.newContext(opts)
  const p = await ctx.newPage()
  const hibak = []
  const keresek = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  p.on('request', (r) => keresek.push(new URL(r.url()).pathname))
  await p.goto(alap + ut)
  await p.locator('.kv-lab').waitFor({ timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
  return { ctx, p, hibak, keresek }
}
const gorget = async (p, y) => { await p.evaluate((yy) => scrollTo(0, yy), y); await p.waitForTimeout(350) }
const galeriahoz = async (p) => {
  await p.locator('.kv-galeria-eszkozok').evaluate((e) => scrollTo(0, e.getBoundingClientRect().top + scrollY - 90))
  await p.waitForFunction(() => document.querySelectorAll('.kv-moso[data-kesz]').length === 4, null, { timeout: 30000 })
  await p.waitForTimeout(300)
}
const alfa = (p, i, pontok) => p.locator('.kv-moso canvas').nth(i).evaluate((c, pp) => {
  const ctx = c.getContext('2d')
  return pp.map(([x, y]) => ctx.getImageData(Math.round(x * (c.width - 1)), Math.round(y * (c.height - 1)), 1, 1).data[3])
}, pontok)
const atlatszoSor = (p, i, y) => p.locator('.kv-moso canvas').nth(i).evaluate((c, yy) => {
  const d = c.getContext('2d').getImageData(0, Math.round(yy * c.height), c.width, 1).data
  let n = 0
  for (let k = 3; k < d.length; k += 4) if (d[k] < 40) n++
  return n / c.width
}, y)
async function lemos(p, i, sorok = 14) {
  await p.locator('.kv-moso').nth(i).evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await p.waitForTimeout(300)
  const r = await p.locator('.kv-moso').nth(i).boundingBox()
  for (let k = 0; k <= sorok; k++) {
    const y = r.y + r.height * (0.02 + (0.96 * k) / sorok)
    await p.mouse.move(r.x + 2, y)
    await p.mouse.move(r.x + r.width - 2, y, { steps: 14 })
  }
  await p.mouse.move(r.x + r.width + 30, r.y - 30)
}

console.log('=== 1) Szakaszok sorrendje, Rólunk szöveg, árak érvényessége ===\n')
const a = await oldal('/publikus')
{
  const p = a.p
  ok('sorrend: nyitó rész, borítókép, Rólunk, Galéria, Csomagok + Foglalás, Hol vagyunk, lábléc',
    ['kv-hero', 'kv-foto', 'kv-rolunk', 'kv-galeria', 'kv-ketoszlop', 'kv-hely', 'kv-lab'],
    await p.evaluate(() => [...document.querySelector('.pub-keret .kv').children]
      .map((e) => [...e.classList].find((c) => ['kv-hero', 'kv-foto', 'kv-rolunk', 'kv-galeria', 'kv-ketoszlop', 'kv-hely', 'kv-lab'].includes(c)))
      .filter(Boolean)))
  ok('Rólunk: cím és a két bekezdés', ['Rólunk', true, true],
    [sima(await p.locator('.kv-rolunk h2').textContent()),
     sima(await p.locator('.kv-rolunk-elso').textContent()).startsWith('Látogass el a XIII. kerületi autómosónkba'),
     sima(await p.locator('.kv-rolunk-szoveg p').nth(1).textContent()).endsWith('rövid és hosszútávon egyaránt.')])
  const fed = await p.evaluate(() => {
    const f = document.querySelector('.kv-foto').getBoundingClientRect()
    const r = document.querySelector('.kv-rolunk').getBoundingClientRect()
    return { atfed: Math.round(f.bottom - r.top), fotoFelul: Number(getComputedStyle(document.querySelector('.kv-foto')).zIndex) > 0 }
  })
  ok('a borítókép alja belelóg a sötétzöld sávba (a kép van felül)', [true, true], [fed.atfed > 100, fed.fotoFelul])
  const cs = await p.evaluate(() => {
    const t = (s) => document.querySelector(s).getBoundingClientRect()
    return { cim: t('.kv-csomagok h2').bottom, erv: t('.kv-ervenyes').top, ervAlja: t('.kv-ervenyes').bottom, kat: t('.kv-csomagok .kv-tabla-gorgo').top, szoveg: document.querySelector('.kv-ervenyes').textContent }
  })
  ok('Csomagok: a cím és a Járműkategória között az új alcím', [true, true, 'Áraink ettől érvényesek: 2026.01.01.'],
    [cs.erv >= cs.cim - 1, cs.ervAlja <= cs.kat, cs.szoveg])
  ok('a galéria alsó sorának képei a lap betöltésekor még nem töltődnek le (csak a közelbe görgetve)', 0,
    a.keresek.filter((u) => /^\/kepek\/galeria\/sub[45]/.test(u)).length)
  ok('nincs futásidejű hiba', [], a.hibak)
}

console.log('\n=== 2) Kiemelt szakaszok: sávok és címek ===\n')
{
  const p = a.p
  const st = await p.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s))
    const fenyesseg = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return (m[0] * 299 + m[1] * 587 + m[2] * 114) / 1000 }
    return {
      rolunkHatter: cs('.kv-rolunk').backgroundImage.startsWith('linear-gradient'),
      rolunkSzoveg: fenyesseg(cs('.kv-rolunk h2').color) > 200,
      labHatter: cs('.kv-lab').backgroundImage.startsWith('linear-gradient'),
      labSzoveg: fenyesseg(cs('.kv-lab .kv-logo').color) > 200,
      csomagSav: cs('.kv-ketoszlop').backgroundColor !== cs('.kv').backgroundColor,
      cimek: ['.kv-rolunk h2', '.kv-galeria h2', '.kv-csomagok h2', '.kv-foglalas h2', '.kv-hely h2'].map((s) => parseFloat(cs(s).fontSize) >= 30),
    }
  })
  ok('Rólunk és lábléc: sötétzöld sáv, világos szöveg; a csomagok és a foglalás külön tónusú sávon; minden szakaszcím legalább 30 px',
    { rolunkHatter: true, rolunkSzoveg: true, labHatter: true, labSzoveg: true, csomagSav: true, cimek: [true, true, true, true, true] }, st)
  await gorget(p, 0)
  await kep(p, '01-asztali-teteje.png')
}

console.log('\n=== 3) Görgetésre megcsillan a fény a sötétzöldön ===\n')
{
  const p = a.p
  const top = await p.locator('.kv-rolunk').evaluate((e) => e.getBoundingClientRect().top + scrollY)
  const minta = []
  for (const y of [top - 850, top - 500, top - 150, top + 200]) {
    await gorget(p, y)
    minta.push(await p.locator('.kv-rolunk').evaluate((e) => ({
      feny: Number(e.style.getPropertyValue('--feny')),
      kozep: Number(e.style.getPropertyValue('--feny-kozep')),
      csik: getComputedStyle(e, '::after').transform,
    })))
    if (y === top - 150) await kep(p, '02-rolunk-csillanas.png')
  }
  ok('lefelé görgetve a fénycsík végigfut a sávon (a helyzete folyamatosan nő)', true, minta.every((m, i) => i === 0 || m.feny > minta[i - 1].feny))
  ok('a csík valóban mozog (más az eltolása)', true, new Set(minta.map((m) => m.csik)).size === 4)
  ok('középen a legvilágosabb, a szélein halványabb', true, Math.max(...minta.map((m) => m.kozep)) > 0.8 && minta[0].kozep < 0.5)
  await gorget(p, 99999)
  ok('a lábléc is csillan', true, Number(await p.locator('.kv-lab').evaluate((e) => e.style.getPropertyValue('--feny'))) > 0)
  await kep(p, '03-lablec.png')
}

console.log('\n=== 4) Galéria: lemosás egérrel, szivacsméret ===\n')
{
  const p = a.p
  await galeriahoz(p)
  ok('2×2-es rács, a koszos kép van felül', [4, 2, [255, 255, 255]],
    [await p.locator('.kv-moso').count(), await p.locator('.kv-galeria-racs').evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length),
     await alfa(p, 0, [[0.2, 0.2], [0.5, 0.5], [0.8, 0.8]])])
  ok('alul a tiszta (b), felül a koszos (a) kép', ['/kepek/galeria/sub2b.jpg', '/kepek/galeria/sub2a.jpg'],
    [await p.locator('.kv-moso-tiszta').first().evaluate((e) => new URL(e.src).pathname), await p.locator('.kv-moso-koszos').first().evaluate((e) => new URL(e.src).pathname)])
  ok('vezérlők: csúszka, szivacs, Reset', ['Szivacs mérete', true, 'Újra koszos'],
    [await p.locator('.kv-csuszka').getAttribute('aria-label'), await p.locator('.kv-szivacs img').isVisible(), await p.locator('.kv-reset').getAttribute('aria-label')])

  const r = await p.locator('.kv-moso').first().boundingBox()
  await p.mouse.move(r.x - 20, r.y + r.height * 0.5)
  await p.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5, { steps: 20 })
  ok('egérrel áthúzva (gombnyomás nélkül) a felső kép átlátszóvá válik ott, ahol a szivacs járt', [0, 255, 255],
    await alfa(p, 0, [[0.3, 0.5], [0.3, 0.1], [0.8, 0.5]]))
  ok('a szivacs mozog mosás közben', true, (await p.locator('.kv-szivacs img').getAttribute('src')).endsWith('szivacs.gif'))
  ok('a szivacs körvonala követi az egeret', '1', await p.locator('.kv-moso-gyuru').first().evaluate((e) => e.style.opacity))
  await kep(p, '04-galeria-lemosas.png')
  await p.mouse.move(r.x + r.width + 40, r.y - 40)
  await p.waitForTimeout(900)
  ok('megállva a szivacs is megáll', true, (await p.locator('.kv-szivacs img').getAttribute('src')).endsWith('szivacs.png'))
  const kicsi = await atlatszoSor(p, 0, 0.5)

  await p.locator('.kv-csuszka').fill('40')
  const r1 = await p.locator('.kv-moso').nth(1).boundingBox()
  await p.mouse.move(r1.x - 20, r1.y + r1.height * 0.5)
  await p.mouse.move(r1.x + r1.width * 0.5, r1.y + r1.height * 0.5, { steps: 20 })
  await p.mouse.move(r1.x + r1.width * 0.5, r1.y - 40)
  const sav = async (i) => p.locator('.kv-moso canvas').nth(i).evaluate((c) => {
    const d = c.getContext('2d').getImageData(Math.round(c.width * 0.25), 0, 1, c.height).data
    let n = 0
    for (let k = 3; k < d.length; k += 4) if (d[k] < 40) n++
    return n / c.height
  })
  const vekony = await sav(0)
  const vastag = await sav(1)
  ok('nagyobb szivacs szélesebb csíkot mos le (kb. 16% → 40% szélességű szivacs)', [true, true, true], [kicsi > 0.3, vastag > vekony * 1.8, vastag > 0.5])
  ok('a szivacs ikonja a mérettel együtt nő', true, await p.locator('.kv-szivacs img').evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).a > 1.1))
  await p.locator('.kv-csuszka').fill('16')
}

console.log('\n=== 5) Reset: alulról felfelé, 2 mp alatt lesz újra koszos ===\n')
{
  const p = a.p
  await lemos(p, 2)
  ok('a harmadik kép teljesen lemosva', [0, 0, 0], await alfa(p, 2, [[0.5, 0.08], [0.5, 0.5], [0.5, 0.92]]))
  await p.locator('.kv-reset').click()
  const t0 = Date.now()
  await p.waitForTimeout(150)
  ok('a Reset ikon mozog', true, (await p.locator('.kv-reset img').getAttribute('src')).endsWith('reset.gif'))
  await p.waitForTimeout(Math.max(0, 1000 - (Date.now() - t0)))
  const fel = await alfa(p, 2, [[0.5, 0.06], [0.5, 0.94]])
  await kepElem(p.locator('.kv-moso').nth(2), '05-reset-felidoben.png')
  ok('1 mp-nél: alul már koszos, felül még tiszta', [true, true], [fel[1] === 255, fel[0] < 60])
  await p.waitForTimeout(Math.max(0, 2350 - (Date.now() - t0)))
  ok('2 mp után mind a négy kép újra teljesen koszos', [[255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255]],
    [await alfa(p, 0, [[0.3, 0.5], [0.1, 0.1], [0.9, 0.9]]), await alfa(p, 1, [[0.25, 0.5], [0.1, 0.1], [0.9, 0.9]]),
     await alfa(p, 2, [[0.5, 0.06], [0.5, 0.5], [0.5, 0.94]]), await alfa(p, 3, [[0.5, 0.5], [0.1, 0.1], [0.9, 0.9]])])
  await p.waitForTimeout(300)
  ok('a Reset ikon megáll', true, (await p.locator('.kv-reset img').getAttribute('src')).endsWith('reset.png'))
  ok('nincs futásidejű hiba', [], a.hibak)
  await kepElem(p.locator('.kv-galeria'), '06-galeria.png')
}

console.log('\n=== 6) Angolul ===\n')
{
  const p = a.p
  await gorget(p, 0)
  await p.locator('.kv-nyelv-sor .nyelv-kapcsolo').click()
  await p.waitForTimeout(600)
  ok('Rólunk, Galéria, alcím és gombnevek angolul', ['About us', true, 'Gallery', 'Our prices are valid from 1 January 2026.', 'Sponge size', 'Make it dirty again'],
    [sima(await p.locator('.kv-rolunk h2').textContent()), sima(await p.locator('.kv-rolunk-elso').textContent()).startsWith('Visit our car wash in Budapest’s District XIII'),
     sima(await p.locator('.kv-galeria h2').textContent()), sima(await p.locator('.kv-ervenyes').textContent()),
     await p.locator('.kv-csuszka').getAttribute('aria-label'), await p.locator('.kv-reset').getAttribute('aria-label')])
  await a.ctx.close()
}

console.log('\n=== 7) Telefonon: ujjal vízszintesen mos, függőlegesen görget ===\n')
{
  const t = await oldal('/publikus', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const p = t.p
  await galeriahoz(p)
  ok('telefonon is 2×2, nincs vízszintes görgetés', [2, true],
    [await p.locator('.kv-galeria-racs').evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length), await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)])
  ok('a képen függőlegesen görgetni lehet (touch-action: pan-y)', 'pan-y', await p.locator('.kv-moso canvas').first().evaluate((e) => getComputedStyle(e).touchAction))
  const r = await p.locator('.kv-moso').first().boundingBox()
  const cdp = await t.ctx.newCDPSession(p)
  const y = r.y + r.height * 0.5
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + 6, y }] })
  for (let k = 1; k <= 12; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x + 6 + (r.width - 12) * (k / 12), y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await p.waitForTimeout(300)
  ok('ujjal vízszintesen húzva lemossa', [0, 0, 255], await alfa(p, 0, [[0.2, 0.5], [0.8, 0.5], [0.5, 0.1]]))
  await kep(p, '07-telefon-galeria.png')
  await gorget(p, 0)
  await kep(p, '08-telefon-teteje.png')
  ok('nincs futásidejű hiba', [], t.hibak)
  await t.ctx.close()
}

console.log('\n=== 8) Csökkentett mozgás ===\n')
{
  const c = await oldal('/publikus', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const p = c.p
  const top = await p.locator('.kv-rolunk').evaluate((e) => e.getBoundingClientRect().top + scrollY)
  await gorget(p, top - 300)
  ok('a fénycsík nem fut, a sáv egyenletes', ['none', 0.5], [await p.locator('.kv-rolunk').evaluate((e) => getComputedStyle(e, '::after').display), Number(await p.locator('.kv-rolunk').evaluate((e) => e.style.getPropertyValue('--feny')))])
  await galeriahoz(p)
  await lemos(p, 0, 6)
  await p.locator('.kv-reset').click()
  await p.waitForTimeout(200)
  ok('a Reset egyből visszakoszolja', [255, 255], await alfa(p, 0, [[0.5, 0.1], [0.5, 0.9]]))
  await c.ctx.close()
}

console.log('\n=== 9) Admin: Rólunk és Galéria sáv, az alcím a Csomagoknál; mentés a publikus oldalra ===\n')
{
  const db = await adatbazis({ demo: true })
  const rpc = async (fn, body, uid) => {
    await db.query(`select set_config('app.uid', $1, false)`, [uid])
    const kulcsok = Object.keys(body ?? {})
    const args = kulcsok.map((k, i) => `${k} => $${i + 1}`).join(', ')
    const ertekek = kulcsok.map((k) => (body[k] !== null && typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]))
    return (await db.query(`select ${fn}(${args}) as x`, ertekek)).rows[0].x
  }
  const TABLAK = ['packages', 'package_pricing', 'full_service_pricing', 'extras', 'surcharges', 'v_package_matrix', 'v_package_extra']
  const json = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  async function kornyezet(viewport) {
    const ctx = await b.newContext({ viewport })
    await ctx.route('https://teszt.supabase.co/**', async (r) => {
      const ut = new URL(r.request().url()).pathname
      const belepve = (r.request().headers().authorization ?? '') === 'Bearer t'
      const user = { id: TULAJ, email: 'x@mosathat.hu', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
      if (ut.startsWith('/auth/v1/token')) {
        return json(r, { access_token: 't', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user })
      }
      if (ut.startsWith('/auth/v1/user')) return json(r, user)
      if (ut.startsWith('/auth/')) return json(r, {})
      if (ut === '/rest/v1/staff') return json(r, { id: TULAJ, full_name: 'Teszt', role: 'TULAJDONOS', active: true })
      const tabla = /^\/rest\/v1\/([a-z_]+)$/.exec(ut)?.[1]
      if (tabla && TABLAK.includes(tabla)) return json(r, (await db.query(`select * from ${tabla}`)).rows)
      const fn = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(ut)?.[1]
      if (fn && (fn.startsWith('publikus_') || fn.startsWith('csomag_szerkeszto') || fn === 'dashboard_summary')) {
        try {
          const body = r.request().postData() ? JSON.parse(r.request().postData()) : {}
          return json(r, await rpc(fn, body, belepve ? TULAJ : ''))
        } catch (e) {
          return json(r, { code: 'P0001', message: e.message, details: null, hint: null }, 400)
        }
      }
      if (fn === 'can_edit_customers') return json(r, true)
      return json(r, [])
    })
    const p = await ctx.newPage()
    const hibak = []
    p.on('pageerror', (e) => hibak.push((e.stack ?? e.message).slice(0, 300)))
    return { ctx, p, hibak }
  }
  const ad = await kornyezet({ width: 1500, height: 1000 })
  const q = ad.p
  await q.goto(SB + '/')
  await q.waitForSelector('input[type="email"]', { timeout: 60000 })
  await q.fill('input[type="email"]', 'x@mosathat.hu'); await q.fill('input[type="password"]', 'x')
  await q.getByRole('button', { name: /Belépés/ }).click()
  const menu = (n) => q.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${n}$`) })
  await menu('Tartalom').waitFor({ timeout: 30000 })
  await menu('Tartalom').click()
  await q.locator('.pub-sav[data-sav="rolunk"]').waitFor({ timeout: 20000 })
  ok('a Nyitó rész után jön a Rólunk és a Galéria sáv, utána a Csomagok', ['hero', 'rolunk', 'galeria', 'csomagok'],
    (await q.locator('.pub-sav').evaluateAll((l) => l.map((e) => e.dataset.sav))).slice(1, 5))
  const rol = q.locator('.pub-sav[data-sav="rolunk"]')
  ok('Rólunk sáv: 3 mező és élő előnézet', [3, 'Rólunk'], [await rol.locator('.pub-szoveg').count(), sima(await rol.locator('.kv-rolunk h2').textContent())])
  await rol.locator('.pub-szoveg[data-kulcs="rolunk.cim"] input').fill('Rólunk röviden')
  await q.waitForTimeout(400)
  ok('az előnézet azonnal frissül', 'Rólunk röviden', sima(await rol.locator('.kv-rolunk h2').textContent()))
  const gal = q.locator('.pub-sav[data-sav="galeria"]')
  ok('Galéria sáv: 5 mező és kipróbálható előnézet', [5, 4], [await gal.locator('.pub-szoveg').count(), await gal.locator('.kv-moso').count()])
  const cs = q.locator('.pub-sav[data-sav="csomagok"]')
  await cs.locator('.pub-szoveg[data-kulcs="csomagok.ervenyes"] input').fill('Áraink ettől érvényesek: 2026.03.01.')
  await q.waitForTimeout(300)
  ok('a Csomagok sávban az új alcím, az előnézetben is', 'Áraink ettől érvényesek: 2026.03.01.', sima(await cs.locator('.kv-ervenyes').textContent()))
  await rol.locator('h3 .nyelv-kapcsolo').click()
  await q.waitForTimeout(400)
  await rol.locator('.pub-szoveg[data-kulcs="rolunk.cim"] input').fill('About Mosathat')
  await q.waitForTimeout(300)
  await rol.locator('h3').evaluate((h) => { const t = document.querySelector('.tartalom'); t.scrollTo(0, t.scrollTop + h.getBoundingClientRect().top - 150) })
  await kep(q, '09-admin-rolunk-en.png')
  await q.locator('.pub-fej').getByRole('button', { name: 'Mentés' }).click()
  await q.locator('.pub-mentve, .pub-hiba').first().waitFor({ timeout: 10000 })
  ok('mentve', true, /Mentve/.test(sima(await q.locator('.pub-mentve, .pub-hiba').first().textContent())))

  const pub = await kornyezet({ width: 1440, height: 900 })
  await pub.p.goto(SB + '/publikus')
  await pub.p.locator('.kv-rolunk h2').waitFor({ timeout: 60000 })
  ok('a publikus oldalon is az új szövegek', ['Rólunk röviden', 'Áraink ettől érvényesek: 2026.03.01.'],
    [sima(await pub.p.locator('.kv-rolunk h2').textContent()), sima(await pub.p.locator('.kv-ervenyes').textContent())])
  await pub.p.locator('.kv-nyelv-sor .nyelv-kapcsolo').click()
  await pub.p.waitForTimeout(500)
  ok('angolul is', 'About Mosathat', sima(await pub.p.locator('.kv-rolunk h2').textContent()))
  ok('nincs futásidejű hiba', [], [...ad.hibak, ...pub.hibak])
  await Promise.all([ad.ctx.close(), pub.ctx.close()])
}

await b.close()
console.log(`\n${baj === 0 ? 'MINDEN RENDBEN' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
