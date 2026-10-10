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
export { nevKulcs, csomagTetelei, csomagbanBenne } from '${join(process.cwd(), 'src/lib/csomag.ts')}'
`)
await build({ entryPoints: [belepes], outfile: join(dir, 'b.mjs'), format: 'esm', bundle: true, logLevel: 'error' })
const L = await import(join(dir, 'b.mjs'))

const sor = (csomag, slot, nev, terulet) => ({
  package_id: csomag, package_code: csomag.toUpperCase(), package_name: csomag, package_sort: 1,
  slot_id: `${csomag}-${slot}`, slot_name: slot, name: nev, area: terulet, sort_order: 1,
})
const MATRIX = [
  sor('start', 'Kézi mosás', 'Kézi mosás samponnal', 'KULSO'),
  sor('start', 'Porszívózás', 'Porszívózás', 'BELSO'),
  sor('premium', 'Kézi mosás', 'Kézi mosás samponnal', 'KULSO'),
  sor('premium', 'Gumiápolás', 'Gumiápolás', 'KULSO'),
  sor('premium', 'Wax', 'Gyors viasz', 'KULSO'),
  sor('premium', 'Porszívózás', 'Porszívózás', 'BELSO'),
  sor('premium', 'Illatosítás', 'Illatosítás', 'BELSO'),
]

console.log('=== 1) Név összevetése ===\n')
ok('kis- és nagybetű, szóközök', 'kézi mosás samponnal', L.nevKulcs('  Kézi   MOSÁS samponnal '))
ok('a zárójeles megjegyzés nem számít', 'gumiápolás', L.nevKulcs('Gumiápolás (külön kérve)'))
ok('ékezetes nagybetű is', 'ózongenerátoros fertőtlenítés', L.nevKulcs('ÓZONGENERÁTOROS Fertőtlenítés'))

console.log('\n=== 2) Mi van a csomagban ===\n')
ok('nincs csomag: üres', 0, L.csomagTetelei(MATRIX, null).size)
ok('ismeretlen csomag: üres', 0, L.csomagTetelei(MATRIX, 'nincs').size)
ok('csak a választott csomag sorai', ['kézi mosás', 'kézi mosás samponnal', 'porszívózás'],
  [...L.csomagTetelei(MATRIX, 'start')].sort())
ok('a tétel neve és a helye is számít', [true, true],
  [L.csomagTetelei(MATRIX, 'premium').has('gyors viasz'), L.csomagTetelei(MATRIX, 'premium').has('wax')])

console.log('\n=== 3) Benne van-e már az extra ===\n')
const premium = L.csomagTetelei(MATRIX, 'premium')
const start = L.csomagTetelei(MATRIX, 'start')
ok('Premiumban a gumiápolás benne van', true, L.csomagbanBenne('Gumiápolás', premium))
ok('Startban nincs benne', false, L.csomagbanBenne('Gumiápolás', start))
ok('régi névvel is felismeri', true, L.csomagbanBenne('Gumiápolás (külön kérve)', premium))
ok('a hasonló, de más szolgáltatás nem esik ki', false,
  L.csomagbanBenne('Felni és gumi mélytisztítás és ápolás', premium))
ok('a hely nevével is egyezik', true, L.csomagbanBenne('WAX', premium))

console.log('\n=== 4) Csak kívül / csak belül ===\n')
const kivul = L.csomagTetelei(MATRIX, 'premium', 'KULSO')
const belul = L.csomagTetelei(MATRIX, 'premium', 'BELSO')
ok('teljes: minden tétel', [true, true],
  [L.csomagbanBenne('Gumiápolás', L.csomagTetelei(MATRIX, 'premium', 'TELJES')), L.csomagbanBenne('Illatosítás', premium)])
ok('csak kívül: a külső tételek', [true, false], [L.csomagbanBenne('Gumiápolás', kivul), L.csomagbanBenne('Illatosítás', kivul)])
ok('csak belül: a gumiápolás már nem része', [false, true],
  [L.csomagbanBenne('Gumiápolás', belul), L.csomagbanBenne('Illatosítás', belul)])

console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
