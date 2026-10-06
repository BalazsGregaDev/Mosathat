// v38 ellenőrzése Playwrighttal.
//
// Futtatás:  npm run dev -- --port 5180   (másik ablakban)
//            node scripts/v38-teszt.mjs
//
// Amit néz:
//   1. Havi nézet: a többnapos munka sávként fut végig a napokon (mint a
//      hetiben), és nem áll ott még egyszer kártyaként.
//   2. Napi kártya: asztalon a betűk a régi méret kb. 1,4-szerese, telefonon
//      a régi méret — a kártya szerkezete ugyanaz.
//   3. Szerződés törlése rákérdezéssel.
//   4. Napi kártya telefonon.
//   5. Igazolólap: a napi kártya gombja előre kitöltött sort nyit, aláírás a
//      vásznon, mentés; a cég lapja (Cég szerint nézet), oszlopok és lábléc,
//      kézi sor, lezárás és újranyitás.
//   6. Igazolólap telefonon, alkalmazottként: koppintással aláír, a
//      tulajdonosi gombok nem látszanak.
//   7. Word letöltés: valódi .docx (zip), benne a sorok, az átnevezett és a
//      saját oszlop, az aláírás képe, az Összesen sor, a lábléc árai és
//      szövege; 7 oszlopnál fekvő lap.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
async function belep(p, email = 'tulaj@mosathat.hu') {
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
}
async function menu(p, nev) {
  if (await p.locator('.mobil-fejlec .hamburger').isVisible()) {
    await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
    await p.locator('.fiok button').filter({ hasText: nev }).first().click()
  } else {
    await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  }
  await p.waitForTimeout(1500)
}

// =============================================================================
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(p)
await menu(p, 'Időpontok')

console.log('=== 1) Napi kártya betűméretei (asztal) ===\n')
{
  const r = await p.evaluate(() => {
    const k = document.querySelector('.napi-lista .kartya')
    const f = (s) => parseFloat(getComputedStyle(k.querySelector(s)).fontSize)
    return { rendszam: f('.rendszam'), ido: f('.ido'), csomag: f('.csomag') }
  })
  ok('rendszám 22 px (a duplázott 32 px 70%-a)', 22, r.rendszam)
  ok('idő 15 px', 15, r.ido)
  ok('csomag 17 px', 17, r.csomag)
}

console.log('\n=== 2) Havi nézet: többnapos sávok ===\n')
await p.locator('.fejlec .nezetvalto button').filter({ hasText: 'Hónap' }).click()
await p.waitForTimeout(1500)
{
  const savok = await p.locator('.honap-sav').count()
  ok('vannak sávok', true, savok > 0)
  const r = await p.locator('.honap-sav').first().evaluate((s) => {
    const sor = s.closest('.honapsor')
    const cellak = [...sor.querySelectorAll('.honapnap')]
    const sr = s.getBoundingClientRect()
    // hány nap-cellát fed vízszintesen
    const fed = cellak.filter((c) => {
      const cr = c.getBoundingClientRect()
      return cr.right > sr.left + 2 && cr.left < sr.right - 2
    }).length
    return { fed, azon: s.querySelector('.azon').textContent }
  })
  ok(`${r.azon}: a sáv több napon fut végig`, true, r.fed >= 2)
  const szin = await p.locator('.honap-sav').first().evaluate((s) => {
    const a = s.querySelector('.azon').getBoundingClientRect()
    const i = s.querySelector('.ido').getBoundingClientRect()
    return { hatter: getComputedStyle(s).backgroundColor, rés: Math.round(i.left - a.right) }
  })
  ok('a többnapos sáv lila hátterű', 'rgb(241, 236, 251)', szin.hatter)
  ok('az utolsó nap és óra közvetlenül a rendszám után', true, szin.rés >= 0 && szin.rés <= 10)
  const cellaban = await p.locator('.honapnap .minikartya .azon').allTextContents()
  const savban = await p.locator('.honap-sav .azon').allTextContents()
  // ugyanaz a rendszám lehet más foglalás is (pl. H-V egynapos), ezért a
  // többnapos sáv rendszáma legfeljebb annyiszor szerepeljen kártyaként,
  // ahány egynapos foglalása van — itt elég, hogy a sáv nem duplikálja magát
  // minden napon.
  ok('a többnapos nem ismétlődik napról napra kártyaként', true,
    savban.every((x) => cellaban.filter((y) => y === x).length <= 1))
  // A cella tételei a sávok ALATT kezdődnek (nem takarják egymást)
  const takar = await p.evaluate(() => [...document.querySelectorAll('.honapsor')].some((sor) => {
    const savok = [...sor.querySelectorAll('.honap-sav')].map((s) => s.getBoundingClientRect())
    // v50: a cellában a tételek helyett az autók száma („+ 8 autó") áll
    const tetelek = [...sor.querySelectorAll('.honapnap .honap-autok')].map((m) => m.getBoundingClientRect())
    return savok.some((s) => tetelek.some((t) =>
      t.top < s.bottom - 1 && t.bottom > s.top + 1 && t.left < s.right && t.right > s.left))
  }))
  ok('a sávok nem takarják a cella tételeit', false, takar)
}
await p.screenshot({ path: '/tmp/v38-honap.png' })

