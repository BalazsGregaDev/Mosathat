// v56: befér-e számítás (src/lib/befer.ts), böngésző nélkül.
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
const dir = await mkdtemp(join(tmpdir(), 'v56-'))
await build({ entryPoints: ['src/lib/befer.ts'], outfile: join(dir, 'b.mjs'), format: 'esm', bundle: true, logLevel: 'error' })
const { ujMunkaEllenoriz, varosKezdesek, leadosHozasok, napAllapot } = await import(join(dir, 'b.mjs'))

const o = (h, m = 0) => h * 60 + m
const nap = (tol, ig, n = 2) => { const k = []; for (let t = tol; t < ig; t += 15) k.push({ tol: t, ig: t + 15, helyek: n }); return k }
const M = (id, fajta, tol, hatarido, perc) => ({ id, cimke: id, fajta, tol, hatarido, perc })

console.log('=== 1) befér / nem fér be ===\n')
{
  const n = nap(o(8), o(12), 1)
  const munkak = [M('PQR', 'RUGALMAS', o(8), o(11), 120)]
  const jo = ujMunkaEllenoriz(n, munkak, M('UJ', 'RUGALMAS', o(8), o(12), 60))
  ok('egy órás itt hagyós befér', [true, o(11)], [jo.befer, jo.kesz])
  const rossz = ujMunkaEllenoriz(n, munkak, M('UJ', 'FIX', o(9), o(11), 120))
  ok('megvárós 9–11: a PQR csúszna', false, rossz.befer)
  ok('a gond neve: PQR', true, rossz.gondok.some((g) => g.startsWith('PQR')))
}

console.log('\n=== 2) választható időpontok ===\n')
{
  const n = nap(o(8), o(12), 1)
  const munkak = [M('FIX', 'FIX', o(9), 0, 60)]
  ok('megvárós 1 óra: 8:00, 10:00, 10:30, 11:00 (9:00 és 9:30 foglalt)',
    [o(8), o(10), o(10, 30), o(11)], varosKezdesek(n, munkak, 60).map((l) => l.tol))
  const h = leadosHozasok(n, munkak, 120)
  ok('itt hagyós 2 óra: legkésőbb 10:00-ra hozható', o(10), h[h.length - 1].tol)
  ok('8:00-ra hozva kész 11:00-ra (a megvárós miatt félrerakva)', o(11), h[0].kesz)
  ok('mostantól (9:40): az első kezdés 10:00', o(10), varosKezdesek(n, munkak, 60, o(9, 40))[0].tol)
}

console.log('\n=== 3) a nap színe ===\n')
ok('üres nap: szabad', 'szabad', napAllapot(nap(o(8), o(16)), [], 90, 'LEADOS').allapot)
ok('majdnem tele: kevés', 'keves', napAllapot(nap(o(8), o(12), 1), [M('A', 'RUGALMAS', o(8), o(12), 150)], 90, 'LEADOS').allapot)
ok('tele', 'tele', napAllapot(nap(o(8), o(12), 1), [M('A', 'RUGALMAS', o(8), o(12), 210)], 90, 'LEADOS').allapot)
ok('zárt nap', 'zarva', napAllapot([], [], 90, 'VAROS').allapot)

console.log('\n=== 4) ebédszünet: 11:15–12:45 nem kínálunk időpontot (v57) ===\n')
{
  const ebed = [{ tol: o(11, 15), ig: o(12, 45) }]
  const v = varosKezdesek(nap(o(8), o(17)), [], 60, null, 30, ebed).map((l) => l.tol)
  ok('11:00 még igen, 11:30 / 12:00 / 12:30 nem, 13:00 igen', [true, false, false, false, true],
    [o(11), o(11, 30), o(12), o(12, 30), o(13)].map((t) => v.includes(t)))
  const l = leadosHozasok(nap(o(8), o(17)), [], 60, null, 30, ebed).map((x) => x.tol)
  ok('itt hagyja: ugyanígy', [true, false, true], [o(11), o(12), o(13)].map((t) => l.includes(t)))
}

console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
