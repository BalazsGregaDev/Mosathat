// v55: a beosztás számítása (src/lib/beosztas.ts), böngésző nélkül.
import { build } from 'esbuild'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const dir = await mkdtemp(join(tmpdir(), 'v55-'))
await build({ entryPoints: ['src/lib/beosztas.ts'], outfile: join(dir, 'b.mjs'), format: 'esm', bundle: true, logLevel: 'error' })
const { beoszt, beferMeg, negyedekbol, munkakNapra } = await import(join(dir, 'b.mjs'))

const o = (h, m = 0) => h * 60 + m
/** negyedórák tol–ig között, n hellyel */
const nap = (tol, ig, n = 2) => {
  const k = []
  for (let t = tol; t < ig; t += 15) k.push({ tol: t, ig: t + 15, helyek: typeof n === 'function' ? n(t) : n })
  return k
}
const M = (id, fajta, tol, hatarido, perc, x = {}) => ({ id, cimke: id, fajta, tol, hatarido, perc, ...x })

console.log('=== 1) fix + rugalmas, két hely ===\n')
{
  const e = beoszt(nap(o(8), o(12)), [M('FIX', 'FIX', o(9), 0, 120), M('R', 'RUGALMAS', o(8), o(12), 180)])
  ok('a rugalmas kész 11:00-ra', o(11), e.kesz.get('R'))
  ok('nincs csúszás, nincs maradék', [0, 0], [e.keses.size, e.maradt.size])
  const fix = e.darabok.filter((d) => d.id === 'FIX')
  ok('a fix a helyén: 9:00–11:00, egy darabban', [[o(9), o(11)]], fix.map((d) => [d.tol, d.ig]))
}

console.log('\n=== 2) félbehagyás: egy hely, megvárós jön ===\n')
{
  const e = beoszt(nap(o(8), o(13), 1), [M('R', 'RUGALMAS', o(8), o(13), 180), M('FIX', 'FIX', o(9), 0, 60)])
  const r = e.darabok.filter((d) => d.id === 'R').map((d) => [d.tol, d.ig])
  ok('a rugalmas félrerakva a megvárós idejére, utána folytatva', [[o(8), o(9)], [o(10), o(12)]], r)
  ok('kész 12:00-ra', o(12), e.kesz.get('R'))
}

console.log('\n=== 3) előbb, aminek előbb kell elkészülnie ===\n')
{
  const e = beoszt(nap(o(8), o(12), 1), [M('KESOBBI', 'RUGALMAS', o(8), o(12), 60), M('KORAI', 'RUGALMAS', o(8), o(9), 60)])
  ok('a 9-re kellő az első', [o(9), o(10)], [e.kesz.get('KORAI'), e.kesz.get('KESOBBI')])
}

console.log('\n=== 4) ami nem fér be: csúszás, maradék ===\n')
{
  const e = beoszt(nap(o(8), o(10), 1), [M('A', 'RUGALMAS', o(8), o(9), 90), M('B', 'RUGALMAS', o(8), o(10), 60)])
  ok('A 30 percet csúszik', 30, e.keses.get('A'))
  ok('B-ből 30 perc nem fér bele a napba', 30, e.maradt.get('B'))
  const t = beoszt(nap(o(8), o(10), 1), [M('F1', 'FIX', o(8), 0, 60), M('F2', 'FIX', o(8), 0, 60)])
  ok('két fix egy helyre: túlfoglalt', true, t.tulfoglalt.length === 4 && t.sorok === 2)
}

console.log('\n=== 5) hány Start fér még be ===\n')
ok('üres nap, 2 hely, 8 óra, 90 perces Start: 10', 10, beferMeg(nap(o(8), o(16)), [], 90))
ok('egy 6 órás munkával: 6', 6, beferMeg(nap(o(8), o(16)), [M('X', 'RUGALMAS', o(8), o(16), 360)], 90))
// (4 óra × 2 hely: helyenként kettő; az ötödikhez a két hely egyidejű maradéka
// nem elég — óvatos számítás)
ok('mostantól (12:00): 4', 4, beferMeg(nap(o(8), o(16)), [], 90, o(12)))
ok('egy emberrel (1 hely): 5', 5, beferMeg(nap(o(8), o(16), 1), [], 90))
ok('a kérdőjeles nem foglal (a sor végén van)... de a próbaautók utána jönnek', true,
  beferMeg(nap(o(8), o(16)), [M('Q', 'RUGALMAS', o(8), o(16), 120, { kerdojeles: true })], 90) >= 8)

