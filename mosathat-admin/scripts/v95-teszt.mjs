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
const ASZTALI = { viewport: { width: 1440, height: 900 } }
const TELEFON = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const VILAGOS = 'rgb(250, 248, 243)'
const LAKK = 'rgb(11, 33, 22)'

async function oldal(opts, ut = '/publikus') {
  const ctx = await b.newContext(opts)
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  await p.goto(DEMO + ut)
  await p.locator('.kv-lab').waitFor({ timeout: 90000 })
  if (ut === '/publikus') await p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(400)
  return { ctx, p, hibak }
}
const vaszon = (p) => p.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
const gorget = async (p, y) => { await p.evaluate((yy) => scrollTo(0, yy), y); await p.waitForTimeout(250) }
const doboz = (p, sel) => p.locator(sel).first().evaluate((e) => {
  const r = e.getBoundingClientRect()
  return { y: r.top, alja: r.bottom, bal: r.left, jobb: r.right, h: r.height }
})

console.log('=== 1) A lábléc háttere „végtelen”: túlgörgetve alul is sötétzöld látszik ===\n')
for (const [nev, opts, ut] of [['asztali', ASZTALI, '/publikus'], ['telefon', TELEFON, '/publikus'], ['impresszum', ASZTALI, '/impresszum']]) {
  const t = await oldal(opts, ut)
  const fent = await vaszon(t.p)
  await gorget(t.p, 1e6)
  const lent = await vaszon(t.p)
  const labSzin = await t.p.locator('.kv-lab').evaluate((e) => getComputedStyle(e).backgroundImage)
  await gorget(t.p, 0)
  ok(`${nev}: a lap tetején a vászon a lap színe, alul a lábléc alsó színe`, [VILAGOS, LAKK, true, VILAGOS], [fent, lent, labSzin.includes('rgb(11, 33, 22)'), await vaszon(t.p)])
  if (nev === 'telefon') {
    await gorget(t.p, 1e6)
    await t.p.evaluate(() => { document.body.style.transform = 'translateY(-160px)' })
    await kep(t.p, '01-tulgorgetes-alul-telefon.png')
    ok('túlgörgetést utánozva (a lap 160 px-szel feljebb húzva) a lábléc alatt a vászon látszik, sötétzöld', [true, LAKK],
      [await t.p.evaluate(() => document.elementFromPoint(195, innerHeight - 40) === document.documentElement), await vaszon(t.p)])
    await t.p.evaluate(() => { document.body.style.transform = '' })
  }
  ok(`${nev}: nincs futásidejű hiba`, [], t.hibak)
  await t.ctx.close()
}
{
  const ctx = await b.newContext(ASZTALI)
  const p = await ctx.newPage()
  await p.goto(DEMO + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  ok('az admin vásznához nem nyúlunk', '', await p.evaluate(() => document.documentElement.style.backgroundColor))
  await ctx.close()
}

console.log('\n=== 2) Telefon, nyitó rész: Időpontfoglalás gomb a vonal alatt, középen; térközök +10% ===\n')
{
  const t = await oldal(TELEFON)
  const p = t.p
  await gorget(p, 0)
  const vonal = await doboz(p, '.kv-hasabok')
  const gomb = await doboz(p, '.kv-hero-foglalas .kv-gomb-lakk')
  const lede = await doboz(p, '.kv-lede')
  const halk = await doboz(p, '.kv-halk')
  const foto = await doboz(p, '.kv-foto')
  ok('a gomb a vonal alatt, a „Kézi mosás…” előtt, középre igazítva, ugyanaz a felirat', [true, true, true, 'Időpontfoglalás'],
    [gomb.y > vonal.y, gomb.alja < lede.y, Math.abs((gomb.bal + gomb.jobb) / 2 - 195) <= 1, sima(await p.locator('.kv-hero-foglalas .kv-gomb-lakk').textContent())])
  ok('ugyanolyan, mint a galériáé (háttér, betű)', true, await p.evaluate(() => {
    const [a, c] = [...document.querySelectorAll('.kv-gomb-lakk')].map((e) => getComputedStyle(e))
    return a.backgroundImage === c.backgroundImage && a.color === c.color && a.fontSize === c.fontSize
  }))
  ok('a két bekezdés közötti és a borítókép előtti térköz 10%-kal nagyobb (12 → 13,2 px, 26 → 28,6 px)', [13.2, 28.6],
    [Math.round((halk.y - lede.alja) * 10) / 10, Math.round((foto.y - halk.alja) * 10) / 10])
  await kep(p, '02-telefon-nyito.png')
  await p.locator('.kv-hero-foglalas .kv-gomb-lakk').tap()
  await p.waitForTimeout(1300)
  ok('a gomb a Foglaláshoz görget', true, await p.locator('.kv-foglalas h2').first().evaluate((e) => { const r = e.getBoundingClientRect(); return r.top > 0 && r.top < innerHeight / 2 }))
  const r = await oldal(ASZTALI)
  ok('asztali gépen a nyitó részben nincs gomb, a borítókép előtti térköz 34 → 37,4 px', [false, 37.4],
    [await r.p.locator('.kv-hero-foglalas').isVisible(), await r.p.evaluate(() => Math.round((document.querySelector('.kv-foto').getBoundingClientRect().top - document.querySelector('.kv-halk').getBoundingClientRect().bottom) * 10) / 10)])
  await r.ctx.close()

  console.log('\n=== 3) Rólunk: a térközök 10%-kal nagyobbak ===\n')
  await gorget(p, 0)
  const h2 = await doboz(p, '.kv-rolunk h2')
  const p1 = await doboz(p, '.kv-rolunk-elso')
  const p2 = await doboz(p, '.kv-rolunk-szoveg p + p')
  ok('cím → első bekezdés 22 px, első → második bekezdés 22 px (eddig 20)', [22, 22], [Math.round(p1.y - h2.alja), Math.round(p2.y - p1.alja)])
  await p.locator('.kv-rolunk').evaluate((e) => scrollTo(0, e.getBoundingClientRect().top + scrollY + 40))
  await kep(p, '03-telefon-rolunk.png')

  ok('nincs futásidejű hiba', [], t.hibak)
  await t.ctx.close()
}

async function sbOldal(opts, db) {
  const ctx = await b.newContext(opts)
  await ctx.route('https://teszt.supabase.co/**', async (r) => {
    const ut = new URL(r.request().url()).pathname
    const fn = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(ut)?.[1]
    if (fn && fn.startsWith('publikus_')) {
      const body = r.request().postData() ? JSON.parse(r.request().postData()) : {}
      const k = Object.keys(body)
      try {
        const x = (await db.query(`select ${fn}(${k.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as x`, k.map((n) => (body[n] !== null && typeof body[n] === 'object' ? JSON.stringify(body[n]) : body[n])))).rows[0].x
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
  await p.goto(SB + '/publikus')
  await p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 90000 })
  await p.waitForTimeout(400)
  return { ctx, p, hibak }
}

console.log('\n=== 4) Telefon, „Kérsz még valamit?”: csak név és ár, kiválasztva a teljes kártya ===\n')
{
  const db4 = await adatbazis({ demo: true })
  await db4.query(`update extras set description = 'Rövid leírás: ' || lower(name) || ', amit csak kiválasztva mutatunk.' where active`)
  const t = await sbOldal(TELEFON, db4)
  const p = t.p
  const m = p.locator('.kv-foglalas-elo .fogl')
  await m.locator('[data-lepes="extrak"]').count()
  await m.locator('.fogl-valaszto button').first().tap()
  await p.waitForTimeout(500)
  await m.locator('.fogl-csomag').nth(1).tap()
  await p.waitForTimeout(1500)
  const extrak = m.locator('.fogl-extra')
  const db = await extrak.count()
  const leirassal = await extrak.evaluateAll((l) => l.filter((e) => e.querySelector('.nev small')).length)
  ok('van extra, és mindnek van leírása', [true, true], [db > 3, leirassal === db])
  ok('kiválasztás nélkül egyik leírás sem látszik, csak név és ár', [0, db], [
    await extrak.evaluateAll((l) => l.filter((e) => { const s = e.querySelector('.nev small'); return s && getComputedStyle(s).display !== 'none' }).length),
    await extrak.evaluateAll((l) => l.filter((e) => getComputedStyle(e.querySelector('.ar')).display !== 'none').length)])
  const elso = extrak.nth(1)
  await elso.scrollIntoViewIfNeeded()
  await kepElem(m.locator('[data-lepes="extrak"]'), '04-telefon-extrak-zarva.png')
  const magas = (await elso.boundingBox()).height
  await elso.locator('.fogl-extra-fej').tap()
  await p.waitForTimeout(400)
  ok('kiválasztva látszik a leírás is (teljes kártya), a többi zárva marad', [true, true, 0],
    [await elso.locator('.nev small').isVisible(), (await elso.boundingBox()).height > magas,
     await extrak.evaluateAll((l) => l.filter((e) => !e.hasAttribute('data-be') && getComputedStyle(e.querySelector('.nev small')).display !== 'none').length)])
  await kepElem(m.locator('[data-lepes="extrak"]'), '05-telefon-extrak-kivalasztva.png')
  await elso.locator('.fogl-extra-fej').tap()
  await p.waitForTimeout(300)
  ok('kiválasztás visszavonva a leírás újra elrejtőzik', false, await elso.locator('.nev small').isVisible())
  const t2 = await sbOldal(ASZTALI, db4)
  await t2.p.locator('.kv-foglalas-elo .fogl .fogl-valaszto button').first().click()
  await t2.p.waitForTimeout(400)
  await t2.p.locator('.kv-foglalas-elo .fogl .fogl-csomag').nth(1).click()
  await t2.p.waitForTimeout(1500)
  ok('asztali gépen minden leírás látszik, mint eddig', true, await t2.p.locator('.fogl-extra .nev small').evaluateAll((l) => l.length > 3 && l.every((x) => getComputedStyle(x).display !== 'none')))
  await t2.ctx.close()
  ok('nincs futásidejű hiba', [], [...t.hibak, ...t2.hibak])
  await t.ctx.close()
}

console.log('\n=== 5) Admin, Csomagok: az extrák sorrendje állítható ===\n')
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } })
  const q = await ctx.newPage()
  const hibak = []
  q.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  await q.goto(DEMO + '/')
  await q.waitForSelector('input[type="email"]', { timeout: 60000 })
  await q.fill('input[type="email"]', 'tulaj@mosathat.hu'); await q.fill('input[type="password"]', 'x')
  await q.getByRole('button', { name: /Belépés/ }).click()
  const menu = (n) => q.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${n}$`) })
  await menu('Csomagok').waitFor({ timeout: 30000 })
  await menu('Csomagok').click()
  await q.locator('.szerk-tabla').waitFor({ timeout: 20000 })
  const panel = q.locator('.csomag-szerk .panel').nth(2)
  const nevek = () => panel.locator('.szerk-extra').evaluateAll((l) => l.map((e) => e.querySelector('input').value))
  const elotte = await nevek()
  ok('minden extrának sorszáma és Fel/Le gombja van; az első Fel és az utolsó Le tiltva', [true, true, true, true], [
    (await panel.locator('.szerk-extra-sorszam').allTextContents()).every((x, i) => x === `${i + 1}.`),
    (await panel.locator('.szerk-extra').count()) === (await panel.getByRole('button', { name: /feljebb$/ }).count()),
    await panel.getByRole('button', { name: /feljebb$/ }).first().isDisabled(),
    await panel.getByRole('button', { name: /lejjebb$/ }).last().isDisabled()])
  await panel.getByRole('button', { name: `${elotte[0]}: lejjebb` }).click()
  await panel.getByRole('button', { name: `${elotte[3]}: feljebb` }).click()
  const uj = [elotte[1], elotte[0], elotte[3], elotte[2], ...elotte.slice(4)]
  ok('a sorrend azonnal változik, és mentetlen változásként jelenik meg', [uj, 'Mentetlen változások'], [await nevek(), sima(await q.locator('.szerk-allapot').textContent())])
  await panel.locator('h3').evaluate((h) => { const t = document.querySelector('.tartalom'); t.scrollTo(0, t.scrollTop + h.getBoundingClientRect().top - 120) })
  await kep(q, '06-admin-extrak-sorrend.png')
  await q.locator('.szerk-lab').getByRole('button', { name: 'Mentés' }).click()
  await q.locator('.szerk-allapot').filter({ hasText: 'Mentve' }).waitFor({ timeout: 15000 })
  ok('mentés után betöltve is az új sorrend', uj, await nevek())
  await menu('Időpontfoglalás').click()
  const fm = q.locator('.fogl').first()
  await fm.waitFor({ timeout: 20000 })
  await fm.locator('.fogl-valaszto button').first().click()
  await q.waitForTimeout(400)
  await fm.locator('.fogl-csomag').first().click()
  await q.waitForTimeout(1200)
  const kinalt = (await fm.locator('.fogl-extra .nev').allInnerTexts()).map((x) => x.split('\n')[0].trim())
  ok('a foglalásban is ebben a sorrendben jönnek (a csomagban benne lévők kimaradnak)', uj.filter((n) => kinalt.includes(n)), kinalt)
  ok('nincs futásidejű hiba', [], hibak)
  await ctx.close()
}

console.log('\n=== 6) Adatbázis: a sorrend a nyilvános oldalra is kimegy ===\n')
{
  const db = await adatbazis({ demo: true })
  await db.query(`select set_config('app.uid', $1, false)`, [TULAJ])
  const adat = (await db.query(`select csomag_szerkeszto() as x`)).rows[0].x
  const forditott = { ...adat, extrak: [...adat.extrak].reverse() }
  await db.query(`select csomag_szerkeszto_mentes($1::jsonb)`, [JSON.stringify(forditott)])
  await db.query(`select set_config('app.uid', '', false)`)
  const pub = (await db.query(`select publikus_oldal() as x`)).rows[0].x
  const lista = pub.katalogus?.extras ?? pub.extras ?? []
  const extrak = lista.filter((e) => e.active !== false).sort((a, c) => a.sort_order - c.sort_order).map((e) => e.name)
  ok('a megfordított sorrend a publikus adatban is megfordul', forditott.extrak.map((e) => e.name), extrak)
  const nemTulaj = await db.query(`select set_config('app.uid', '', false)`).then(() => db.query(`select csomag_szerkeszto_mentes($1::jsonb)`, [JSON.stringify(adat)]).then(() => 'lefutott', (e) => e.message))
  ok('névtelenül nem menthető', true, /tulajdonos/i.test(nemTulaj))
}

await b.close()
console.log(`\n${baj === 0 ? 'MINDEN RENDBEN' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
