import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
async function belep(p) {
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
}

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(p)
await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(500)
await p.locator('.fiok button').filter({ hasText: 'Időpontok' }).first().click()
await p.waitForTimeout(2200)

console.log('=== 1) nap nézet: rendszám a leghangsúlyosabb ===\n')
{
  const r = await p.evaluate(() => {
    const k = document.querySelector('.kartya')
    const cs = (s) => { const e = k.querySelector(s); return e ? getComputedStyle(e) : null }
    const rs = cs('.rendszam'), id = cs('.ido')
    return {
      rendszamMeret: rs.fontSize, rendszamVastag: rs.fontWeight,
      idoMeret: id.fontSize, idoVastag: id.fontWeight, idoSzin: id.color,
      elso: k.querySelector('.kartya-felso').firstElementChild.className,
      hv: [...document.querySelectorAll('.kartya')]
        .filter((x) => x.innerText.includes('H-V')).length,
    }
  })
  ok('a rendszám áll elöl', 'rendszam', r.elso)
  ok('a rendszám nagyobb az időpontnál', true,
    parseFloat(r.rendszamMeret) > parseFloat(r.idoMeret))
  ok('a rendszám vastagabb', true, Number(r.rendszamVastag) >= Number(r.idoVastag))
  console.log(`         rendszám ${r.rendszamMeret}/${r.rendszamVastag}, idő ${r.idoMeret}/${r.idoVastag} ${r.idoSzin}`)
  console.log(`         H-V címkés kártya: ${r.hv}`)
}
await p.screenshot({ path: '/tmp/e-nap.png' })

console.log('\n=== 2) új időpont: sorrend, kereső, oldalirány ===\n')
await p.locator('.fab').click(); await p.waitForTimeout(2500)
{
  const r = await p.evaluate(() => {
    const t = document.querySelector('.lap-torzs')
    const cs = getComputedStyle(t)
    return {
      szakaszok: [...t.querySelectorAll('.szakasz > .fej')].map((e) => e.innerText.split('\n')[0].trim()),
      elsoMezo: document.activeElement?.id,
      sw: t.scrollWidth, cw: t.clientWidth, ox: cs.overflowX, touch: cs.touchAction,
      keresoDoboz: t.innerText.includes('Rendszám, név vagy cég'),
    }
  })
  console.log(`         szakaszok: ${JSON.stringify(r.szakaszok)}`)
  ok('nincs külön kereső doboz', false, r.keresoDoboz)
  ok('vízszintesen nem görgethető', 'hidden', r.ox)
  ok('ujjal csak fel-le', 'pan-y', r.touch)
  ok('a doboz nem szélesebb a képernyőnél', true, r.sw <= r.cw + 1)
}

await p.locator('#rendszam').fill('LM')
await p.waitForTimeout(900)
{
  const n = await p.locator('.talalatlista .talalatsor').count()
  ok('a rendszám mező keres', true, n > 0)
  await p.screenshot({ path: '/tmp/e-kereso.png' })
  if (n > 0) {
    await p.locator('.talalatlista .talalatsor').first().click()
    await p.waitForTimeout(800)
    const r = await p.evaluate(() => ({
      rendszam: document.querySelector('#rendszam').value,
      nev: document.querySelector('#nev').value,
      tel: document.querySelector('#tel').value,
      lista: document.querySelectorAll('.talalatlista').length,
    }))
    ok('a találat kitölti a rendszámot', true, r.rendszam.length > 0)
    ok('és a nevet', true, r.nev.length > 0)
    ok('és a telefonszámot', true, r.tel.length > 0)
    ok('a lista bezárult', 0, r.lista)
  }
}
await p.locator('#nev').fill('Nagy')
await p.waitForTimeout(900)
ok('a név mező is keres', true, (await p.locator('.talalatlista .talalatsor').count()) > 0)
await p.screenshot({ path: '/tmp/e-uj.png' })
await ctx.close()

const ctx2 = await b.newContext({ viewport: { width: 1440, height: 950 } })
const p2 = await ctx2.newPage()
p2.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(p2)
console.log('\n=== 3) árlista oszlopnév ===\n')
await p2.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).first().click()
await p2.waitForTimeout(2200)
await p2.locator('.arlista-gombok button').filter({ visible: true }).first().click()
await p2.waitForTimeout(1500)
{
  const fejek = await p2.evaluate(() =>
    [...document.querySelectorAll('.arpanel-torzs table.arlista thead th')].map((e) => e.innerText.trim()))
  console.log(`         oszlopok: ${JSON.stringify(fejek)}`)
  ok('az utolsó oszlop Full Service', 'FULL SERVICE', fejek[fejek.length - 1].toUpperCase())
}
await p2.screenshot({ path: '/tmp/e-arlista.png' })
await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
