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
const CIM = 'http://localhost:5180'

const FEKVO = { width: 932, height: 430 }
const ALLO = { width: 393, height: 852 }
const ANDROID = { width: 412, height: 915 }

async function oldal(utvonal, viewport, { mobil = false, insets = null, regi = false } = {}) {
  const ctx = await b.newContext({ viewport, isMobile: mobil, hasTouch: mobil, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
  if (insets) {
    const s = await ctx.newCDPSession(p)
    await s.send('Emulation.setSafeAreaInsetsOverride', { insets })
  }
  await p.goto(CIM + utvonal)
  await p.locator('.kv-lab').waitFor({ timeout: 60000 })
  if (utvonal === '/publikus') await p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 20000 })
  await p.evaluate(() => document.fonts.ready)
  if (regi) {
    await p.addStyleTag({ content: '.pub-keret .kv[data-k] > .kv-lab { padding-bottom: 18px !important; }' })
  }
  return { ctx, p, hibak }
}

const doboz = (p, sel) => p.locator(sel).first().evaluate((e) => {
  const r = e.getBoundingClientRect()
  return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), width: Math.round(r.width) }
})
const lapAlja = (p) => p.evaluate(() => document.documentElement.scrollHeight)
const vizszintesGorgetes = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth)
const szoveg = (p, sel) => p.locator(sel).first().evaluate((e) => {
  const t = document.createRange()
  t.selectNodeContents(e)
  const r = t.getBoundingClientRect()
  return { left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom + scrollY) }
})

async function kijelzo(p, { sziget = null, sarok = 0 }) {
  await p.evaluate(({ sziget, sarok }) => {
    document.getElementById('teszt-kijelzo')?.remove()
    const k = document.createElement('div')
    k.id = 'teszt-kijelzo'
    k.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999'
    if (sziget) {
      const s = document.createElement('div')
      s.style.cssText = `position:absolute;left:11px;top:50%;width:37px;height:${sziget}px;margin-top:-${sziget / 2}px;border-radius:19px;background:#000`
      k.appendChild(s)
    }
    if (sarok) {
      for (const [x, y, kx, ky] of [['left', 'top', '100%', '100%'], ['right', 'top', '0', '100%'], ['left', 'bottom', '100%', '0'], ['right', 'bottom', '0', '0']]) {
        const c = document.createElement('div')
        c.style.cssText = `position:absolute;${x}:0;${y}:0;width:${sarok}px;height:${sarok}px;background:radial-gradient(circle at ${kx} ${ky}, transparent ${sarok - 0.5}px, #000 ${sarok}px)`
        k.appendChild(c)
      }
    }
    document.body.appendChild(k)
  }, { sziget, sarok })
}

const kep = async (p, nev) => {
  if (!KEPEK) return
  await p.waitForTimeout(150)
  await p.screenshot({ path: join(KEPEK, nev) })
}
const gorget = async (p, y) => { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(250) }
const aljara = async (p) => { await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(250) }

const IPHONE_FEKVO = { left: 59, right: 59, top: 0, bottom: 21 }
const IPHONE_ALLO = { left: 0, right: 0, top: 59, bottom: 34 }

console.log('=== 1) Előtte: fektetett iPhone, a sziget a tartalomra lóg ===\n')
{
  const { ctx, p } = await oldal('/publikus', FEKVO, { mobil: true, regi: true })
  const logo = await szoveg(p, '.kv-nav .kv-logo')
  ok('régi állapot: a logó 24 px-re a széltől, a sziget (11–48 px) kitakarja', 24, logo.left)
  await kijelzo(p, { sziget: 126, sarok: 40 })
  await kep(p, '01-elotte-fekvo-teteje.png')
  const cs = await doboz(p, '.kv-csomagok')
  await gorget(p, cs.top - 90)
  await kep(p, '02-elotte-fekvo-csomagok.png')
  await aljara(p)
  await kep(p, '03-elotte-fekvo-lablec.png')
  await ctx.close()
}

