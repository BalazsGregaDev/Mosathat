import { chromium } from 'playwright'

const URL = 'http://localhost:5180/'
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}

async function oldal(viewport = { width: 1440, height: 900 }) {
  const ctx = await b.newContext({ viewport })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(`pageerror: ${e.message.slice(0, 160)}`))
  p.on('console', (m) => { if (m.type() === 'error') hibak.push(`console: ${m.text().slice(0, 160)}`) })
  await p.goto(URL)
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  return { ctx, p, hibak }
}

async function belep(p, email) {
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
}

async function menu(p, nev, mobil = false) {
  if (mobil) {
    await p.locator('.hamburger:visible').first().click(); await p.waitForTimeout(500)
    await p.locator('.fiok button').filter({ hasText: nev }).first().click()
  } else {
    await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  }
  await p.waitForTimeout(1500)
}

const kilog = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const lathatoHiba = (p) => p.locator('.hibauzenet:visible').count()

console.log('=== 1) Füstteszt: minden menüpont, minden szerepkör, asztal és telefon ===\n')
const SZEREPEK = [
  ['demo@mosathat.hu', ['Áttekintés', 'Időpontok', 'Igazolólap', 'Szolgáltatások', 'Cégek és bérletesek',
    'Ügyfelek', 'Felhasználók', 'Beállítások', 'Profilom', 'Időpontfoglalás']],
  ['tulaj@mosathat.hu', ['Áttekintés', 'Időpontok', 'Igazolólap', 'Szolgáltatások', 'Cégek és bérletesek',
    'Ügyfelek', 'Felhasználók', 'Beállítások', 'Profilom']],
  ['alkalmazott@mosathat.hu', ['Időpontok', 'Igazolólap', 'Szolgáltatások', 'Cégek és bérletesek', 'Ügyfelek', 'Profilom']],
]
for (const [email, menupontok] of SZEREPEK) {
  for (const [nev, viewport] of [['asztal', { width: 1440, height: 900 }], ['telefon', { width: 390, height: 844 }]]) {
    const { ctx, p, hibak } = await oldal(viewport)
    await belep(p, email)
    const mobil = nev === 'telefon'
    const kilogo = []
    const hibas = []
    for (const m of menupontok) {
      await menu(p, m, mobil)
      if (await kilog(p) > 1) kilogo.push(m)
      if (await lathatoHiba(p) > 0) hibas.push(m)
      if (m === 'Időpontok' && !mobil) {
        for (const n of ['Hét', 'Hónap', 'Nap']) {
          await p.locator('.nezetvalto button').filter({ hasText: new RegExp(`^${n}$`) }).first().click()
          await p.waitForTimeout(1200)
          if (await kilog(p) > 1) kilogo.push(`${m}/${n}`)
        }
      }
    }
    ok(`${email.split('@')[0]}, ${nev}: nincs vízszintes kilógás`, [], kilogo)
    ok(`${email.split('@')[0]}, ${nev}: nincs hibaüzenet az oldalakon`, [], hibas)
    ok(`${email.split('@')[0]}, ${nev}: nincs JS vagy konzol hiba`, [], hibak)
    await ctx.close()
  }
}

