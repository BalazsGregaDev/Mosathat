import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

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
const sima = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kep = async (p, nev, opts = {}) => { if (KEPEK) { await p.waitForTimeout(300); await p.screenshot({ path: join(KEPEK, nev), ...opts }) } }
const ASZTALI = { viewport: { width: 1440, height: 900 } }
const TELEFON = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const UJ_LEIRAS = 'A képeken egy régen mosott autót láthatsz, nézd meg mire képes a csapatunk! Használd a szivacsot és mentsd meg a kosztól a Subarut. A következő lehet a te autód is!'

async function oldal(opts = ASZTALI, elotte, ut = '/publikus') {
  const ctx = await b.newContext(opts)
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  if (elotte) await elotte(p)
  await p.goto(DEMO + ut)
  await p.locator('.kv-lab').waitFor({ timeout: 60000 })
  return { ctx, p, hibak }
}
const keszre = async (p) => {
  await p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
}
const galeriahoz = async (p, db = 4, fent = 70) => {
  await p.locator('.kv-galeria').evaluate((e, f) => scrollTo(0, e.getBoundingClientRect().top + scrollY - f), fent)
  await p.waitForFunction((n) => document.querySelectorAll('.kv-moso[data-kesz]').length >= n, db, { timeout: 30000 })
  await p.waitForTimeout(400)
}
const vaszon = (p, sel) => p.locator(sel).first().locator('canvas')
const alfa = (p, sel, pontok) => vaszon(p, sel).evaluate((c, pp) => {
  const ctx = c.getContext('2d')
  return pp.map(([x, y]) => ctx.getImageData(Math.round(x * (c.width - 1)), Math.round(y * (c.height - 1)), 1, 1).data[3])
}, pontok)
const doboz = (p, sel) => p.locator(sel).first().evaluate((e) => {
  const r = e.getBoundingClientRect()
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), jobb: Math.round(r.right), alja: Math.round(r.bottom) }
})

console.log('=== 1) Rólunk: a menüpont nem görgeti el a sáv belsejét, a borítókép helye a betöltés előtt is végleges ===\n')
const takaras = (p) => p.evaluate(() => {
  const sav = document.querySelector('.kv-rolunk')
  const pontok = ['.kv-rolunk h2', '.kv-rolunk-elso'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + 24, r.top + 14] })
  return { belsoGorgetes: sav.scrollTop, latszik: pontok.map(([x, y]) => sav.contains(document.elementFromPoint(x, y))) }
})
for (const [nev, opts] of [['asztali', ASZTALI], ['telefon', TELEFON]]) {
  const t = await oldal(opts)
  const p = t.p
  await keszre(p)
  await p.waitForTimeout(500)
  if (nev === 'telefon') {
    await p.locator('.kv-menu-gomb').tap(); await p.waitForTimeout(400)
    await p.locator('.kv-menu-panel nav a').filter({ hasText: 'Rólunk' }).tap()
  } else await p.locator('.kv-nav nav a').filter({ hasText: 'Rólunk' }).click()
  await p.waitForTimeout(1500)
  ok(`${nev}: a Rólunk menüpont után a cím és az első bekezdés nincs a borítókép alatt (eddig csak az utolsó sora látszott)`, { belsoGorgetes: 0, latszik: [true, true] }, await takaras(p))
  await kep(p, `01-rolunk-menu-${nev}.png`)
  await p.locator('.kv-rolunk').evaluate((e) => { e.scrollTop = 200 })
  ok(`${nev}: a sötétzöld sáv belseje akkor sem görgethető el, ha valami megpróbálja`, 0, await p.locator('.kv-rolunk').evaluate((e) => e.scrollTop))
  await t.ctx.close()
}
{
  const t = await oldal(ASZTALI, null, '/publikus#rolunk')
  await keszre(t.p)
  await t.p.waitForTimeout(800)
  ok('#rolunk linkkel érkezve (pl. a jogi oldalról) is teljesen látszik', { belsoGorgetes: 0, latszik: [true, true] }, await takaras(t.p))
  await t.ctx.close()
}

