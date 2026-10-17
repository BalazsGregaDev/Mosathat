import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adatbazis, TULAJ } from './_db.mjs'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')
const mammoth = require('mammoth')
const docx = require('docx')

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const MUNKA = join(tmpdir(), `mosathat-v88-${process.pid}`)
await mkdir(MUNKA, { recursive: true })

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
const kep = async (p, nev, opts = {}) => { if (KEPEK) { await p.waitForTimeout(250); await p.screenshot({ path: join(KEPEK, nev), ...opts }) } }
const STILUS = ["p[style-name='Halk'] => p.halk:fresh", "p[style-name='Hatály'] => p.hataly:fresh"]
const html = async (buf) => (await mammoth.convertToHtml({ buffer: buf }, { styleMap: STILUS })).value

async function modosit(buf, f) {
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml').async('string')
  zip.file('word/document.xml', f(xml))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
const csere = (mit, mire) => (xml) => {
  if (!xml.includes(mit)) throw new Error(`nincs benne: ${mit}`)
  return xml.replace(mit, mire)
}
const fajl = async (nev, buf) => { const ut = join(MUNKA, nev); await writeFile(ut, buf); return ut }

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
async function kepesDocx() {
  const { Document, Packer, Paragraph, TextRun, ImageRun } = docx
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ children: [new TextRun('Ez egy rövid próbaszöveg, címsor nélkül, egy képpel. Árvíztűrő tükörfúrógép.')] }),
    new Paragraph({ children: [new ImageRun({ type: 'png', data: PNG, transformation: { width: 40, height: 40 } })] }),
  ] }] })
  return Packer.toBuffer(doc)
}

