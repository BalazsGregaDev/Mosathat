import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { tesztelo, GYOKER } from './_db.mjs'

const F = join(GYOKER, 'supabase', 'functions', '_shared')
const { visszaigazolasLevel, keszLevel } = await import(join(F, 'sablon.ts'))
const { sorFeldolgozas } = await import(join(F, 'sor.ts'))
const { resendKuldes } = await import(join(F, 'resend.ts'))
const { ujToken, TOKEN_MINTA, foglalasLink } = await import(join(F, 'token.ts'))

const t = tesztelo()
const kimenet = process.argv[2] ?? null

const UZLET = { nev: 'Mosathat', telefon: '+36 1 506 0420', cim: '1138 Budapest, Váci út 140. (ONE Forty)' }
const LINK = 'https://mosathat.vercel.app/foglalas/0123456789abcdef0123456789abcdef'
const foglalas = {
  id: '11111111-1111-4111-8111-111111111111',
  service_date: '2026-10-21', booking_type: 'LEADOS', status: 'CONFIRMED',
  start_at: null, drop_off_at: '2026-10-21T07:00:00Z', pick_up_at: '2026-10-21T11:00:00Z',
  planned_duration_minutes: 150, scope: 'TELJES', full_service: false, full_service_nev: null,
  estimated_price_huf: 29990, notes: 'Kutyaszőr hátul <script>alert(1)</script>',
  customer_name: 'Levél Lili', plate_raw: 'lev-670', brand: 'Skoda', model: 'Octavia',
  category: 'SZEMELYAUTO', package_name: 'Premium', extras_summary: 'Motormosás, Ózonos kezelés',
}
const allapot = (x = {}) => ({
  allapot: 'LEMONDHATO', statusz: 'CONFIRMED', kezdes: '2026-10-21T07:00:00Z',
  hatarido: '2026-10-20T07:00:00Z', lemondas_ora: 24, lemondva: null, foglalas, ...x,
})
const MOST = new Date('2026-10-12T08:00:00Z')
const rag = (s) => /\d:\d\d[-\u2011]/.test(s)

console.log('=== 1) Visszaigazoló levél: egy link a foglalás oldalára ===\n')
const level = visszaigazolasLevel('lili@pelda.hu', allapot(), LINK, UZLET, { most: MOST })
t.ok('tárgy: nap és hozás ideje', 'Foglalás visszaigazolva: okt. 21., szerda 9:00', level.targy)
t.ok('megszólítás teljes névvel', true, level.html.includes('Kedves Levél Lili!'))
t.ok('hozás és elkészülés helyi időben, rag nélkül', ['9:00', '13:00'],
  [level.szoveg.match(/Hozd az autót: (.*)/)[1], level.szoveg.match(/Elkészül: (.*)/)[1]])
t.ok('idő után nincs rag sehol', false, rag(level.html + level.szoveg))
t.ok('rendszám nagybetűvel, autóval', true, level.html.includes('LEV-670 · Skoda Octavia'))
t.ok('extrák és ár', [true, true], [level.html.includes('Motormosás, Ózonos kezelés'), level.html.includes('29\u00a0990 Ft')])
t.ok('a beírt szöveg nem futtatható kód', [false, true],
  [level.html.includes('<script>'), level.html.includes('&lt;script&gt;')])