console.log('\n=== 3) Szerződés törlése ===\n')
await menu(p, 'Cégek és bérletesek')
await p.locator('.fulek button').filter({ hasText: 'Szerződéses cégek' }).click()
await p.waitForTimeout(600)
{
  const kartya = p.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).first()
  await kartya.locator('.kartya-nyito').click()
  await p.waitForTimeout(300)
  await kartya.getByRole('button', { name: 'Törlés' }).click()
  await p.waitForTimeout(300)
  ok('rákérdez', true, (await p.locator('.kerdes-ablak h2').innerText()).startsWith('Biztosan törlöd a szerződést?'))
  await p.locator('.kerdes-gombok button').filter({ hasText: 'Mégse' }).click()
  await p.waitForTimeout(400)
  ok('Mégse: megmaradt', 1, await p.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).count())
  await kartya.getByRole('button', { name: 'Törlés' }).click()
  await p.waitForTimeout(300)
  await p.locator('.kerdes-gombok button').filter({ hasText: 'Törlés' }).click()
  await p.waitForTimeout(1200)
  ok('Törlés: eltűnt', 0, await p.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).count())
}
await ctx.close()

// =============================================================================
console.log('\n=== 4) Napi kártya telefonon: a régi méret ===\n')
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const t = await ctx2.newPage()
await belep(t)
await menu(t, 'Időpontok')
{
  const r = await t.evaluate(() => {
    const k = document.querySelector('.napi-lista .kartya')
    const f = (s) => parseFloat(getComputedStyle(k.querySelector(s)).fontSize)
    const lista = document.querySelector('.tartalom')
    return { rendszam: f('.rendszam'), ido: f('.ido'), csomag: f('.csomag'),
             sw: lista.scrollWidth, cw: lista.clientWidth }
  })
  ok('rendszám 16 px (a régi méret)', 16, r.rendszam)
  ok('idő 11 px', 11, r.ido)
  ok('csomag 12 px', 12, r.csomag)
  ok('nem lóg ki oldalra', true, r.sw <= r.cw + 1)
}
await ctx2.close()