console.log('\n=== 6) szünet, foglalásokból munkák ===\n')
{
  const n = negyedekbol([{ starts: '11:45:00', ends: '12:00:00', lanes: 2 }, { starts: '12:30:00', ends: '12:45:00', lanes: 2 }])
  ok('a szünet helye üres negyedórákkal kitöltve', [[705, 720, 2], [720, 735, 0], [735, 750, 0], [750, 765, 2]],
    n.map((x) => [x.tol, x.ig, x.helyek]))
  const ma = '2026-10-08'
  const f = (x) => ({ status: 'CONFIRMED', booking_type: 'LEADOS', service_date: ma, last_day: ma,
    start_at: null, drop_off_at: null, pick_up_at: null, deadline_at: null, planned_duration_minutes: 60, ...x })
  const { munkak, idoNelkul } = munkakNapra([
    f({ id: 'V', booking_type: 'VAROS', start_at: '2026-10-08T07:00:00Z' }),          // 9:00 Budapest
    f({ id: 'L', drop_off_at: '2026-10-08T06:00:00Z', pick_up_at: '2026-10-08T13:00:00Z' }),
    f({ id: 'T', service_date: '2026-10-07', last_day: '2026-10-09', napi_perc: 100 }),
    f({ id: 'X', status: 'CANCELLED_BY_CUSTOMER' }),
    f({ id: 'Z', planned_duration_minutes: 0 }),
  ], ma, o(8), o(17), (b) => b.id)
  ok('megvárós: fix 9:00-tól', ['FIX', o(9)], [munkak[0].fajta, munkak[0].tol])
  ok('itt hagyja: 8:00-tól 15:00-ig', ['RUGALMAS', o(8), o(15)], [munkak[1].fajta, munkak[1].tol, munkak[1].hatarido])
  ok('többnapos: a mai része, nyitástól zárásig', ['TOBBNAPOS', 100, o(8), o(17)], [munkak[2].fajta, munkak[2].perc, munkak[2].tol, munkak[2].hatarido])
  ok('a lemondott kimarad, az idő nélküli jelezve', [3, ['Z']], [munkak.length, idoNelkul])
}

console.log('\n=== 7) kész autók (v59): nem fix blokk az érkezéstől a Kész vanig ===\n')
{
  // Öt autó reggel 8:30-kor érkezett, mind 16:00-kor lett „Kész van"-ra
  // nyomva, mindegyik 90 perc munka. Két hely. Ez 7,5 óra munka 2 × 7,5 órán
  // — befér; nem lehet belőle „8 hely" és túlfoglalás.
  const n = nap(o(8), o(17))
  const kesz = [1, 2, 3, 4, 5].map((i) => M(`K${i}`, 'KESZ', o(8, 30), o(16), 90))
  const e = beoszt(n, [...kesz, M('R', 'RUGALMAS', o(8), o(17), 60)])
  ok('két sor marad (nincs túlfoglalás)', [2, 0], [e.sorok, e.tulfoglalt.length])
  ok('a kész autók nem adnak figyelmeztetést', 0,
    [...e.keses.keys(), ...e.maradt.keys()].filter((id) => id.startsWith('K')).length)
  ok('a kész autó darabjai a Kész van ideje előtt', true,
    e.darabok.filter((d) => d.id.startsWith('K')).every((d) => d.ig <= o(16)))
  ok('a rugalmas is elfér', false, e.maradt.has('R'))
  const { munkak } = munkakNapra([
    { id: 'X', status: 'COMPLETED', booking_type: 'LEADOS', service_date: '2026-10-07', last_day: '2026-10-08',
      start_at: null, drop_off_at: '2026-10-07T14:00:00Z', pick_up_at: '2026-10-08T09:45:00Z', deadline_at: null,
      planned_duration_minutes: 120, napi_perc: 60, kezdve: '2026-10-07T14:00:00Z', befejezve: '2026-10-08T08:00:00Z' },
    { id: 'Y', status: 'READY', booking_type: 'LEADOS', service_date: '2026-10-06', last_day: '2026-10-08',
      start_at: null, drop_off_at: null, pick_up_at: null, deadline_at: null,
      planned_duration_minutes: 120, napi_perc: 0, kezdve: null, befejezve: '2026-10-07T12:00:00Z' },
  ], '2026-10-08', o(8), o(17), (b) => b.id)
  ok('tegnap kezdett, ma 10:00-kor kész többnapos: KESZ 8:00–10:00, 60 perc', [['KESZ', o(8), o(10), 60]],
    munkak.map((m) => [m.fajta, m.tol, m.hatarido, m.perc]))
}

console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