{
  let enged
  const kepVar = new Promise((k) => { enged = k })
  const t = await oldal(ASZTALI, (p) => p.route('**/kepek/borito.jpg', async (r) => { await kepVar; await r.continue() }))
  const p = t.p
  await p.locator('.kv-rolunk h2').waitFor({ timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(300)
  const elotte = await p.evaluate(() => ({ kep: document.querySelector('.kv-foto').dataset.kep, foto: Math.round(document.querySelector('.kv-foto').getBoundingClientRect().height), h2: Math.round(document.querySelector('.kv-rolunk h2').getBoundingClientRect().top + scrollY) }))
  ok('a kép még töltődik, de a helye már a végleges magasságú (576 px), nem 170', ['tolt', 576], [elotte.kep, elotte.foto])
  ok('töltés közben nem látszik a „borítókép helye” felirat', 'none', await p.locator('.kv-foto span').evaluate((e) => getComputedStyle(e).display))
  await p.locator('.kv-nav nav a').filter({ hasText: 'Rólunk' }).click()
  await p.waitForTimeout(1200)
  enged()
  await p.waitForFunction(() => document.querySelector('.kv-foto').dataset.kep === 'van', null, { timeout: 20000 })
  await p.waitForTimeout(800)
  const utana = await p.evaluate(() => {
    const nav = document.querySelector('.kv-nav').getBoundingClientRect().bottom
    const h2 = document.querySelector('.kv-rolunk h2').getBoundingClientRect()
    const p1 = document.querySelector('.kv-rolunk-elso').getBoundingClientRect()
    return { h2Abs: Math.round(h2.top + scrollY), h2Lathato: h2.top >= nav && h2.top < nav + 90, p1Lathato: p1.top >= nav && p1.bottom <= innerHeight }
  })
  ok('a kép betöltése után a Rólunk ugyanott van (nem csúszik lejjebb)', elotte.h2, utana.h2Abs)
  ok('a kép betöltése előtti kattintás után is a cím és az első bekezdés egésze látszik', [true, true], [utana.h2Lathato, utana.p1Lathato])
  await p.reload()
  await p.locator('.kv-rolunk h2').waitFor({ timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
  ok('újratöltéskor a kép előtt és után is ugyanott a Rólunk', elotte.h2, await p.locator('.kv-rolunk h2').evaluate((e) => Math.round(e.getBoundingClientRect().top + scrollY)))
  ok('nincs futásidejű hiba', [], t.hibak)
  await t.ctx.close()
}

console.log('\n=== 2) Asztali gép: új leírás, Időpontfoglalás gomb, ötödik kép balra ===\n')
const a = await oldal()
{
  const p = a.p
  await keszre(p)
  await galeriahoz(p, 5)
  ok('az új leírás', UJ_LEIRAS, sima(await p.locator('.kv-galeria .kv-bevezeto').textContent()))
  const lei = await doboz(p, '.kv-galeria .kv-bevezeto')
  const gomb = await doboz(p, '.kv-galeria .kv-gomb-lakk')
  const eszk = await doboz(p, '.kv-galeria-eszkozok')
  ok('a leírás alatt az Időpontfoglalás gomb, utána a vezérlők', ['Időpontfoglalás', true, true, true],
    [sima(await p.locator('.kv-galeria .kv-gomb-lakk').textContent()), gomb.y > lei.alja, gomb.x === lei.x, eszk.y > gomb.alja])
  const hatter = await p.locator('.kv-galeria .kv-gomb-lakk').evaluate((e) => ({ kep: getComputedStyle(e).backgroundImage, szin: getComputedStyle(e).color }))
  const labHatter = await p.locator('.kv-lab').evaluate((e) => getComputedStyle(e).backgroundImage)
  ok('a gomb háttere ugyanaz a sötétzöld, mint a láblécé, világos betűvel', [true, 'rgb(243, 241, 234)'], [['rgb(23, 64, 44)', 'rgb(11, 33, 22)'].every((c) => hatter.kep.includes(c) && labHatter.includes(c)), hatter.szin])
  const bal = await doboz(p, '.kv-galeria-bal .kv-moso')
  const racs = await doboz(p, '.kv-galeria-racs')
  ok('az ötödik kép bal oldalon, a vezérlők alatt, az oszlop teljes szélességében', [true, true, true],
    [bal.jobb < racs.x, bal.y > eszk.alja, Math.abs(bal.w - eszk.w) <= 1])
  ok('az alja egy vonalban a jobb oldali képek aljával (kitölti az üres helyet)', true, Math.abs(bal.alja - racs.alja) <= 2)
  ok('az ötödik kép a sub1 pár: alul a tiszta, felül a koszos', ['/kepek/galeria/sub1b.jpg', '/kepek/galeria/sub1a.jpg'],
    [await p.locator('.kv-galeria-bal .kv-moso-tiszta').evaluate((e) => new URL(e.src).pathname), await p.locator('.kv-galeria-bal .kv-moso-koszos').evaluate((e) => new URL(e.src).pathname)])
  ok('asztali gépen a szivacs nem gomb, és nincs X', [0, 1, 0], [await p.locator('.kv-szivacs-gomb').count(), await p.locator('span.kv-szivacs').count(), await p.locator('.kv-x').count()])
  await kep(p, '02-galeria-asztali.png')

  await p.mouse.move(bal.x - 10, bal.y + bal.h * 0.5)
  await p.mouse.move(bal.x + bal.w * 0.9, bal.y + bal.h * 0.5, { steps: 24 })
  await p.mouse.move(bal.x + bal.w * 0.5, bal.y - 60)
  ok('az ötödik kép is lemosható egérrel', [0, 0, 255], await alfa(p, '.kv-galeria-bal', [[0.3, 0.5], [0.7, 0.5], [0.5, 0.04]]))
  const r0 = await doboz(p, '.kv-galeria-racs .kv-moso')
  const vonal = async (sel) => vaszon(p, sel).evaluate((c) => {
    const d = c.getContext('2d').getImageData(Math.round(c.width * 0.5), 0, 1, c.height).data
    let n = 0
    for (let k = 3; k < d.length; k += 4) if (d[k] < 40) n++
    const r = c.getBoundingClientRect()
    return (n / c.height) * (c.height * Math.max(r.width / c.width, r.height / c.height))
  })
  await p.mouse.move(r0.x - 10, r0.y + r0.h * 0.5)
  await p.mouse.move(r0.x + r0.w * 0.9, r0.y + r0.h * 0.5, { steps: 24 })
  await p.mouse.move(r0.x + r0.w * 0.5, r0.y - 60)
  const csikBal = await vonal('.kv-galeria-bal')
  const csikJobb = await vonal('.kv-galeria-racs .kv-moso')
  ok('a szivacs a bal képen is ugyanakkora (a lemosott csík képernyőn mért vastagsága)', true, Math.abs(csikBal - csikJobb) <= 6)
  await kep(p, '03-galeria-lemosva.png')
  await p.locator('.kv-reset').click()
  await p.waitForTimeout(2500)
  ok('a Reset az ötödik képet is visszakoszolja', [255, 255], await alfa(p, '.kv-galeria-bal', [[0.3, 0.5], [0.7, 0.5]]))

  const g = await doboz(p, '.kv-galeria .kv-gomb-lakk')
  ok('egér nélkül nincs fénycsík a gombon', '0', await p.locator('.kv-galeria .kv-gomb-lakk').evaluate((e) => getComputedStyle(e, '::after').opacity))
  const csik = async (x) => {
    await p.mouse.move(g.x + g.w * x, g.y + g.h * 0.5, { steps: 4 })
    await p.waitForTimeout(450)
    return p.locator('.kv-galeria .kv-gomb-lakk').evaluate((e) => ({ x: Math.round(parseFloat(e.style.getPropertyValue('--eger-x'))), lathato: getComputedStyle(e, '::after').opacity === '1', ferde: Math.abs(new DOMMatrix(getComputedStyle(e, '::after').transform).c) > 0.2 }))
  }
  const c1 = await csik(0.2)
  await kep(p, '04-gomb-feny-bal.png', { clip: { x: g.x - 20, y: g.y - 20, width: g.w + 40, height: g.h + 40 } })
  const c2 = await csik(0.8)
  await kep(p, '05-gomb-feny-jobb.png', { clip: { x: g.x - 20, y: g.y - 20, width: g.w + 40, height: g.h + 40 } })
  ok('a gombon is a kurzorral mozgó, enyhén dőlt fénycsík', [true, true, true, true],
    [c1.lathato && c2.lathato, c1.ferde, Math.abs(c1.x - Math.round(g.w * 0.2)) <= 2, Math.abs(c2.x - Math.round(g.w * 0.8)) <= 2])
  await p.locator('.kv-galeria .kv-gomb-lakk').click()
  await p.waitForTimeout(1300)
  ok('a gomb a Foglaláshoz görget, a címe felvillan', [true, true], await p.locator('.kv-foglalas h2').first().evaluate((e) => {
    const r = e.getBoundingClientRect()
    return [r.top > 0 && r.top < innerHeight / 2, e.hasAttribute('data-felvillan')]
  }))
  ok('nincs futásidejű hiba', [], a.hibak)
}

console.log('\n=== 3) Angolul ===\n')
{
  const p = a.p
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300)
  await p.locator('.kv-nyelv-sor .nyelv-kapcsolo').click()
  await p.waitForTimeout(600)
  ok('angol leírás és gomb', [true, 'Book an appointment'],
    [sima(await p.locator('.kv-galeria .kv-bevezeto').textContent()).startsWith('These photos show a car'), sima(await p.locator('.kv-galeria .kv-gomb-lakk').textContent())])
  await a.ctx.close()
}

console.log('\n=== 4) Az ötödik kép csak két hasábos elrendezésben ===\n')
for (const [nev, opts, lathato] of [['1024 px', { viewport: { width: 1024, height: 768 } }, true], ['900 px (egy hasáb)', { viewport: { width: 900, height: 1000 } }, false], ['telefon', TELEFON, false]]) {
  const t = await oldal(opts)
  await keszre(t.p)
  await galeriahoz(t.p)
  const m = await t.p.evaluate(() => {
    const bal = document.querySelector('.kv-galeria-bal')
    const racs = document.querySelector('.kv-galeria-racs').getBoundingClientRect()
    const fej = document.querySelector('.kv-galeria h2').getBoundingClientRect()
    return { lathato: getComputedStyle(bal).display !== 'none', ketHasab: racs.left > fej.right, kepTolt: !!bal.querySelector('img') }
  })
  ok(`${nev}: ${lathato ? 'két hasáb, látszik' : 'egy hasáb, nem látszik és be sem töltődik'}`, { lathato, ketHasab: lathato, kepTolt: lathato }, m)
  await t.ctx.close()
}

console.log('\n=== 5) Érintőképernyő: szivacs gomb, X gomb, görgetés tiltása ===\n')
{
  const t = await oldal(TELEFON)
  const p = t.p
  await keszre(p)
  await galeriahoz(p, 4, -150)
  const cdp = await t.ctx.newCDPSession(p)
  const huz = async (x0, y0, x1, y1, n = 12) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] })
    for (let k = 1; k <= n; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * k) / n, y: y0 + ((y1 - y0) * k) / n }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await p.waitForTimeout(600)
  }
  const y = () => p.evaluate(() => Math.round(scrollY))
  const elso = '.kv-galeria-racs .kv-moso'
  const sor = async () => {
    const r = await doboz(p, '.kv-galeria-racs .kv-moso')
    await huz(r.x + 6, r.y + r.h * 0.5, r.x + r.w - 6, r.y + r.h * 0.5)
    return alfa(p, elso, [[0.25, 0.5], [0.75, 0.5]])
  }
  const vissza = async () => { await p.locator('.kv-galeria').evaluate((e) => scrollTo(0, e.getBoundingClientRect().top + scrollY + 150)); await p.waitForTimeout(400) }

  ok('a vezérlők sorrendje: csúszka, szivacs gomb, Reset, X', ['kv-csuszka', 'kv-szivacs-gomb', 'kv-reset', 'kv-x'],
    await p.locator('.kv-galeria-eszkozok > *').evaluateAll((l) => l.map((e) => ['kv-csuszka', 'kv-szivacs-gomb', 'kv-reset', 'kv-x'].find((c) => e.classList.contains(c)))))
  ok('a négy vezérlő elfér egy sorban, nincs vízszintes görgetés', [1, true],
    [await p.locator('.kv-galeria-eszkozok > *').evaluateAll((l) => new Set(l.map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2))).size),
     await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)])
  ok('alapból a szivacs nincs benyomva, a képen görgetni lehet', ['false', 'auto'],
    [await p.locator('.kv-szivacs-gomb').getAttribute('aria-pressed'), await vaszon(p, elso).evaluate((e) => getComputedStyle(e).touchAction)])
  ok('benyomás nélkül az ujj nem mos', [255, 255], await sor())
  const y0 = await y()
  await huz(200, 700, 200, 380)
  ok('benyomás nélkül az oldal görgethető', true, (await y()) > y0 + 100)

  await vissza()
  const keret = await p.locator('.kv-szivacs-gomb').evaluate((e) => getComputedStyle(e).boxShadow)
  await p.locator('.kv-szivacs-gomb').tap()
  await p.waitForTimeout(300)
  const keretBe = await p.locator('.kv-szivacs-gomb').evaluate((e) => getComputedStyle(e).boxShadow)
  ok('benyomva: aria-pressed, a mostani keret körül egy plusz zöld keret', ['true', true, true, true],
    [await p.locator('.kv-szivacs-gomb').getAttribute('aria-pressed'), keretBe.startsWith(keret.match(/^rgba?\([^)]*\)[^,]*/)[0]), keretBe.includes('rgb(31, 77, 53) 0px 0px 0px 7px'), !keret.includes('rgb(31, 77, 53)')])
  await kep(p, '06-telefon-szivacs-be.png')
  ok('benyomva az ujj lemossa a koszt', [0, 0], await sor())
  const y1 = await y()
  await huz(200, 760, 200, 380)
  const lei = await doboz(p, '.kv-galeria .kv-bevezeto')
  await huz(200, Math.max(lei.y + 10, 60), 200, Math.max(lei.y + 10, 60) - 40)
  await huz(150, 300, 150, 700)
  ok('benyomva a görgetés le van tiltva (a képen és a képen kívül is)', y1, await y())
  await kep(p, '07-telefon-lemosva.png')
  const cs = await p.locator('.kv-csuszka').boundingBox()
  await huz(cs.x + cs.width * 0.15, cs.y + cs.height / 2, cs.x + cs.width * 0.9, cs.y + cs.height / 2, 8)
  ok('a csúszka benyomott szivaccsal is húzható', true, Number(await p.locator('.kv-csuszka').inputValue()) > 30)

  await p.locator('.kv-szivacs-gomb').tap()
  await p.waitForTimeout(300)
  ok('ismételt nyomásra kikapcsol: nincs zöld keret, a képen görgetni lehet', ['false', false, 'auto'],
    [await p.locator('.kv-szivacs-gomb').getAttribute('aria-pressed'), (await p.locator('.kv-szivacs-gomb').evaluate((e) => getComputedStyle(e).boxShadow)).includes('rgb(31, 77, 53)'),
     await vaszon(p, elso).evaluate((e) => getComputedStyle(e).touchAction)])
  const y2 = await y()
  await huz(200, 700, 200, 380)
  ok('kikapcsolva újra görgethető', true, (await y()) > y2 + 100)

  await vissza()
  await p.locator('.kv-szivacs-gomb').tap()
  await p.waitForTimeout(200)
  ok('az X mozdulatlan, amíg nem nyomják meg', '/kepek/galeria/x.png', new URL(await p.locator('.kv-x img').evaluate((e) => e.src)).pathname)
  await p.locator('.kv-x').tap()
  await p.waitForTimeout(250)
  ok('az X ugyanazt csinálja, mint a második nyomás: mosás ki, görgetés be; az ikonja mozog', ['false', 'auto', '/kepek/galeria/x.gif'],
    [await p.locator('.kv-szivacs-gomb').getAttribute('aria-pressed'), await vaszon(p, elso).evaluate((e) => getComputedStyle(e).touchAction), new URL(await p.locator('.kv-x img').evaluate((e) => e.src)).pathname])
  await kep(p, '08-telefon-x.png')
  const y3 = await y()
  await huz(200, 700, 200, 380)
  ok('X után görgethető', true, (await y()) > y3 + 100)
  await p.locator('.kv-x').tap()
  await p.waitForTimeout(200)
  ok('kikapcsolt állapotban is ugyanezt csinálja (kikapcsolva marad)', 'false', await p.locator('.kv-szivacs-gomb').getAttribute('aria-pressed'))
  await p.waitForTimeout(3100)
  ok('3 mp után az X ikon megáll', '/kepek/galeria/x.png', new URL(await p.locator('.kv-x img').evaluate((e) => e.src)).pathname)

  await vissza()
  await p.locator('.kv-szivacs-gomb').tap()
  await p.waitForTimeout(200)
  await p.locator('.kv-menu-gomb').tap(); await p.waitForTimeout(400)
  await p.locator('.kv-menu-panel nav a').filter({ hasText: 'Csomagok' }).tap()
  await p.waitForTimeout(1500)
  const y4 = await y()
  ok('ha a menüvel elnavigálnak, a szivacs kikapcsol, és a görgetés visszajön', 'false', await p.locator('.kv-szivacs-gomb').getAttribute('aria-pressed'))
  await huz(200, 700, 200, 380)
  ok('…és tényleg lehet görgetni', true, (await y()) > y4 + 100)
  ok('angol gombnevek', ['Sponge: wash with your finger', 'Stop washing and scroll again'], await (async () => {
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300)
    await p.locator('.kv-menu-gomb').tap(); await p.waitForTimeout(400)
    await p.locator('.kv-menu-panel .nyelv-kapcsolo').tap(); await p.waitForTimeout(600)
    return [await p.locator('.kv-szivacs-gomb').getAttribute('aria-label'), await p.locator('.kv-x').getAttribute('aria-label')]
  })())
  ok('nincs futásidejű hiba', [], t.hibak)
  await t.ctx.close()
}