console.log('\n=== 2) Utána: fektetett iPhone (bal 59, jobb 59, alul 21 px biztonsági sáv) ===\n')
{
  const { ctx, p, hibak } = await oldal('/publikus', FEKVO, { mobil: true, insets: IPHONE_FEKVO })
  const tav = 59 + 12
  const bal = async (sel) => (await szoveg(p, sel)).left
  ok('logó: 59 + 12 px-re a bal széltől', tav, await bal('.kv-nav .kv-logo'))
  ok('menü jobb széle: 59 + 12 px-re a jobb széltől', FEKVO.width - tav, (await doboz(p, '.kv-nav nav')).right)
  ok('hero címe és bevezetője', [tav, tav], [await bal('.kv-hero .kv-kicker'), (await doboz(p, '.kv-hero h1')).left])
  const foto = await doboz(p, '.kv-foto')
  ok('borító: mindkét oldalon 71 px', [tav, FEKVO.width - tav], [foto.left, foto.right])
  const cs = await doboz(p, '.kv-csomagok')
  ok('csomagok szakasz tartalma', [tav, tav], [(await doboz(p, '.kv-csomagok h2')).left, (await doboz(p, '.kv-kat')).left])
  ok('táblázat jobb széle nem ér a jobb oldali sávba', true, (await doboz(p, '.kv-tabla')).right <= FEKVO.width - tav)
  ok('foglalás címe és űrlapja', [tav, true], [(await doboz(p, '.kv-foglalas h2')).left, (await doboz(p, '.kv-foglalas-elo .fogl')).right <= FEKVO.width - tav])
  ok('Hol vagyunk és lábléc', [tav, tav], [(await doboz(p, '.kv-hely h2')).left, (await doboz(p, '.kv-lab .kv-logo')).left])
  const menu = await doboz(p, '.kv-nav')
  const vonal = await p.locator('.kv-nav').evaluate((e) => getComputedStyle(e).borderBottomWidth)
  ok('a menü háttere és alsó vonala a kijelző széléig ér', [0, FEKVO.width, '1px'], [menu.left, menu.right, vonal])
  const szakaszVonal = await doboz(p, '.kv-hely')
  ok('a szakaszok elválasztó vonala is a szélig ér', [0, FEKVO.width], [szakaszVonal.left, szakaszVonal.right])
  ok('nincs vízszintes görgetés', false, await vizszintesGorgetes(p))
  const impr = await szoveg(p, '.kv-lab-also nav a')
  const adatv = await szoveg(p, '.kv-lab-also nav a:last-child')
  const alja = await lapAlja(p)
  ok('Impresszum és Adatvédelem: távol a jobb alsó saroktól (≥ 71 px oldalt, ≥ 35 px alul)', [true, true],
     [adatv.right <= FEKVO.width - tav, alja - impr.bottom >= 21 + 14])
  await kijelzo(p, { sziget: 126, sarok: 40 })
  await kep(p, '04-utana-fekvo-teteje.png')
  await gorget(p, cs.top - 90)
  await kep(p, '05-utana-fekvo-csomagok.png')
  const fogl = await doboz(p, '.kv-foglalas')
  await gorget(p, fogl.top - 60)
  await kep(p, '06-utana-fekvo-foglalas.png')
  await aljara(p)
  await kep(p, '07-utana-fekvo-lablec.png')
  ok('nincs futásidejű hiba', [], hibak)
  await ctx.close()
}

console.log('\n=== 3) Fektetve, a sziget a másik oldalon (a telefon 180 fokkal elforgatva) ===\n')
{
  const { ctx, p } = await oldal('/publikus', FEKVO, { mobil: true, insets: IPHONE_FEKVO })
  ok('a jobb oldalon is ugyanakkora a margó', FEKVO.width - 71, (await doboz(p, '.kv-nav nav')).right)
  await p.evaluate(() => {
    const k = document.createElement('div')
    k.style.cssText = 'position:fixed;right:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:19px;background:#000;z-index:99999'
    document.body.appendChild(k)
  })
  await kep(p, '08-utana-fekvo-jobb-sziget.png')
  await ctx.close()
}

console.log('\n=== 4) Álló iPhone: a lábléc a lekerekített sarkoktól és a home-csíktól ===\n')
{
  const { ctx, p } = await oldal('/publikus', ALLO, { mobil: true, insets: IPHONE_ALLO })
  ok('oldalt marad a 16 px (állva nincs oldalsó sáv)', 16, (await szoveg(p, '.kv-nav .kv-logo')).left)
  const pad = await p.locator('.kv-lab').evaluate((e) => getComputedStyle(e).paddingBottom)
  ok('lábléc alsó belső margó: 34 + 18 px', '52px', pad)
  const alja = await lapAlja(p)
  const impr = await szoveg(p, '.kv-lab-also nav a')
  ok('az Impresszum alja legalább 52 px-re a lap aljától', true, alja - impr.bottom >= 52)
  ok('nincs vízszintes görgetés', false, await vizszintesGorgetes(p))
  await aljara(p)
  await kijelzo(p, { sarok: 55 })
  await kep(p, '09-utana-allo-iphone-lablec.png')
  await ctx.close()
}

