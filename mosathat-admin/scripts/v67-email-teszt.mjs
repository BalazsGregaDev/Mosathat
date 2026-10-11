import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { tesztelo, GYOKER } from './_db.mjs'

const F = join(GYOKER, 'supabase', 'functions', '_shared')
const { visszaigazolasLevel } = await import(join(F, 'sablon.ts'))
const { sorFeldolgozas } = await import(join(F, 'sor.ts'))
const { resendKuldes } = await import(join(F, 'resend.ts'))
const { ujToken, TOKEN_MINTA, lemondoLink } = await import(join(F, 'token.ts'))

const t = tesztelo()
const kimenet = process.argv[2] ?? null

const UZLET = { nev: 'Mosathat', telefon: '+36 1 506 0420', cim: '1138 Budapest, Dagály utca (mélygarázs)' }
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

console.log('=== 1) A visszaigazoló levél ===\n')
const level = visszaigazolasLevel('lili@pelda.hu', allapot(), 'https://admin.mosathat.hu/lemondas?t=ABC', UZLET, MOST)
t.ok('tárgy: nap és hozás ideje', 'Foglalás visszaigazolva: okt. 21., szerda 9:00', level.targy)
t.ok('címzett', 'lili@pelda.hu', level.cimzett)
t.ok('megszólítás teljes névvel', true, level.html.includes('Kedves Levél Lili!'))
t.ok('a nap kiírva', true, level.html.includes('2026. október 21., szerda'))
t.ok('hozás és elkészülés helyi időben, rag nélkül', ['9:00', '13:00'],
  [level.szoveg.match(/Hozd az autót: (.*)/)[1], level.szoveg.match(/Elkészül: (.*)/)[1]])
t.ok('idő után nincs rag sehol', false, /\d:\d\d[-\u2011]/.test(level.html + level.szoveg))
t.ok('rendszám nagybetűvel, autóval', true, level.html.includes('LEV-670 · Skoda Octavia'))
t.ok('szolgáltatás', true, level.html.includes('Premium · Teljes · Személyautó'))
t.ok('extrák és ár', [true, true], [level.html.includes('Motormosás, Ózonos kezelés'), level.html.includes('29\u00a0990 Ft')])
t.ok('a beírt szöveg nem futtatható kód', [false, true],
  [level.html.includes('<script>'), level.html.includes('&lt;script&gt;')])
t.ok('lemondó gomb a linkkel', true, level.html.includes('href="https://admin.mosathat.hu/lemondas?t=ABC"'))
t.ok('a határidő kiírva', true, level.html.includes('Lemondási határidő: okt. 20., kedd 9:00.'))
t.ok('szöveges változat is van, benne a link', [true, true],
  [level.szoveg.includes('Lemondás: https://admin.mosathat.hu/lemondas?t=ABC'), level.szoveg.includes('Becsült ár: 29')])
t.ok('cím és telefon a láblécben', [true, true],
  [level.html.includes('Dagály utca'), level.html.includes('href="tel:+3615060420"')])

const kesoi = visszaigazolasLevel('lili@pelda.hu', allapot({ hatarido: '2026-10-11T07:00:00Z' }), 'https://x/?t=ABC', UZLET, MOST)
t.ok('ha a határidő már elmúlt, nincs lemondó gomb, csak a telefon', [false, true],
  [kesoi.html.includes('Foglalás lemondása'), kesoi.html.includes('kérjük, hívj minket: +36 1 506 0420')])

const varos = visszaigazolasLevel('v@pelda.hu', allapot({
  foglalas: { ...foglalas, booking_type: 'VAROS', start_at: '2026-10-21T08:00:00Z', drop_off_at: null, pick_up_at: null,
    planned_duration_minutes: 90, full_service: true, full_service_nev: 'Full Service (bőr)' },
}), 'https://x/?t=ABC', UZLET, MOST)
t.ok('megvárós: kezdés és várható vége', ['10:00 (megvárod)', '11:30'],
  [varos.szoveg.match(/Kezdés: (.*)/)[1], varos.szoveg.match(/Várható vége: (.*)/)[1]])
t.ok('Full Service a szolgáltatásban', true, varos.html.includes('Premium + Full Service (bőr)'))