async function belep(alap, email) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  await p.goto(alap + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', email); await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.locator('aside.oldalsav .menu button').first().waitFor({ timeout: 30000 })
  return { ctx, p, hibak }
}
const menuGomb = (p, n) => p.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${n}$`) })
const panel = (p, i) => p.locator('.jogi-panel').nth(i)
async function nyelvre(p, i, ny) {
  const pa = panel(p, i)
  if ((await pa.getAttribute('data-nyelv')) !== ny) { await pa.locator('h3 .nyelv-kapcsolo').click(); await p.waitForTimeout(250) }
}
async function letolt(p, gomb) {
  const [le] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), gomb.click()])
  const ut = join(MUNKA, `${Date.now()}-${le.suggestedFilename()}`)
  await le.saveAs(ut)
  return { nev: le.suggestedFilename(), buf: await readFile(ut) }
}
async function feltolt(p, i, ut) {
  await panel(p, i).locator('input[type="file"]').setInputFiles(ut)
  await p.locator('.jogi-ellenorzes, .jogi-panel .pub-hiba').first().waitFor({ timeout: 30000 })
  await p.waitForTimeout(300)
}
const most = async (p, i) => sima(await panel(p, i).locator('.jogi-most .jogi-nev').textContent())
const elozok = async (p, i) => (await panel(p, i).locator('.jogi-elozo .jogi-nev').allTextContents()).map(sima)
const uzenet = async (p, i) => sima(await panel(p, i).locator('.jogi-uzenet').textContent())
const figyelmeztetesek = async (p, i) => (await panel(p, i).locator('.jogi-figyelmeztetesek li').allTextContents()).map(sima)
async function kozzetesz(p, i) {
  await panel(p, i).getByRole('button', { name: 'Közzététel a weboldalon' }).click()
  await panel(p, i).locator('.jogi-uzenet').waitFor({ timeout: 20000 })
  await p.waitForTimeout(300)
}
const cikkSzoveg = (l) => l.evaluate((a) => [...a.children].filter((c) => !c.classList.contains('kv-jogi-tervezet')).map((c) => c.innerText).join('\n').replace(/\s+/g, ' ').trim())
const szerkezet = (l) => l.evaluate((a) => ({
  h1: a.querySelectorAll('h1').length, h2: a.querySelectorAll('h2').length, h3: a.querySelectorAll('h3').length,
  sor: a.querySelectorAll('.kv-jogi-sor').length, tr: a.querySelectorAll('.kv-jogi-tabla tr').length,
  li: a.querySelectorAll('li').length, link: a.querySelectorAll('a').length,
  halk: a.querySelectorAll('.kv-jogi-halk').length, hataly: a.querySelectorAll('.kv-jogi-hataly').length,
  strong: a.querySelectorAll('li strong').length,
}))

async function beepitett(ut) {
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(DEMO + ut)
  await p.locator('.kv-jogi:not([aria-busy]) h1').waitFor({ timeout: 60000 })
  const a = p.locator('.kv-jogi')
  const ki = { szoveg: await cikkSzoveg(a), szerkezet: await szerkezet(a), feltoltott: await a.getAttribute('data-feltoltott') }
  await ctx.close()
  return ki
}

console.log('=== 1) Menüpont és jogosultság ===\n')
{
  const { ctx, p } = await belep(DEMO, 'alkalmazott@mosathat.hu')
  ok('alkalmazottnak nincs Jogi szövegek menüpont', 0, await menuGomb(p, 'Jogi szövegek').count())
  await ctx.close()
}
const { ctx: adCtx, p: q, hibak: adHibak } = await belep(DEMO, 'tulaj@mosathat.hu')
{
  const pub = await q.locator('aside.oldalsav .menu button').allTextContents()
  const i = pub.findIndex((x) => sima(x) === 'Cégadatok')
  ok('a tulajdonosnak ott van, a Cégadatok után', 'Jogi szövegek', sima(pub[i + 1]))
  await menuGomb(q, 'Jogi szövegek').click()
  await q.locator('.jogi-panel').nth(1).waitFor({ timeout: 20000 })
  ok('két szekció, mindkettő fejlécében HU-EN csúszka', [['Impresszum', 'Adatvédelmi tájékoztató'], 2],
    [await q.locator('.jogi-panel > h3').evaluateAll((l) => l.map((h) => h.firstChild.textContent.trim())), await q.locator('.jogi-panel > h3 .nyelv-kapcsolo').count()])
  ok('kezdetben a beépített szöveg van a weboldalon, előző változat nincs', ['Beépített szöveg', 'Beépített szöveg', 0],
    [await most(q, 0), await most(q, 1), await q.locator('.jogi-elozo').count()])
  await kep(q, '01-jogi-kezdo.png')
}

console.log('\n=== 2) A beépített szöveg letöltése Wordben ===\n')
const le = {}
{
  for (const [i, lap] of [[0, 'impresszum'], [1, 'adatvedelem']]) {
    for (const ny of ['hu', 'en']) {
      await nyelvre(q, i, ny)
      le[`${lap}-${ny}`] = await letolt(q, panel(q, i).getByRole('button', { name: 'Letöltés Wordben' }))
    }
  }
  ok('fájlnevek', ['Mosathat_Impresszum_HU.docx', 'Mosathat_Impresszum_EN.docx', 'Mosathat_Adatvedelmi_tajekoztato_HU.docx', 'Mosathat_Adatvedelmi_tajekoztato_EN.docx'],
    Object.values(le).map((x) => x.nev))
  const h = await html(le['impresszum-hu'].buf)
  ok('Word: cím Címsor 1, hatály saját stílussal, cégnév táblázatban', [true, true, true, true],
    [h.startsWith('<h1>Impresszum</h1>'), h.includes('<p class="hataly">Hatályos: 2026. október 17.</p>'),
     /<td><p><strong>Cégnév<\/strong><\/p><\/td><td><p>MOSATHAT Autóápolási Korlátolt Felelősségű Társaság<\/p><\/td>/.test(h),
     h.includes('<a href="mailto:info@mosathat.hu">info@mosathat.hu</a>')])
  ok('Word: a „Tervezet” jelzés nem része a dokumentumnak', false, h.includes('Tervezet'))
  ok('Word: a belső link teljes címmel', true, h.includes('href="https://mosathat.hu/adatvedelem"'))
  const ha = await html(le['adatvedelem-hu'].buf)
  ok('Word: adatfeldolgozók fejléces táblázatban, jogok felsorolásban', [true, true],
    [/<thead><tr><th><p><strong>Adatfeldolgozó<\/strong><\/p><\/th>/.test(ha), /<ul><li><strong>Hozzáférés<\/strong> \(GDPR 15\. cikk\)/.test(ha)])
  const he = await html(le['impresszum-en'].buf)
  ok('Word angolul: cím, hatály, fordítási megjegyzés', [true, true, true],
    [he.startsWith('<h1>Legal notice</h1>'), he.includes('<p class="hataly">Effective from: 17 October 2026</p>'), he.includes('<p class="halk">This is an English translation')])
}

console.log('\n=== 3) Visszatöltés változtatás nélkül: a weboldalon ugyanaz látszik ===\n')
{
  for (const [i, lap, ny, ut] of [[0, 'impresszum', 'hu', '/impresszum'], [1, 'adatvedelem', 'hu', '/adatvedelem'], [1, 'adatvedelem', 'en', '/adatvedelem?lang=en']]) {
    const alap = await beepitett(ut)
    await nyelvre(q, i, ny)
    await feltolt(q, i, await fajl(`${lap}-${ny}.docx`, le[`${lap}-${ny}`].buf))
    const elo = panel(q, i).locator('.jogi-elonezet .kv-jogi')
    ok(`${lap} (${ny}): figyelmeztetés nincs, az előnézet szövege betűre egyezik a beépítettel`, [[], alap.szoveg],
      [await figyelmeztetesek(q, i), await cikkSzoveg(elo)])
    ok(`${lap} (${ny}): a szerkezet is (címek, adatsorok, táblázat, felsorolás, linkek)`, alap.szerkezet, await szerkezet(elo))
    if (lap === 'adatvedelem' && ny === 'hu') {
      await panel(q, i).locator('.jogi-ellenorzes').scrollIntoViewIfNeeded()
      await kep(q, '02-jogi-ellenorzes.png')
    }
    await panel(q, i).getByRole('button', { name: 'Mégse' }).click()
    await q.waitForTimeout(200)
  }
  ok('a Mégse után nem került fel semmi', ['Beépített szöveg', 0], [await most(q, 1), await q.locator('.jogi-elozo').count()])
}

console.log('\n=== 4) Módosított változat feltöltése ===\n')
let v1
{
  await nyelvre(q, 0, 'hu')
  const mod = await modosit(le['impresszum-hu'].buf, csere('>Panaszkezelés<', '>Panaszkezelés és ügyintézés<'))
  v1 = await fajl('impresszum_jogasz_v1.docx', mod)
  await feltolt(q, 0, v1)
  ok('az előnézetben már az új fejezetcím', true,
    (await panel(q, 0).locator('.jogi-elonezet h2').allTextContents()).includes('Panaszkezelés és ügyintézés'))
  ok('nyelvváltás közben nem lehet', ['hu', 'Előbb tedd közzé vagy vesd el a feltöltött fájlt, utána válts nyelvet.'],
    [await (async () => { await panel(q, 0).locator('h3 .nyelv-kapcsolo').click(); await q.waitForTimeout(200); return panel(q, 0).getAttribute('data-nyelv') })(), await uzenet(q, 0)])
  await kozzetesz(q, 0)
  ok('közzétéve: ez van a weboldalon, a beépített az előzők között', ['Közzétéve. A weboldalon már a(z) impresszum_jogasz_v1.docx szövege látszik.', 'impresszum_jogasz_v1.docx', ['Beépített szöveg']],
    [await uzenet(q, 0), await most(q, 0), await elozok(q, 0)])
  ok('feltöltő és méret a részleteknél', true, /^Feltöltötte: Tulaj Tamás, 2\d{3}\. \S+ \d{1,2}\. \d{2}:\d{2} · \d+ KB$/.test(sima(await panel(q, 0).locator('.jogi-most .jogi-reszlet').textContent())))
  ok('az angol változat külön: ott még a beépített van, figyelmeztet, hogy a magyar frissebb', ['Beépített szöveg', true],
    await (async () => { await nyelvre(q, 0, 'en'); return [await most(q, 0), /A magyar változat frissebb/.test(await panel(q, 0).locator('.jogi-megjegyzes').textContent())] })())
  await nyelvre(q, 0, 'hu')
  ok('a letöltött jelenlegi változat bájtra a feltöltött fájl', true,
    Buffer.compare((await letolt(q, panel(q, 0).getByRole('button', { name: 'Letöltés Wordben' }))).buf, await readFile(v1)) === 0)
  await kep(q, '03-jogi-feltoltve.png')
}

console.log('\n=== 5) Figyelmeztetések és hibák ===\n')
{
  const kovetett = await modosit(await readFile(v1), csere('>Panaszkezelés és ügyintézés</w:t></w:r>',
    '>Panaszkezelés és ügyintézés</w:t></w:r><w:ins w:id="901" w:author="Jogász" w:date="2026-10-17T10:00:00Z"><w:r><w:t xml:space="preserve"> BESZÚRT</w:t></w:r></w:ins><w:del w:id="902" w:author="Jogász" w:date="2026-10-17T10:00:00Z"><w:r><w:delText xml:space="preserve"> TÖRÖLT</w:delText></w:r></w:del>'))
  await feltolt(q, 0, await fajl('kovetett.docx', kovetett))
  const f1 = await figyelmeztetesek(q, 0)
  ok('követett változtatások: figyelmeztet, a beszúrás bent, a törlés kint', [1, true, true],
    [f1.length, /elfogadatlan követett változtatások/.test(f1[0] ?? ''),
     (await panel(q, 0).locator('.jogi-elonezet h2').allTextContents()).includes('Panaszkezelés és ügyintézés BESZÚRT')])
  await panel(q, 0).getByRole('button', { name: 'Mégse' }).click()

  await feltolt(q, 0, await fajl('kepes.docx', await kepesDocx()))
  const f2 = await figyelmeztetesek(q, 0)
  ok('kép és cím nélküli dokumentum: két figyelmeztetés, a cím „Impresszum” lesz', [true, true, 'Impresszum'],
    [f2.some((x) => x.startsWith('Egy kép van a dokumentumban')), f2.some((x) => x.includes('nincs „Címsor 1” stílusú cím')),
     sima(await panel(q, 0).locator('.jogi-elonezet h1').textContent())])
  await panel(q, 0).getByRole('button', { name: 'Mégse' }).click()

  await feltolt(q, 0, await fajl('rossz-nyelv.docx', le['impresszum-en'].buf))
  ok('angol szöveg a magyar helyére: figyelmeztet', ['Úgy tűnik, ez nem magyar szöveg, pedig a magyar változat helyére töltöd fel.'], await figyelmeztetesek(q, 0))
  await panel(q, 0).getByRole('button', { name: 'Mégse' }).click()
  await feltolt(q, 0, await fajl('rossz-dok.docx', le['adatvedelem-hu'].buf))
  ok('az Adatvédelmi tájékoztató az Impresszum helyére: figyelmeztet', ['Úgy tűnik, ez az Adatvédelmi tájékoztató, pedig az Impresszum helyére töltöd fel.'], await figyelmeztetesek(q, 0))
  await panel(q, 0).getByRole('button', { name: 'Mégse' }).click()

  await feltolt(q, 0, await fajl('regi.doc', Buffer.from('nem word')))
  ok('régi .doc: érthető hiba', true, /régi \.doc formátum/.test(await uzenet(q, 0)))
  await feltolt(q, 0, await fajl('hamis.docx', Buffer.from('%PDF-1.4 ez nem word')))
  ok('nem Word-fájl .docx névvel: hiba', true, /Ez nem Word \(\.docx\) fájl/.test(await uzenet(q, 0)))
  await feltolt(q, 0, await fajl('nagy.docx', Buffer.alloc(2 * 1024 * 1024 + 10, 1)))
  ok('2 MB fölött: hiba', true, /túl nagy \(2,0 MB\), legfeljebb 2 MB/.test(await uzenet(q, 0)))
  ok('a hibák után is a v1 van fent', ['impresszum_jogasz_v1.docx', ['Beépített szöveg']], [await most(q, 0), await elozok(q, 0)])
}

console.log('\n=== 6) Három előző változat, visszaállítás ===\n')
{
  const nevek = []
  for (const n of [2, 3, 4]) {
    const nev = `impresszum_jogasz_v${n}.docx`
    await feltolt(q, 0, await fajl(nev, await modosit(await readFile(v1), csere('>Panaszkezelés és ügyintézés<', `>Panaszkezelés ${n}<`))))
    await kozzetesz(q, 0)
    nevek.push(nev)
  }
  ok('négy feltöltés után: a v4 van fent, előzők v3, v2, v1; a beépített kiesett',
    ['impresszum_jogasz_v4.docx', ['impresszum_jogasz_v3.docx', 'impresszum_jogasz_v2.docx', 'impresszum_jogasz_v1.docx']],
    [await most(q, 0), await elozok(q, 0)])
  const regi = await letolt(q, panel(q, 0).getByRole('button', { name: 'Letöltés: impresszum_jogasz_v1.docx' }))
  ok('egy előző változat letöltése: az eredeti fájl, eredeti néven', ['impresszum_jogasz_v1.docx', true], [regi.nev, Buffer.compare(regi.buf, await readFile(v1)) === 0])
  await panel(q, 0).getByRole('button', { name: 'Visszaállítás: impresszum_jogasz_v2.docx' }).click()
  await panel(q, 0).locator('.jogi-uzenet').waitFor({ timeout: 20000 })
  await q.waitForTimeout(300)
  ok('visszaállítva: v2 fent, a v4 az előzők elején, semmi nem veszett el',
    ['impresszum_jogasz_v2.docx', ['impresszum_jogasz_v4.docx', 'impresszum_jogasz_v3.docx', 'impresszum_jogasz_v1.docx']],
    [await most(q, 0), await elozok(q, 0)])
  ok('a részleteknél látszik, ki és mikor állította vissza', true, /visszaállította: Tulaj Tamás, /.test(await panel(q, 0).locator('.jogi-most .jogi-reszlet').textContent()))
  await kep(q, '04-jogi-elozok.png')
}

console.log('\n=== 7) Cégadatok: figyelmeztet a feltöltött változatra ===\n')
{
  await menuGomb(q, 'Cégadatok').click()
  await q.locator('.pub-jogi-figyel').waitFor({ timeout: 20000 })
  ok('megnevezi, melyik dokumentum', true, /Feltöltött Word-változat van érvényben: Impresszum \(magyar\)\./.test(sima(await q.locator('.pub-jogi-figyel').textContent())))
  await kep(q, '05-cegadatok-figyel.png', { clip: { x: 232, y: 60, width: 1268, height: 330 } })
  await q.locator('.pub-jogi-figyel').getByRole('button', { name: 'Jogi szövegek' }).click()
  await q.locator('.jogi-panel').first().waitFor({ timeout: 20000 })
  ok('a linkje a Jogi szövegekre visz', 'Jogi szövegek', sima(await q.locator('aside.oldalsav .menu button[aria-current="page"]').first().textContent()))
  ok('nincs futásidejű hiba', [], adHibak)
  await adCtx.close()
}

console.log('\n=== 8) Telefonon ===\n')
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const p = await ctx.newPage()
  await p.goto(DEMO + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu'); await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.locator('.mobil-fejlec .hamburger').click()
  await p.locator('.fiok .menu button').filter({ hasText: /^Jogi szövegek$/ }).click()
  await p.locator('.jogi-panel').first().waitFor({ timeout: 20000 })
  await p.waitForTimeout(400)
  ok('nem lóg ki oldalra', true, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await kep(p, '06-jogi-telefon.png')
  await ctx.close()
}

console.log('\n=== 9) A publikus oldalon (adatbázissal) ===\n')
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
    const ctx = await b.newContext({ viewport, acceptDownloads: true })
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
      if (fn && (fn.startsWith('publikus_') || fn.startsWith('jogi_') || fn === 'dashboard_summary')) {
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
  const nyit = async (p, ut) => {
    await p.goto(SB + ut)
    await p.locator('.kv-jogi:not([aria-busy]) h1').waitFor({ timeout: 60000 })
    await p.waitForTimeout(300)
    return p.locator('.kv-jogi')
  }

  const ad = await kornyezet({ width: 1500, height: 1000 })
  await ad.p.goto(SB + '/')
  await ad.p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await ad.p.fill('input[type="email"]', 'x@mosathat.hu'); await ad.p.fill('input[type="password"]', 'x')
  await ad.p.getByRole('button', { name: /Belépés/ }).click()
  await menuGomb(ad.p, 'Jogi szövegek').waitFor({ timeout: 30000 })
  await menuGomb(ad.p, 'Jogi szövegek').click()
  await ad.p.locator('.jogi-panel').nth(1).waitFor({ timeout: 20000 })
  const adv = await modosit(le['adatvedelem-hu'].buf, csere('>3. Sütik<', '>3. Sütik és helyi tárolás<'))
  await feltolt(ad.p, 1, await fajl('adatvedelem_vegleges.docx', adv))
  await kozzetesz(ad.p, 1)

  const pub = await kornyezet({ width: 1300, height: 900 })
  let a = await nyit(pub.p, '/adatvedelem')
  ok('a weboldalon a feltöltött szöveg látszik', [true, 'Adatvédelmi tájékoztató'],
    [(await a.locator('h2').allTextContents()).includes('3. Sütik és helyi tárolás'), sima(await a.locator('h1').textContent())])
  ok('a „Tervezet” jelzés továbbra is a Cégadatok szerint látszik, a böngészőfül címe a régi', [true, 'Adatvédelmi tájékoztató — Mosathat'],
    [await a.locator('.kv-jogi-tervezet').isVisible(), await pub.p.title()])
  ok('a belső link a saját oldalon marad', '/impresszum', await a.locator('a', { hasText: 'Impresszumban' }).getAttribute('href'))
  await a.locator('h2', { hasText: '3. Sütik és helyi tárolás' }).scrollIntoViewIfNeeded()
  await kep(pub.p, '07-publikus-feltoltott.png')
  a = await nyit(pub.p, '/adatvedelem?lang=en')
  ok('az angol oldalon még a beépített angol szöveg', [null, 'Privacy policy', false],
    [await a.getAttribute('data-feltoltott'), sima(await a.locator('h1').textContent()), (await a.locator('h2').allTextContents()).some((x) => x.includes('helyi tárolás'))])
  a = await nyit(pub.p, '/impresszum')
  ok('az Impresszum változatlan', null, await a.getAttribute('data-feltoltott'))

  await ad.p.getByRole('button', { name: 'Visszaállítás: Beépített szöveg' }).click()
  await panel(ad.p, 1).locator('.jogi-uzenet').waitFor({ timeout: 20000 })
  await ad.p.waitForTimeout(300)
  ok('a beépített szöveg visszaállítva', ['Beépített szöveg', ['adatvedelem_vegleges.docx']], [await most(ad.p, 1), await elozok(ad.p, 1)])
  const pub2 = await kornyezet({ width: 1300, height: 900 })
  a = await nyit(pub2.p, '/adatvedelem')
  ok('a weboldalon ismét a beépített szöveg', [null, false],
    [await a.getAttribute('data-feltoltott'), (await a.locator('h2').allTextContents()).includes('3. Sütik és helyi tárolás')])
  await rpc('jogi_valtozat_feltoltes', { p: { dokumentum: 'impresszum', nyelv: 'hu', fajlnev: 'hibas.docx', fajl: 'UEsDBBQ=', tartalom: [{ t: 'p', r: 'nem lista' }, { t: 'script', r: [] }] } }, TULAJ)
  await rpc('jogi_valtozat_feltoltes', { p: { dokumentum: 'impresszum', nyelv: 'en', fajlnev: 'link.docx', fajl: 'UEsDBBQ=', tartalom: [{ t: 'h1', r: [{ s: 'Legal notice' }] }, { t: 'p', r: [{ s: 'kattints', href: 'javascript:alert(1)' }, { s: ' vagy ' }, { s: 'ide', href: 'https://www.mosathat.hu/adatvedelem?lang=en' }] }] } }, TULAJ)
  const pub3 = await kornyezet({ width: 1300, height: 900 })
  a = await nyit(pub3.p, '/impresszum')
  ok('hibás szerkezetű tartalomnál a beépített szöveg jelenik meg, hiba nélkül', [null, 'Impresszum'], [await a.getAttribute('data-feltoltott'), sima(await a.locator('h1').textContent())])
  a = await nyit(pub3.p, '/impresszum?lang=en')
  ok('veszélyes link nem lesz link, a saját domainre mutató relatív lesz', [['/adatvedelem?lang=en'], 'kattints vagy ide'],
    [await a.locator('p a').evaluateAll((l) => l.map((x) => x.getAttribute('href'))), sima(await a.locator('h1 + p').textContent())])
  ok('nincs futásidejű hiba', [], [...ad.hibak, ...pub.hibak, ...pub2.hibak, ...pub3.hibak])
  await Promise.all([ad.ctx.close(), pub.ctx.close(), pub2.ctx.close(), pub3.ctx.close()])
}

await b.close()
console.log(`\n${baj === 0 ? 'MINDEN RENDBEN' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