console.log('\n=== 6) Admin: Galéria sáv ===\n')
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  await p.goto(DEMO + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  const menu = p.locator('aside.oldalsav .menu button').filter({ hasText: /^Tartalom$/ })
  await menu.waitFor({ timeout: 30000 })
  await menu.click()
  const gal = p.locator('.pub-sav[data-sav="galeria"]')
  await gal.waitFor({ timeout: 20000 })
  ok('Galéria sáv: 8 mező, köztük a gomb felirata és a két érintős gomb neve',
    ['galeria.cim', 'galeria.bevezeto', 'galeria.foglalas', 'galeria.meret', 'galeria.reset', 'galeria.szivacs', 'galeria.vege', 'galeria.kep_alt'],
    await gal.locator('.pub-szoveg').evaluateAll((l) => l.map((e) => e.dataset.kulcs)))
  await gal.locator('.pub-szoveg[data-kulcs="galeria.foglalas"] input').fill('Foglalj most')
  await p.waitForTimeout(400)
  ok('az előnézetben azonnal frissül a gomb, és látszik az ötödik kép is', ['Foglalj most', true],
    [sima(await gal.locator('.kv-galeria .kv-gomb-lakk').textContent()), await gal.locator('.kv-galeria-bal').evaluate((e) => getComputedStyle(e).display !== 'none')])
  await gal.locator('h3').evaluate((h) => { const t = document.querySelector('.tartalom'); t.scrollTo(0, t.scrollTop + h.getBoundingClientRect().top - 150) })
  await kep(p, '09-admin-galeria.png')
  ok('nincs futásidejű hiba', [], hibak)
  await ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'MINDEN RENDBEN' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