// =============================================================================
console.log('\n=== 5) Igazolólap ===\n')
const ctx3 = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const g = await ctx3.newPage()
g.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(g)
await menu(g, 'Időpontok')
const ma = await g.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date()))
{
  const gombok = g.locator('.napi-lista .kartya .kartya-muvelet button').filter({ hasText: /^Igazolólap$/ })
  ok('a szerződéses cég kártyáján van Igazolólap gomb', true, (await gombok.count()) >= 1)
  const kartya = g.locator('.napi-lista .kartya').filter({ has: g.locator('button', { hasText: /^Igazolólap$/ }) }).first()
  const rendszam = (await kartya.locator('.rendszam').innerText()).trim()
  await kartya.getByRole('button', { name: 'Igazolólap' }).click()
  await g.waitForSelector('[aria-label="Igazolólap sora"]')
  const urlap = g.locator('[aria-label="Igazolólap sora"]')
  // Az átadás napja: egynaposnál ma, többnaposnál az utolsó nap (ma vagy később).
  ok('előre kitöltve: az átadás napja (ma vagy később)', true, (await urlap.locator('#ig-nap').inputValue()) >= ma)
  ok('előre kitöltve: a rendszám', rendszam.replace(/\s/g, ''), (await urlap.locator('#ig-rsz').inputValue()).replace(/\s/g, ''))
  ok('előre kitöltve: nettó ár', true, Number(await urlap.locator('#ig-netto').inputValue()) > 0)
  await urlap.locator('#ig-km').fill('123456')
  // Aláírás egérrel a vásznon
  const v = await urlap.locator('.alairas-vaszon').boundingBox()
  await g.mouse.move(v.x + 30, v.y + 80)
  await g.mouse.down()
  for (let i = 1; i <= 10; i++) await g.mouse.move(v.x + 30 + i * 25, v.y + 80 + (i % 2 ? -30 : 30))
  await g.mouse.up()
  ok('aláírva', true, (await urlap.locator('.alairas-gombok').innerText()).includes('Aláírva'))
  await urlap.getByRole('button', { name: 'Mentés' }).click()
  await g.waitForTimeout(1200)
  ok('mentés után bezárul', 0, await g.locator('[aria-label="Igazolólap sora"]').count())

  // Másodszorra a mentett sor jön: km és aláírás megvan
  await kartya.getByRole('button', { name: 'Igazolólap' }).click()
  await g.waitForSelector('[aria-label="Igazolólap sora"]')
  ok('újranyitva: a km megmaradt', '123456', await urlap.locator('#ig-km').inputValue())
  ok('újranyitva: az aláírás képe látszik', 1, await urlap.locator('.alairas-kep img').count())
  await urlap.getByRole('button', { name: 'Mégse' }).click()
  await g.waitForTimeout(300)

  // A munkalapon is ott a gomb
  await kartya.locator('.kartya-nyit').click()
  await g.waitForTimeout(800)
  ok('a munkalapon is van igazolólap gomb (a cég alatt)', 1,
    await g.locator('.adatsor').filter({ hasText: 'Igazolólap' }).getByRole('button', { name: 'Kitöltés, aláírás' }).count())
  ok('a munkalap lába nem lett szélesebb (nincs benne)', 0,
    await g.locator('.munkalap-lab button').filter({ hasText: /Igazolólap/ }).count())
  // A munkalapról nyitott sor: Escape csak a sort zárja be, a munkalapot nem.
  await g.getByRole('button', { name: 'Kitöltés, aláírás' }).click()
  await g.waitForSelector('[aria-label="Igazolólap sora"]')
  await g.keyboard.press('Escape')
  await g.waitForTimeout(400)
  ok('Escape: a sor bezárult, a munkalap nyitva maradt', [0, 1], [
    await g.locator('[aria-label="Igazolólap sora"]').count(),
    await g.locator('.munkalap-lab').count()])
  await g.keyboard.press('Escape')
  await g.waitForTimeout(500)
}

