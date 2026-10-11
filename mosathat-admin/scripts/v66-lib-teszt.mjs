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

const dir = await mkdtemp(join(tmpdir(), 'v66-'))
const belepes = join(dir, 'be.ts')
await writeFile(belepes, `
export { hataridoLehetosegek } from '${join(process.cwd(), 'src/lib/befer.ts')}'
export { negyedekbol } from '${join(process.cwd(), 'src/lib/beosztas.ts')}'
export { percOra } from '${join(process.cwd(), 'src/lib/format.ts')}'
`)
await build({ entryPoints: [belepes], outfile: join(dir, 'b.mjs'), format: 'esm', bundle: true, logLevel: 'error' })
const L = await import(join(dir, 'b.mjs'))

const hhmm = (p) => `${String(Math.floor(p / 60)).padStart(2, '0')}:${String(p % 60).padStart(2, '0')}`
const savok = (helyek, tol = 480, ig = 1020) => Array.from({ length: (ig - tol) / 15 },
  (_, i) => ({ starts: hhmm(tol + i * 15), ends: hhmm(tol + i * 15 + 15), lanes: helyek }))
const orak = (lista) => lista.map((p) => L.percOra(p))
const munka = (id, tol, hatarido, perc) => ({ id, cimke: id, fajta: 'RUGALMAS', tol, hatarido, perc })

console.log('=== 1) Üres nap ===\n')
const ures = L.negyedekbol(savok(2))
const h = L.hataridoLehetosegek(ures, [], 540, 135, 1020)
ok('legkorábban a munkaidő vége: 9:00 + 2 óra 15 perc', '11:15', L.percOra(h[0]))
ok('utána félóránként, legkésőbb 17:00', ['11:15', '11:30', '12:00', '12:30', '13:00', '16:30', '17:00'],
  orak([h[0], h[1], h[2], h[3], h[4], h[h.length - 2], h[h.length - 1]]))
ok('negyedórára kerekít felfelé', '11:45', L.percOra(L.hataridoLehetosegek(ures, [], 540, 155, 1020)[0]))
ok('ha a munka 17:00-ig sem készül el, nincs határidő', [], L.hataridoLehetosegek(ures, [], 900, 135, 1020))
ok('a legkésőbbi idő a nap zárása, ha korábban zárunk', '14:00',
  L.percOra(L.hataridoLehetosegek(L.negyedekbol(savok(2, 450, 840)), [], 540, 90, 840).at(-1)))
ok('zárt napon nincs határidő', [], L.hataridoLehetosegek([], [], 540, 90, 1020))

console.log('\n=== 2) Foglalt nap ===\n')
const egyHely = L.negyedekbol(savok(1))
const reggel = [munka('a', 480, 720, 240)]
const f = L.hataridoLehetosegek(egyHely, reggel, 540, 60, 1020)
ok('egy hely, délig foglalt: a túl korai határidők kimaradnak', true, f[0] > 600)
ok('a megmaradtak mind beférnek, a 17:00 is', [true, '17:00'], [f.length > 0, L.percOra(f.at(-1))])
const tele = [munka('a', 480, 1020, 540)]
ok('egész nap tele: nincs határidő', [], L.hataridoLehetosegek(egyHely, tele, 540, 60, 1020))

console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