const masnap = visszaigazolasLevel('m@pelda.hu', allapot({
  foglalas: { ...foglalas, pick_up_at: '2026-10-22T06:00:00Z' },
}), 'https://x/?t=ABC', UZLET, MOST)
t.ok('másnapi elvitel', 'okt. 22., csütörtök, 8:00', masnap.szoveg.match(/Elviheted: (.*)/)[1])

if (kimenet) {
  await mkdir(kimenet, { recursive: true })
  await writeFile(join(kimenet, 'visszaigazolas.html'), level.html)
  await writeFile(join(kimenet, 'visszaigazolas-kesoi.html'), kesoi.html)
  console.log(`\n   (mentve: ${kimenet})`)
}

console.log('\n=== 2) Lemondó kulcs ===\n')
const k1 = ujToken()
t.ok('43 karakteres, URL-be írható', true, TOKEN_MINTA.test(k1))
t.ok('minden kulcs más', true, k1 !== ujToken())
t.ok('a link a beállított címre mutat', `https://admin.mosathat.hu/lemondas?t=${k1}`, lemondoLink('https://admin.mosathat.hu/lemondas', k1))

console.log('\n=== 3) Küldési sor ===\n')
const naplo = []
const fuggosegek = (kuld) => ({
  atvesz: async () => [
    { id: 'n1', kind: 'BOOKING_CONFIRMED', to: 'lili@pelda.hu', lemondas: allapot() },
    { id: 'n2', kind: 'BOOKING_CONFIRMED', to: 'rossz@pelda.hu', lemondas: allapot() },
  ],
  linkMentes: async (id, token) => { naplo.push(['link', id, TOKEN_MINTA.test(token)]) },
  eredmeny: async (id, ok, azon, hiba) => { naplo.push(['eredmeny', id, ok, azon, hiba]) },
  kuld,
  ujToken,
  lemondasAlap: 'https://admin.mosathat.hu/lemondas',
  uzlet: UZLET,
})
const elkuldott = []
const e = await sorFeldolgozas(fuggosegek(async (l) => {
  if (l.cimzett === 'rossz@pelda.hu') throw new Error('Resend 422: Invalid `to` field')
  elkuldott.push(l)
  return 'resend-1'
}))
t.ok('egy elment, egy hibás', { kuldve: 1, hibas: 1, hibak: ['rossz@pelda.hu: Resend 422: Invalid `to` field'] }, e)
t.ok('mindkettőhöz készült kulcs', [['link', foglalas.id, true], ['link', foglalas.id, true]],
  naplo.filter((x) => x[0] === 'link'))
t.ok('az eredmény mindkettőnél rögzítve', [['eredmeny', 'n1', true, 'resend-1', null],
  ['eredmeny', 'n2', false, null, 'Resend 422: Invalid `to` field']], naplo.filter((x) => x[0] === 'eredmeny'))
t.ok('a levélben a frissen készült kulcs van', true,
  /lemondas\?t=[A-Za-z0-9_-]{43}"/.test(elkuldott[0].html))

console.log('\n=== 4) Resend hívás ===\n')
let keres = null
const azon = await resendKuldes({ kulcs: 're_teszt', felado: 'Mosathat <foglalas@mosathat.hu>', valaszCim: 'info@mosathat.hu' },
  level, async (url, opciok) => {
    keres = { url, opciok, test: JSON.parse(opciok.body) }
    return new Response(JSON.stringify({ id: 'abc-123' }), { status: 200 })
  })
t.ok('a Resend azonosítót adja vissza', 'abc-123', azon)
t.ok('jó végpont, kulcs a fejlécben', ['https://api.resend.com/emails', 'Bearer re_teszt'],
  [keres.url, keres.opciok.headers.Authorization])
t.ok('feladó, címzett, válaszcím', ['Mosathat <foglalas@mosathat.hu>', ['lili@pelda.hu'], 'info@mosathat.hu'],
  [keres.test.from, keres.test.to, keres.test.reply_to])
t.ok('HTML és szöveges változat is megy', [true, true], [keres.test.html.length > 1000, keres.test.text.length > 100])
const hiba = await resendKuldes({ kulcs: 'x', felado: 'x', valaszCim: null }, level,
  async () => new Response(JSON.stringify({ message: 'The mosathat.hu domain is not verified.' }), { status: 403 }))
  .then(() => null, (err) => err.message)
t.ok('a Resend hibaüzenete továbbmegy', 'Resend 403: The mosathat.hu domain is not verified.', hiba)

t.vege()