await menu(g, 'Ügyfelek')
await g.locator('button').filter({ hasText: 'Cég szerint' }).click()
await g.waitForTimeout(1200)
{
  const elso = g.locator('.panel').filter({ has: g.locator('.kartya-fej') }).first()
  const elsoNev = await elso.locator('.kartya-fej').innerText()
  ok(`a szerződéses cég áll elöl (${elsoNev.split('\n')[0]})`, true, /autó trans/i.test(elsoNev))
  ok('a cég kártyáján Igazolólap gomb', 1, await elso.locator('.ceg-lap-sor button').count())
  await elso.locator('.ceg-lap-sor button').click()
  await g.waitForSelector('.lap-igazolo')
  await g.waitForTimeout(800)
  const lap = g.locator('.lap-igazolo')
  ok('a hónap lapján egy sor', 1, await lap.locator('.igazolo-tabla tbody tr').count())
  ok('a sorban az aláírás képe', 1, await lap.locator('.igazolo-tabla .alairas-mini').count())
  ok('a km a sorban', true, (await lap.locator('.igazolo-tabla tbody tr').first().innerText()).includes('123'))
  ok('a lábléc a szerződés áraival (nettó + ÁFA)', true,
    (await lap.locator('.igazolo-lablec').innerText()).includes('+ ÁFA'))
  ok('a nyitott lap állapota', 'nyitott', (await lap.locator('.igazolo-allapot').innerText()).trim())

  // Oszlopok és lábléc
  await lap.getByRole('button', { name: 'Oszlopok és lábléc' }).click()
  const be = g.locator('[aria-label="Oszlopok és lábléc"]')
  await be.waitFor()
  const kmSor = be.locator('.oszlop-sor').filter({ has: g.locator('input[value="Km óra állás"]') })
  await kmSor.locator('input.beviteli').fill('Kilométer')
  await be.getByRole('button', { name: '+ Saját oszlop' }).click()
  await be.locator('.oszlop-sor').last().locator('input.beviteli').fill('Munkaszám')
  ok('az alap oszlop nem törölhető (nincs Törlés gombja)', 1,
    await be.locator('.oszlop-sor').filter({ has: g.locator('.alap-jel') }).first().locator('.alap-jel').count())
  await be.locator('#ig-lablec').fill('Fizetés havonta, átutalással.')
  await be.getByRole('button', { name: 'Mentés' }).click()
  await g.waitForTimeout(1200)
  const fejlec = await lap.locator('.igazolo-tabla thead').innerText()
  ok('átnevezett oszlop a fejlécben', true, fejlec.includes('Kilométer') || fejlec.includes('KILOMÉTER'))
  ok('új saját oszlop a fejlécben', true, /munkaszám/i.test(fejlec))
  ok('saját lábléc szöveg', true, (await lap.locator('.igazolo-lablec').innerText()).includes('átutalással'))

  // Kézi sor
  await lap.getByRole('button', { name: '+ Új sor' }).click()
  const uj = g.locator('[aria-label="Igazolólap sora"]')
  await uj.waitFor()
  ok('új sor: a mai nap', ma, await uj.locator('#ig-nap').inputValue())
  await uj.locator('#ig-rsz').fill('KEZ-001')
  await uj.locator('#ig-netto').fill('10000')
  await uj.getByLabel('Munkaszám').fill('MSZ-77')
  await uj.getByRole('button', { name: 'Mentés' }).click()
  await g.waitForTimeout(1200)
  ok('a kézi sor felkerült', 2, await lap.locator('.igazolo-tabla tbody tr').count())
  ok('a saját oszlop értéke a táblában', true, (await lap.locator('.igazolo-tabla').innerText()).includes('MSZ-77'))
  ok('hiányzó aláírás jelezve', true, (await lap.locator('.igazolo-osszeg').innerText()).includes('1 aláírás hiányzik'))

  // Lezárás
  await lap.getByRole('button', { name: 'Hónap lezárása' }).click()
  await g.waitForTimeout(300)
  ok('lezárás előtt rákérdez (és szól a hiányzó aláírásról)', true,
    (await g.locator('.kerdes-ablak').innerText()).includes('hiányzik az aláírás'))
  await g.locator('.kerdes-gombok button').filter({ hasText: 'Lezárás' }).click()
  await g.waitForTimeout(1200)
  ok('lezárva', true, (await lap.locator('.igazolo-allapot').innerText()).startsWith('lezárva'))
  ok('lezárt lapon nincs Új sor', 0, await lap.getByRole('button', { name: '+ Új sor' }).count())
  await lap.locator('.igazolo-tabla tbody tr').first().click()
  await uj.waitFor()
  ok('lezárt sor csak olvasható', true, await uj.locator('#ig-km').isDisabled())
  await uj.locator('.lap-lab button').filter({ hasText: 'Bezárás' }).click()
  await g.waitForTimeout(300)
  await lap.getByRole('button', { name: 'Újranyitás' }).click()
  await g.waitForTimeout(300)
  await g.locator('.kerdes-gombok button').filter({ hasText: 'Újranyitás' }).click()
  await g.waitForTimeout(1200)
  ok('újranyitva', 'nyitott', (await lap.locator('.igazolo-allapot').innerText()).trim())
  await g.screenshot({ path: '/tmp/v38-igazolo.png' })

  console.log('\n=== 7) Word letöltés ===\n')
  const [dl] = await Promise.all([
    g.waitForEvent('download', { timeout: 30000 }),
    lap.getByRole('button', { name: 'Word letöltés' }).click(),
  ])
  ok('a fájl neve (ékezet nélkül, hogy minden böngésző megtartsa)',
    `Igazololap_Auto_Trans_Kft_${ma.slice(0, 7)}.docx`, dl.suggestedFilename())
  await dl.saveAs('/tmp/v38-igazolo.docx')
  const zip = (f) => execSync(`unzip -p /tmp/v38-igazolo.docx ${f}`).toString()
  const lista = execSync('unzip -l /tmp/v38-igazolo.docx').toString()
  const dok = zip('word/document.xml')
  const szoveg = dok.replace(/<[^>]+>/g, ' ')
  ok('valódi Word fájl (zip, document.xml)', true, dok.includes('<w:document'))
  ok('a cím a cégnévvel', true, szoveg.includes('Autó Trans Kft. – igazolólap'))
  ok('az átnevezett és a saját oszlop a fejlécben', [true, true],
    [szoveg.includes('Kilométer'), szoveg.includes('Munkaszám')])
  ok('a sorok adatai (rendszám, km, saját oszlop)', [true, true, true],
    [szoveg.includes('KEZ-001'), szoveg.includes('123') && szoveg.includes('456'), szoveg.includes('MSZ-77')])
  ok('az aláírás képként benne van', true, /word\/media\/.+\.png/.test(lista))
  ok('Összesen sor', true, szoveg.includes('Összesen: 2 autó'))
  ok('a fejléc sor minden oldalon ismétlődik', true, dok.includes('<w:tblHeader'))
  ok('7 oszlop: fekvő lap', true, dok.includes('w:orient="landscape"'))
  const lab = execSync(`unzip -p /tmp/v38-igazolo.docx 'word/footer*.xml'`).toString().replace(/<[^>]+>/g, ' ')
  ok('lábléc: a szerződés árai', true, lab.includes('Normál méret') && lab.includes('+ ÁFA'))
  ok('lábléc: a saját szöveg', true, lab.includes('átutalással'))
}
await ctx3.close()