t.ok('egyetlen gomb, a foglalás oldalára', [1, true],
  [(level.html.match(/<a href="https:\/\/mosathat/g) ?? []).length, level.html.includes(`href="${LINK}"`)])
t.ok('nincs külön lemondó gomb', false, level.html.includes('Foglalás lemondása'))
t.ok('a gomb felirata', true, level.html.includes('>Foglalásom megnyitása</a>'))
t.ok('a módosítás lehetősége és a lemondási határidő', [true, true],
  [level.szoveg.includes('ott megírhatod, nem kell telefonálnod'), level.szoveg.includes('Lemondási határidő: okt. 20., kedd 9:00, addig ott le is mondhatod.')])
t.ok('a szöveges változatban a link', true, level.szoveg.includes(`Foglalásom megnyitása: ${LINK}`))

const kesoi = visszaigazolasLevel('lili@pelda.hu', allapot({ hatarido: '2026-10-11T07:00:00Z' }), LINK, UZLET, { most: MOST })
t.ok('lejárt határidő: lemondás csak telefonon, a gomb marad', [true, true],
  [kesoi.szoveg.includes('Lemondani már csak telefonon tudod: +36 1 506 0420.'), kesoi.html.includes(`href="${LINK}"`)])

const ceges = visszaigazolasLevel('c@pelda.hu', allapot(), LINK, UZLET, { most: MOST, ceges: true })
t.ok('céges foglalásnál nincs ár és ármegjegyzés', [false, false],
  [ceges.szoveg.includes('Becsült ár'), ceges.szoveg.includes('látatlanban')])

const hv = visszaigazolasLevel('h@pelda.hu', allapot({ foglalas: { ...foglalas, booking_type: 'HOZOMVISZEM' } }), LINK, UZLET, { most: MOST })
t.ok('hozom-viszem: érte megyünk, visszavisszük', ['9:00', '13:00'],
  [hv.szoveg.match(/Érte megyünk: (.*)/)[1], hv.szoveg.match(/Visszavisszük: (.*)/)[1]])

const angol = visszaigazolasLevel('en@pelda.hu', allapot(), LINK, UZLET, { most: MOST, nyelv: 'en' })
t.ok('angolul foglalt: angol levél', [true, true, true],
  [angol.targy.startsWith('Booking confirmed:'), angol.html.includes('lang="en"'), angol.html.includes('>Open my booking</a>')])
t.ok('angol sorok', [true, true], [angol.szoveg.includes('Drop-off: 09:00') || angol.szoveg.includes('Drop-off: 9:00'), angol.szoveg.includes('Estimated price')])
t.ok('angolul nincs magyar szöveg', false, /Kedves|Becsült|Lemondási/.test(angol.szoveg))

console.log('\n=== 2) Elkészült levél ===\n')
const oldal = {
  allapot: 'KESZ', nyelv: 'hu', nev: 'Levél Lili', ceges: false,
  most: { rendszam: 'LEV-670', marka: 'Skoda', modell: 'Octavia', csomag: 'Premium' },
  ar: { becsult: 29990, vegleges: 32990, felar_indok: 'Erősen kutyaszőrös belső', kimaradt: null, kimaradt_huf: null },
  kesz_ig: '2026-10-21T15:00:00Z',
}
const kesz = keszLevel('lili@pelda.hu', oldal, LINK, UZLET)
t.ok('tárgy a rendszámmal', 'Elkészült az autód: LEV-670', kesz.targy)
t.ok('átvehető legkésőbb, rag nélkül', 'okt. 21., szerda 17:00', kesz.szoveg.match(/Átvehető legkésőbb: (.*)/)[1])
t.ok('végösszeg és a felár oka', [true, true],
  [kesz.szoveg.includes('Végösszeg: 32\u00a0990 Ft'), kesz.szoveg.includes('A felár oka: Erősen kutyaszőrös belső')])
t.ok('cím és telefon', [true, true], [kesz.szoveg.includes('Itt veheted át: 1138 Budapest, Váci út 140.'), kesz.szoveg.includes('+36 1 506 0420')])
t.ok('gomb a foglalás oldalára', true, kesz.html.includes(`href="${LINK}"`))
t.ok('idő után nincs rag', false, rag(kesz.html + kesz.szoveg))
const keszCeges = keszLevel('c@pelda.hu', { ...oldal, ceges: true, ar: null }, LINK, UZLET)
t.ok('céges: nincs ár', false, keszCeges.szoveg.includes('Végösszeg'))
const keszEn = keszLevel('en@pelda.hu', { ...oldal, nyelv: 'en' }, LINK, UZLET)
t.ok('angolul', ['Your car is ready: LEV-670', true], [keszEn.targy, keszEn.szoveg.includes('Collect by:')])

if (kimenet) {
  await mkdir(kimenet, { recursive: true })
  await writeFile(join(kimenet, 'visszaigazolas.html'), level.html)
  await writeFile(join(kimenet, 'visszaigazolas-en.html'), angol.html)
  await writeFile(join(kimenet, 'elkeszult.html'), kesz.html)
  console.log(`\n   (mentve: ${kimenet})`)
}

console.log('\n=== 3) Linkek ===\n')
t.ok('a foglalás oldala a beállított cím mellett', LINK,
  foglalasLink('https://mosathat.vercel.app/lemondas', '0123456789abcdef0123456789abcdef'))
t.ok('a régi lemondó kulcs is működik még', true, TOKEN_MINTA.test(ujToken()))

console.log('\n=== 4) Küldési sor ===\n')
const naplo = []
const tetel = (x) => ({ link: '0123456789abcdef0123456789abcdef', nyelv: 'hu', lemondas: allapot(), oldal, ...x })
const elkuldott = []
const e = await sorFeldolgozas({
  atvesz: async () => [
    tetel({ id: 'n1', kind: 'BOOKING_CONFIRMED', to: 'lili@pelda.hu' }),
    tetel({ id: 'n2', kind: 'CAR_READY', to: 'lili@pelda.hu' }),
    tetel({ id: 'n3', kind: 'BOOKING_CONFIRMED', to: 'rossz@pelda.hu' }),
    tetel({ id: 'n4', kind: 'CAR_READY', to: 'torolt@pelda.hu', link: null }),
  ],
  eredmeny: async (id, ok, azon, hiba) => { naplo.push([id, ok, azon, hiba]) },
  kuld: async (l) => {
    if (l.cimzett === 'rossz@pelda.hu') throw new Error('Resend 422: Invalid `to` field')
    elkuldott.push(l)
    return `resend-${elkuldott.length}`
  },
  oldalAlap: 'https://mosathat.vercel.app/lemondas',
  uzlet: UZLET,
})
t.ok('kettő elment, kettő hibás', [2, 2], [e.kuldve, e.hibas])
t.ok('a két levél tárgya', ['Foglalás visszaigazolva: okt. 21., szerda 9:00', 'Elkészült az autód: LEV-670'], elkuldott.map((l) => l.targy))
t.ok('mindkettőben a foglalás oldala', [true, true], elkuldott.map((l) => l.html.includes(`href="${LINK}"`)))
t.ok('az eredmény mindegyiknél rögzítve', [['n1', true], ['n2', true], ['n3', false], ['n4', false]], naplo.map((x) => [x[0], x[1]]))

console.log('\n=== 5) Resend hívás ===\n')
let keres = null
const azon = await resendKuldes({ kulcs: 're_teszt', felado: 'Mosathat <foglalas@mosathat.hu>', valaszCim: 'info@mosathat.hu' },
  level, async (url, opciok) => {
    keres = { url, opciok, test: JSON.parse(opciok.body) }
    return new Response(JSON.stringify({ id: 'abc-123' }), { status: 200 })
  })
t.ok('a Resend azonosítót adja vissza', 'abc-123', azon)
t.ok('feladó, címzett, válaszcím', ['Mosathat <foglalas@mosathat.hu>', ['lili@pelda.hu'], 'info@mosathat.hu'],
  [keres.test.from, keres.test.to, keres.test.reply_to])
const hiba = await resendKuldes({ kulcs: 'x', felado: 'x', valaszCim: null }, level,
  async () => new Response(JSON.stringify({ message: 'The mosathat.hu domain is not verified.' }), { status: 403 }))
  .then(() => null, (err) => err.message)
t.ok('a Resend hibaüzenete továbbmegy', 'Resend 403: The mosathat.hu domain is not verified.', hiba)

t.vege()