console.log('\n=== 2) Beállítások: a fülváltás nem dobja el a beírt időt ===\n')
{
  const { ctx, p } = await oldal()
  await belep(p, 'tulaj@mosathat.hu')
  await menu(p, 'Beállítások')
  const mezo = p.locator('input[aria-label="Hétfő nyitás"]')
  await mezo.fill('07:45')
  await p.locator('.fulek button').filter({ hasText: 'Általános' }).click(); await p.waitForTimeout(500)
  ok('a másik fülön csak egy mentés gomb látszik a fejlécben', true,
    (await p.locator('.fej-mentes button').count()) <= 1)
  await p.locator('.fulek button').filter({ hasText: 'Nyitvatartás' }).click(); await p.waitForTimeout(500)
  ok('visszaváltva megmaradt a beírt 07:45', '07:45', await mezo.inputValue())

  console.log('\n=== 3) Áttekintés: a nap gombja a napi nézetet nyitja ===\n')
  await menu(p, 'Időpontok')
  await p.locator('.nezetvalto button').filter({ hasText: /^Hét$/ }).first().click(); await p.waitForTimeout(1000)
  await menu(p, 'Áttekintés')
  await p.locator('.meter-nap').first().click(); await p.waitForTimeout(1500)
  ok('napi nézet nyílt (nem a heti)', 'Nap',
    (await p.locator('.nezetvalto button[aria-pressed="true"]').first().innerText()).trim())

  console.log('\n=== 4) Új időpont: Esc a rendszám-találatoknál csak a listát zárja ===\n')
  await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click(); await p.waitForTimeout(1500)
  await p.locator('#rendszam').fill('A'); await p.waitForTimeout(900)
  ok('van találati lista', true, (await p.locator('.talalatlista').count()) > 0)
  await p.locator('#rendszam').press('Escape'); await p.waitForTimeout(400)
  ok('Esc után: a lista eltűnt, az űrlap nyitva', [0, 1],
    [await p.locator('.talalatlista').count(), await p.locator('dialog[aria-label="Új időpont"]').count()])
  await p.locator('#rendszam').press('Escape'); await p.waitForTimeout(400)
  ok('második Esc: az űrlap bezárul', 0, await p.locator('dialog[aria-label="Új időpont"]').count())

  console.log('\n=== 5) Ügyfélszerkesztési jog: az alkalmazott szerkesztheti a cégeket ===\n')
  await menu(p, 'Felhasználók')
  const kapcsolo = p.getByRole('switch', { name: /Alkalmazott: ügyfelek szerkesztése/ })
  if ((await kapcsolo.getAttribute('aria-checked')) !== 'true') await kapcsolo.click()
  await p.waitForTimeout(1200)
  await p.locator('.ki').filter({ hasText: 'Kilépés' }).click(); await p.waitForTimeout(1200)
  await belep(p, 'alkalmazott@mosathat.hu')
  await menu(p, 'Cégek és bérletesek')
  ok('a jogosult alkalmazottnak van „+ Új szerződés" gombja', 1,
    await p.getByRole('button', { name: '+ Új szerződés' }).count())
  await ctx.close()
}

console.log('\n=== 6) Flotta: idő írható, a sorrend megmarad, a Szerkesztés a jó autóé ===\n')
{
  const { ctx, p } = await oldal()
  await belep(p, 'tulaj@mosathat.hu')
  await menu(p, 'Cégek és bérletesek')
  const kartya = p.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).first()
  await kartya.locator('.kartya-nyito').click(); await p.waitForTimeout(300)
  await kartya.getByRole('button', { name: 'Szerkesztés' }).click(); await p.waitForTimeout(800)
  const urlap = p.locator('[aria-label="Szerződés"]')
  await urlap.getByRole('switch', { name: 'Flottás autók' }).click()
  await urlap.getByRole('button', { name: 'Mentés' }).click(); await p.waitForTimeout(1500)

  await menu(p, 'Időpontok')
  await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click(); await p.waitForTimeout(1500)
  const lap = p.locator('dialog[aria-label="Új időpont"]')
  await p.locator('#nev').fill('Flotta Feri')
  await p.locator('#tel').fill('+36301239876')
  await p.locator('#ceg').fill('Autó Tr'); await p.waitForTimeout(700)
  await p.locator('.ceg-kereso .talalatsor').first().click(); await p.waitForTimeout(1200)
  const gomb = lap.getByRole('button', { name: '+ Autó hozzáadása' })
  await gomb.click(); await gomb.click(); await gomb.click(); await p.waitForTimeout(500)
  await lap.locator('#vegso').fill('17:00')
  await lap.getByRole('button', { name: '3 autó rögzítése' }).click(); await p.waitForTimeout(2500)

  const sorrend = () => p.evaluate(() => [...document.querySelectorAll('.napi-lista > .sor-elem')]
    .map((e) => (e.querySelector('.flotta-kartya') ? 'FLOTTA' : 'egyéb')))
  const elotte = await sorrend()
  ok('a flottakártya a lista elején', 'FLOTTA', elotte[0])
  await p.locator('.napi-lista > .sor-elem').nth(1).locator('.fogo').focus()
  await p.keyboard.press('ArrowUp'); await p.waitForTimeout(1500)
  ok('felfelé nyíl: egy másik kártya került elé', ['egyéb', 'FLOTTA'], (await sorrend()).slice(0, 2))
  ok('a fogantyún marad a fókusz', true, await p.evaluate(() => document.activeElement?.classList.contains('fogo')))
  await menu(p, 'Ügyfelek'); await menu(p, 'Időpontok')
  ok('újratöltés után is a második helyen a flotta (nem ugrik az elejére)', ['egyéb', 'FLOTTA'], (await sorrend()).slice(0, 2))

  const fk = p.locator('.napi-lista .flotta-kartya').first()
  await fk.getByRole('button', { name: 'Autók' }).click(); await p.waitForTimeout(1500)
  const ml = p.locator('[aria-label="Flottás csoport"]')
  const ido = ml.locator('input[aria-label="Végső időpont"]')
  await ido.fill('15:30'); await ido.press('Tab'); await p.waitForTimeout(1800)
  await ml.locator('.lap-fej .bezar').click(); await p.waitForTimeout(1200)
  await fk.getByRole('button', { name: 'Autók' }).click(); await p.waitForTimeout(1500)
  ok('asztali gépen a „Kész legyen" idő átírható és elmentődik', '15:30',
    await ml.locator('input[aria-label="Végső időpont"]').inputValue())

  await ml.locator('.flotta-sor').nth(1).getByRole('button', { name: 'Részletek' }).click(); await p.waitForTimeout(1500)
  await p.locator('dialog[aria-label="Munkalap"]').getByRole('button', { name: 'Szerkesztés' }).click()
  await p.waitForTimeout(2000)
  const modosit = p.locator('dialog[aria-label="Időpont módosítása"]')
  ok('megnyílt a módosító űrlap', 1, await modosit.count())
  await modosit.locator('.szakasz').filter({ hasText: 'Megjegyzés' }).locator('textarea').fill('csak a második autó')
  await modosit.getByRole('button', { name: 'Módosítás mentése' }).click(); await p.waitForTimeout(2500)
  if (await ml.count() === 0) {
    await fk.getByRole('button', { name: 'Autók' }).click(); await p.waitForTimeout(1500)
  }
  const megj = async (i) => {
    await ml.locator('.flotta-sor').nth(i).getByRole('button', { name: 'Részletek' }).click(); await p.waitForTimeout(1500)
    const v = await p.locator('dialog[aria-label="Munkalap"] .szakasz').filter({ hasText: 'Megjegyzés' }).locator('textarea').inputValue()
    await p.keyboard.press('Escape'); await p.waitForTimeout(700)
    return v
  }
  ok('a megjegyzés a 2. autóé lett, az 1. autóé üres', ['', 'csak a második autó'], [await megj(0), await megj(1)])
  await ctx.close()
}

