import { build } from 'esbuild'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}

const dir = await mkdtemp(join(tmpdir(), 'v61-'))
const belepes = join(dir, 'be.ts')
await writeFile(belepes, `
export * from '${join(process.cwd(), 'src/lib/format.ts')}'
export * from '${join(process.cwd(), 'src/lib/befer.ts')}'
export { hetiSavok, hetiSzabadsagok, tobbnaposE } from '${join(process.cwd(), 'src/lib/savok.ts')}'
export { eloE, lemondottE } from '${join(process.cwd(), 'src/lib/types.ts')}'
export { autoNev, flottaCsoportosit } from '${join(process.cwd(), 'src/lib/flotta.ts')}'
`)
await build({ entryPoints: [belepes], outfile: join(dir, 'b.mjs'), format: 'esm', bundle: true, logLevel: 'error' })
const L = await import(join(dir, 'b.mjs'))

console.log('=== 1) Idő- és pénzsegédek ===\n')
ok('percOra: 495 → 8:15, 0 → 0:00', ['8:15', '0:00'], [L.percOra(495), L.percOra(0)])
ok('percIdo: 495 → 08:15', '08:15', L.percIdo(495))
ok('kerekítés: 59,6 perc → 1:00 (nem 0:60), 599,7 → 10:00', ['1:00', '10:00', '01:00'], [L.percOra(59.6), L.percOra(599.7), L.percIdo(59.6)])
ok('idoPercbe: "08:15", "8", "17:30:00"', [495, 480, 1050], [L.idoPercbe('08:15'), L.idoPercbe('8'), L.idoPercbe('17:30:00')])
ok('idoRovid: 0 → 0:00 (nem „0p”), 45 → 0:45, 480 → 8:00', ['0:00', '0:45', '8:00'],
  [L.idoRovid(0), L.idoRovid(45), L.idoRovid(480)])
ok('percEjfeltol: télen és nyáron is budapesti idő', [9 * 60, 9 * 60],
  [L.percEjfeltol('2026-01-15T08:00:00Z'), L.percEjfeltol('2026-07-15T07:00:00Z')])
ok('helyiNap: éjfél után már a budapesti nap', '2026-10-11', L.helyiNap('2026-10-10T22:30:00Z'))
ok('napKulonbseg: óraátállításon át is egész napok', [1, 7, -1],
  [L.napKulonbseg('2026-10-24', '2026-10-25'), L.napKulonbseg('2026-03-25', '2026-04-01'), L.napKulonbseg('2026-10-26', '2026-10-25')])
ok('relativNap: Ma, Tegnap, Holnap a megadott naphoz képest', ['Ma', 'Tegnap', 'Holnap'],
  [L.relativNap('2026-10-09', '2026-10-09'), L.relativNap('2026-10-08', '2026-10-09'), L.relativNap('2026-10-10', '2026-10-09')])
ok('vegOra: kezdés + munkaidő', '10:30', L.vegOra('2026-10-09T07:00:00Z', 90))
ok('hibaSzoveg: Error és szöveg', ['baj', 'x'], [L.hibaSzoveg(new Error('baj')), L.hibaSzoveg('x')])
ok('nettó/bruttó 27%-kal', [10000, 12700], [L.nettobol(12700), L.bruttobol(10000)])
let rossz = 0
for (let ar = 1000; ar <= 200000; ar += 10) {
  for (let pct = 5; pct <= 50; pct += 5) {
    const pontos = Math.round((ar * (100 + pct)) / 100)
    if (L.felarasAr(ar, pct, 0) !== pontos) rossz++
  }
}
ok('felárás ár: 12 990 + 15% = 14 939 (nem 14 938)', 14939, L.felarasAr(12990, 15, 0))
ok('felárás ár: egyik ár/százalék párnál sem csúszik 1 Ft-ot', 0, rossz)
ok('felárás ár: a fix felár egész forintra kerekítve', 12500 + 501, L.felarasAr(12500, 0, 500.6))

console.log('\n=== 2) Foglalási állapotok ===\n')
ok('lemondott: ügyfél, mi, elutasított kérés', [true, true, true, false],
  ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'REJECTED', 'NO_SHOW'].map(L.lemondottE))
ok('élő: nem él a lemondott, elutasított, nem jött el', [true, true, false, false, false],
  ['REQUESTED', 'COMPLETED', 'REJECTED', 'NO_SHOW', 'CANCELLED_BY_SHOP'].map(L.eloE))
ok('flotta: rendszám nélkül sorszám', ['ABC-123', '3. autó'],
  [L.autoNev({ plate_raw: 'abc-123', fleet_index: 1 }), L.autoNev({ plate_raw: '—', fleet_index: 3 })])

console.log('\n=== 3) Heti sávok ===\n')
const fogl = (id, tol, ig, rsz) => ({ id, service_date: tol, last_day: ig, plate_raw: rsz })
const { savok, sorok } = L.hetiSavok([
  fogl('a', '2026-10-05', '2026-10-07', 'AAA'), fogl('b', '2026-10-06', '2026-10-08', 'BBB'),
  fogl('c', '2026-10-08', '2026-10-09', 'CCC'), fogl('d', '2026-10-05', '2026-10-05', 'DDD'),
], '2026-10-05', 5)
ok('egynapos nem kerül sávba, az átfedők két sorba', [3, 2], [savok.length, sorok])
ok('a harmadik visszafér az első sorba', [0, 1, 0], savok.map((s) => s.sor))

console.log('\n=== 4) Befér-e: megvárós autó túlfoglalt negyedórába ===\n')
const negyedek = [{ tol: 540, ig: 555, helyek: 1 }, { tol: 555, ig: 570, helyek: 1 }, { tol: 570, ig: 585, helyek: 1 }]
const ket = [
  { id: 'x', cimke: 'X', fajta: 'FIX', tol: 540, hatarido: 585, perc: 45 },
  { id: 'y', cimke: 'Y', fajta: 'FIX', tol: 540, hatarido: 585, perc: 45 },
]
const uj = { id: '__uj', cimke: 'Új', fajta: 'FIX', tol: 540, hatarido: 585, perc: 45 }
ok('ha már túl van foglalva, a harmadik sem fér be', false, L.ujMunkaEllenoriz(negyedek, ket, uj).befer)
ok('ezért erre a napra kezdést sem ajánl', 0, L.varosKezdesek(negyedek, ket, 45).length)
const reggel = { id: '__uj', cimke: 'Új', fajta: 'RUGALMAS', tol: 480, hatarido: 900, perc: 60 }
const napTeljes = Array.from({ length: 28 }, (_, i) => ({ tol: 480 + i * 15, ig: 495 + i * 15, helyek: 1 }))
const e = L.ujMunkaEllenoriz(napTeljes, [], reggel, 600)
ok('itt hagyós autó: nem kezdődhet a múltban (most 10:00 → kész 11:00)', 660, e.kesz)

console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