console.log('\n=== 5) Android, lekerekített kijelző, biztonsági sáv nélkül ===\n')
{
  const elotte = await oldal('/publikus', ANDROID, { mobil: true, regi: true })
  await aljara(elotte.p)
  await kijelzo(elotte.p, { sarok: 44 })
  await kep(elotte.p, '10-elotte-android-lablec.png')
  await elotte.ctx.close()

  const { ctx, p } = await oldal('/publikus', ANDROID, { mobil: true })
  const pad = await p.locator('.kv-lab').evaluate((e) => getComputedStyle(e).paddingBottom)
  ok('érintőképernyőn legalább 36 px marad a lábléc alján', '36px', pad)
  await aljara(p)
  await kijelzo(p, { sarok: 44 })
  await kep(p, '11-utana-android-lablec.png')
  await ctx.close()
}

console.log('\n=== 6) Jogi oldalak fektetett iPhone-on ===\n')
for (const [ut, nev] of [['/impresszum', '12-utana-fekvo-impresszum.png'], ['/adatvedelem', '13-utana-fekvo-adatvedelem.png']]) {
  const { ctx, p, hibak } = await oldal(ut, FEKVO, { mobil: true, insets: IPHONE_FEKVO })
  ok(`${ut}: cím, szöveg és lábléc 71 px-re a széltől`, [71, 71, 71], [
    (await doboz(p, '.kv-jogi h1')).left,
    (await doboz(p, '.kv-jogi p')).left,
    (await doboz(p, '.kv-lab .kv-logo')).left,
  ])
  ok(`${ut}: nincs vízszintes görgetés, nincs hiba`, [false, []], [await vizszintesGorgetes(p), hibak])
  await kijelzo(p, { sziget: 126, sarok: 40 })
  await kep(p, nev)
  await ctx.close()
}

console.log('\n=== 7) Asztali gép: semmi sem változik ===\n')
{
  const { ctx, p } = await oldal('/publikus', { width: 1440, height: 900 })
  const ket = await p.locator('.kv-ketoszlop').evaluate((e) => [getComputedStyle(e).paddingLeft, getComputedStyle(e).paddingRight])
  ok('menü, hero, borító, két oszlop, lábléc: 24 px', [24, 24, 24, ['24px', '24px'], 24], [
    (await szoveg(p, '.kv-nav .kv-logo')).left,
    (await doboz(p, '.kv-hero h1')).left,
    (await doboz(p, '.kv-foto')).left,
    ket,
    (await doboz(p, '.kv-lab .kv-logo')).left,
  ])
  ok('a két oszlopon belül a szakaszok saját margója 0', ['0px', '0px'], await p.locator('.kv-ketoszlop > .kv-csomagok').evaluate((e) => [getComputedStyle(e).paddingLeft, getComputedStyle(e).paddingRight]))
  ok('lábléc alja a régi 18 px', '18px', await p.locator('.kv-lab').evaluate((e) => getComputedStyle(e).paddingBottom))
  await ctx.close()
}

console.log('\n=== 8) Tablet (1024 px, egy oszlop) ===\n')
{
  const { ctx, p } = await oldal('/publikus', { width: 1024, height: 1366 }, { mobil: true, insets: { left: 0, right: 0, top: 24, bottom: 20 } })
  ok('egy oszlopban a csomagok és a foglalás 24 px-es margóval', [24, 24], [
    (await doboz(p, '.kv-csomagok h2')).left,
    (await doboz(p, '.kv-foglalas h2')).left,
  ])
  ok('lábléc alja: max(36, 20 + 18) = 38 px', '38px', await p.locator('.kv-lab').evaluate((e) => getComputedStyle(e).paddingBottom))
  await ctx.close()
}

console.log(`\n${baj ? `${baj} HIBA` : 'MINDEN RENDBEN'}`)
await b.close()
process.exit(baj ? 1 : 0)