console.log('\n=== 7) Online kérés munkalapja: Elutasít, utána Mégis jön ===\n')
{
  const { ctx, p } = await oldal()
  await belep(p, 'demo@mosathat.hu')
  await menu(p, 'Időpontfoglalás')
  const m = p.locator('.fogl')
  await m.locator('.fogl-valaszto button').filter({ hasText: 'Személyautó' }).click()
  await m.locator('.fogl-csomag', { has: p.locator('.nev', { hasText: /^Premium$/ }) }).click(); await p.waitForTimeout(800)
  await m.locator('.fogl-valaszto button').filter({ hasText: 'Itt hagyom' }).click(); await p.waitForTimeout(3500)
  await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await p.waitForTimeout(600)
  await m.locator('.fogl-idok button').first().click(); await p.waitForTimeout(300)
  await p.fill('#fo-nev', 'Kérő Kata')
  await p.fill('#fo-tel', '+36 30 999 1122')
  await p.fill('#fo-rsz', 'KRS-001')
  await m.locator('.fogl-feltetel input').check()
  await m.getByRole('button', { name: 'Foglalási kérés küldése' }).click(); await p.waitForTimeout(2000)
  await m.getByRole('button', { name: 'Megnézem a napi nézetben' }).click(); await p.waitForTimeout(2500)
  await p.locator('.napi-lista .kartya').filter({ hasText: 'KRS-001' }).first().locator('.kartya-nyit').click()
  await p.waitForTimeout(1500)
  const lab = p.locator('dialog[aria-label="Munkalap"] .munkalap-lab')
  const gombok = async () => (await lab.locator('.gombok button').allInnerTexts()).map((x) => x.trim())
  const kerdes = await gombok()
  ok('kérésnél: Elutasít van, Törlés és Nem fért be nincs', [true, false, false],
    [kerdes.includes('Elutasít'), kerdes.includes('Törlés'), kerdes.includes('Nem fért be')])
  await lab.getByRole('button', { name: 'Elutasít' }).click(); await p.waitForTimeout(400)
  await p.locator('.kerdes-gombok button').filter({ hasText: 'Elutasít' }).click(); await p.waitForTimeout(1800)
  const utana = await gombok()
  ok('elutasítva: Mégis jön van, Törlés nincs', [true, false], [utana.includes('Mégis jön'), utana.includes('Törlés')])
  await ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
