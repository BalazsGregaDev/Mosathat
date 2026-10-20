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

const dir = await mkdtemp(join(tmpdir(), 'v63-'))
const belepes = join(dir, 'be.ts')
await writeFile(belepes, `
export { keresElhelyez } from '${join(process.cwd(), 'src/lib/befer.ts')}'
export { napMulva, ota } from '${join(process.cwd(), 'src/lib/format.ts')}'
`)
await build({ entryPoints: [belepes], outfile: join(dir, 'b.mjs'), format: 'esm', bundle: true, logLevel: 'error' })
const L = await import(join(dir, 'b.mjs'))

console.log('=== 1) Idő szövegek ===\n')
const most = Date.parse('2026-10-12T08:00:00Z')
ok('ennyi ideje érkezett', ['épp most', '5 perce', '2 órája', '3 napja'], [
  L.ota('2026-10-12T07:59:40Z', most), L.ota('2026-10-12T07:55:00Z', most),
  L.ota('2026-10-12T05:30:00Z', most), L.ota('2026-10-09T07:00:00Z', most)])
ok('hány nap múlva', ['ma', 'holnap', 'holnapután', '5 nap múlva', 'tegnap'], [
  L.napMulva('2026-10-12', '2026-10-12'), L.napMulva('2026-10-13', '2026-10-12'),
  L.napMulva('2026-10-14', '2026-10-12'), L.napMulva('2026-10-17', '2026-10-12'),
  L.napMulva('2026-10-11', '2026-10-12')])

console.log('\n=== 2) Hova fér be a kérés ===\n')
const nap = '2026-10-14'
const hhmm = (p) => `${String(Math.floor(p / 60)).padStart(2, '0')}:${String(p % 60).padStart(2, '0')}`
const savok = Array.from({ length: 36 }, (_, i) => ({ starts: hhmm(480 + i * 15), ends: hhmm(495 + i * 15), lanes: 2 }))
const iso = (o) => `${nap}T${o}:00+02:00`
const fogl = (id, tipus, ora, perc, allapot = 'CONFIRMED') => ({
  id, status: allapot, booking_type: tipus, service_date: nap, last_day: nap,
  start_at: tipus === 'VAROS' ? iso(ora) : null, drop_off_at: tipus === 'LEADOS' ? iso(ora) : null,
  pick_up_at: null, deadline_at: null, planned_duration_minutes: perc, plate_raw: id.toUpperCase(),
})
const cimke = (b) => b.plate_raw
{
  const keres = fogl('ker', 'VAROS', '10:00', 90, 'REQUESTED')
  const e = L.keresElhelyez(keres, [keres, fogl('a', 'VAROS', '08:00', 60)], savok, null, cimke)
  ok('üres délelőtt: befér, a tervezett helyen', [true, 'FIX', [{ sor: 0, tol: 600, ig: 690 }]], [e.befer, e.fajta, e.darabok])
}
{
  const keres = fogl('ker', 'VAROS', '10:00', 90, 'REQUESTED')
  const tobbi = [fogl('a', 'VAROS', '09:30', 120), fogl('b', 'VAROS', '10:00', 60)]
  const e = L.keresElhelyez(keres, [keres, ...tobbi], savok, null, cimke)
  ok('két megvárós autó mellé nem fér be', false, e.befer)
  ok('megmondja, mikor nincs hely', true, e.gondok.some((g) => /nincs szabad hely/.test(g)))
  ok('és ajánl szabad kezdést', true, e.alternativak.length > 0 && e.alternativak.every((a) => a.tol >= 480))
}
{
  const keres = fogl('ker', 'LEADOS', '08:30', 120, 'REQUESTED')
  const e = L.keresElhelyez(keres, [keres], savok, null, cimke)
  ok('itt hagyós: befér, kész 10:30-ra', [true, 'RUGALMAS', 630], [e.befer, e.fajta, e.kesz])
}
{
  const keres = fogl('ker', 'LEADOS', '08:00', 600, 'REQUESTED')
  const e = L.keresElhelyez(keres, [keres], savok, null, cimke)
  ok('túl hosszú itt hagyós munka: nem fér bele a napba', false, e.befer)
}
{
  const keres = fogl('ker', 'VAROS', '10:00', 90, 'REQUESTED')
  const e = L.keresElhelyez(keres, [keres], [], null, cimke)
  ok('zárt nap', [false, false], [e.nyitva, e.befer])
}

console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
