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

const dir = await mkdtemp(join(tmpdir(), 'v64-'))
const belepes = join(dir, 'be.ts')
await writeFile(belepes, `
export { csomagbanBenne } from '${join(process.cwd(), 'src/lib/csomag.ts')}'
export { toExtra } from '${join(process.cwd(), 'src/data/source.ts')}'
export { munkakNapra } from '${join(process.cwd(), 'src/lib/beosztas.ts')}'
`)
await build({ entryPoints: [belepes], outfile: join(dir, 'b.mjs'), format: 'esm', bundle: true, logLevel: 'error' })
const L = await import(join(dir, 'b.mjs'))

const extra = (terulet, csomagok = [], fs = false) => ({
  area: terulet, included_in_packages: csomagok, included_in_full_service: fs,
})
const GUMI = extra('KULSO', ['premium', 'elit'])
const KARPIT = extra('BELSO', [], true)
const FOLYADEK = extra(null, ['elit'])
const MUANYAG = extra('KULSO')

console.log('=== 1) Csomag része ===\n')
ok('csomag nélkül semmi sem esik ki', [false, false], [
  L.csomagbanBenne(GUMI, null, 'TELJES', false), L.csomagbanBenne(KARPIT, null, 'TELJES', false)])
ok('Premiumban és Elitben a gumiápolás benne van, Startban nincs', [true, true, false], [
  L.csomagbanBenne(GUMI, 'premium', 'TELJES', false), L.csomagbanBenne(GUMI, 'elit', 'TELJES', false),
  L.csomagbanBenne(GUMI, 'start', 'TELJES', false)])
ok('ami sehol sincs bejelölve, mindig kérhető', false, L.csomagbanBenne(MUANYAG, 'elit', 'TELJES', true))

console.log('\n=== 2) Csak kívül / csak belül ===\n')
ok('csak kívül: a külső tétel benne van', true, L.csomagbanBenne(GUMI, 'premium', 'KULSO', false))
ok('csak belül: a gumiápolás nem része, kérhető', false, L.csomagbanBenne(GUMI, 'premium', 'BELSO', false))
ok('terület nélküli tétel minden terjedelemnél benne van', [true, true],
  [L.csomagbanBenne(FOLYADEK, 'elit', 'KULSO', false), L.csomagbanBenne(FOLYADEK, 'elit', 'BELSO', false)])

console.log('\n=== 3) Full Service ===\n')
ok('Full Service nélkül a vizes kárpit kérhető', false, L.csomagbanBenne(KARPIT, 'premium', 'TELJES', false))
ok('Full Service-ben benne van, bármelyik csomaggal', [true, true],
  [L.csomagbanBenne(KARPIT, 'premium', 'TELJES', true), L.csomagbanBenne(KARPIT, 'start', 'TELJES', true)])
ok('Full Service mellett a csomag szerinti szűrés is marad', true, L.csomagbanBenne(GUMI, 'elit', 'TELJES', true))

console.log('\n=== 4) Az adatbázisból érkező lista ===\n')
const alap = { id: 'x', name: 'Gumiápolás', included_in_full_service: 't' }
ok('tömbként', ['a', 'b'], L.toExtra({ ...alap, included_in_packages: ['a', 'b'] }).included_in_packages)
ok('Postgres szövegként', ['a', 'b'], L.toExtra({ ...alap, included_in_packages: '{a,b}' }).included_in_packages)
ok('üresen vagy hiányozva', [[], []], [
  L.toExtra({ ...alap, included_in_packages: '{}' }).included_in_packages,
  L.toExtra({ ...alap, included_in_packages: undefined }).included_in_packages])

console.log('\n=== 5) Száradós Itt hagyja: a munka a hozás napján ===\n')
const nap = '2026-10-14'
const masnap = '2026-10-15'
const fs = {
  id: 'fs', status: 'CONFIRMED', booking_type: 'LEADOS', service_date: nap, last_day: masnap,
  start_at: null, drop_off_at: `${nap}T09:00:00+02:00`, pick_up_at: `${masnap}T08:00:00+02:00`,
  deadline_at: `${masnap}T08:00:00+02:00`, planned_duration_minutes: 135, rest_minutes: 1440, napi_perc: 67,
}
const ma = L.munkakNapra([fs], nap, 480, 1020, () => 'FSV', null).munkak
const holnap = L.munkakNapra([fs], masnap, 480, 1020, () => 'FSV', null).munkak
ok('a hozás napján az egész munka, Itt hagyja-ként, zárásig', [{ fajta: 'RUGALMAS', perc: 135, tol: 540, hatarido: 1020 }],
  ma.map((m) => ({ fajta: m.fajta, perc: m.perc, tol: m.tol, hatarido: m.hatarido })))
ok('másnap nincs munka, csak elviszik', [], holnap)
const tobbnapos = { ...fs, id: 'tn', rest_minutes: 0 }
ok('száradás nélkül marad a többnapos felosztás', [{ fajta: 'TOBBNAPOS', perc: 67 }],
  L.munkakNapra([tobbnapos], nap, 480, 1020, () => 'TN', null).munkak.map((m) => ({ fajta: m.fajta, perc: m.perc })))

console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