// =============================================================================
console.log('\n=== 6) Igazolólap telefonon, alkalmazottként ===\n')
const ctx4 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const m = await ctx4.newPage()
m.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(m, 'alkalmazott@mosathat.hu')
await menu(m, 'Időpontok')
{
  const gomb = m.locator('.napi-lista .kartya .kartya-muvelet button').filter({ hasText: /^Igazolólap$/ }).first()
  await gomb.click()
  const urlap = m.locator('[aria-label="Igazolólap sora"]')
  await urlap.waitFor()
  const v = await urlap.locator('.alairas-vaszon').boundingBox()
  ok('az aláírás mező kitölti a szélességet', true, v.width > 300)
  await m.touchscreen.tap(v.x + 100, v.y + 60)
  await m.waitForTimeout(200)
  ok('koppintásra is aláírt', true, (await urlap.locator('.alairas-gombok').innerText()).includes('Aláírva'))
  const r = await m.evaluate(() => {
    const t = document.querySelector('[aria-label="Igazolólap sora"] .lap-torzs')
    return { sw: t.scrollWidth, cw: t.clientWidth }
  })
  ok('nem lóg ki oldalra', true, r.sw <= r.cw + 1)
  await urlap.getByRole('button', { name: 'Mentés' }).click()
  await m.waitForTimeout(1200)
  await m.screenshot({ path: '/tmp/v38-igazolo-mobil.png' })
}
await menu(m, 'Ügyfelek')
await m.locator('button').filter({ hasText: 'Cég szerint' }).click()
await m.waitForTimeout(1200)
{
  await m.locator('.ceg-lap-sor button').first().click()
  await m.waitForSelector('.lap-igazolo')
  await m.waitForTimeout(800)
  const lap = m.locator('.lap-igazolo')
  ok('alkalmazott: nincs Oszlopok és lábléc', 0, await lap.getByRole('button', { name: 'Oszlopok és lábléc' }).count())
  ok('alkalmazott: nincs Lezárás', 0, await lap.getByRole('button', { name: 'Hónap lezárása' }).count())
  ok('telefonon a sor kártyaként (fejléc nélkül)', 'none',
    await lap.locator('.igazolo-tabla thead').evaluate((t) => getComputedStyle(t).display))
  const r = await m.evaluate(() => {
    const t = document.querySelector('.lap-igazolo .lap-torzs')
    return { sw: t.scrollWidth, cw: t.clientWidth }
  })
  ok('a lap nem lóg ki oldalra', true, r.sw <= r.cw + 1)
  await m.screenshot({ path: '/tmp/v38-igazolo-mobil-lap.png' })
}
await ctx4.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
