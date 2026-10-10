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
const var_ = (ms) => new Promise((r) => setTimeout(r, ms))

const dir = await mkdtemp(join(tmpdir(), 'v50-'))
for (const m of ['tokenFetch', 'elo']) {
  await build({ entryPoints: [`src/data/${m}.ts`], outfile: join(dir, `${m}.mjs`),
                format: 'esm', bundle: true, external: ['@supabase/*'], logLevel: 'error' })
}
const { tokenFetch } = await import(join(dir, 'tokenFetch.mjs'))
const { EloFrissites } = await import(join(dir, 'elo.mjs'))

console.log('=== 1) tokenFetch ===\n')
{
  const hivasok = []
  let csere = 0
  globalThis.fetch = async (url, init) => {
    const auth = new Headers(init?.headers).get('Authorization')
    hivasok.push({ url, auth, apikey: new Headers(init?.headers).get('apikey') })
    if (auth === 'Bearer regi') return new Response('{"code":"PGRST301","message":"JWT expired"}', { status: 401 })
    if (url.includes('/rossz')) return new Response('{"message":"permission denied"}', { status: 401 })
    return new Response('[]', { status: 200 })
  }
  const kliens = { auth: { refreshSession: async () => { csere++; await var_(20); return { data: { session: { access_token: 'uj' } } } } } }
  const f = tokenFetch(() => kliens)
  const fej = { headers: { Authorization: 'Bearer regi', apikey: 'k' } }

  const valaszok = await Promise.all([1, 2, 3, 4, 5].map((i) => f(`https://x/rest/v1/t${i}`, fej)))
  ok('mind az öt sikerült újrapróbálva', [200, 200, 200, 200, 200], valaszok.map((r) => r.status))
  ok('csak EGY tokencsere', 1, csere)
  ok('az újrapróbálás az új tokennel ment', 5, hivasok.filter((h) => h.auth === 'Bearer uj').length)
  ok('az apikey megmaradt', true, hivasok.filter((h) => h.auth === 'Bearer uj').every((h) => h.apikey === 'k'))

  hivasok.length = 0
  const r = await f('https://x/rest/v1/rossz', { headers: { Authorization: 'Bearer jo' } })
  ok('más 401 (nem JWT): nincs újrapróbálás', [401, 1], [r.status, hivasok.length])
  hivasok.length = 0
  const a = await f('https://x/auth/v1/token', fej)
  ok('a belépési végpontot nem érinti', [401, 1], [a.status, hivasok.length])
}

console.log('\n=== 2) EloFrissites ===\n')
{
  const doc = new EventTarget(); doc.visibilityState = 'visible'
  globalThis.document = doc
  globalThis.window = new EventTarget()
  const csatornak = []
  let getSession = 0
  const sb = {
    channel(nev) {
      const cs = { nev, figyelok: [], zarva: false,
        on(_t, _f, cb) { this.figyelok.push(cb); return this },
        subscribe() { return this } }
      csatornak.push(cs); return cs
    },
    removeChannel(cs) { cs.zarva = true; return Promise.resolve() },
    auth: { getSession: async () => { getSession++; return { data: {} } } },
  }
  const elo = new EloFrissites(sb)
  let a = 0, b = 0
  const le1 = elo.feliratkoz(() => a++)
  const le2 = elo.feliratkoz(() => b++)
  ok('két feliratkozó, egy csatorna', 1, csatornak.length)
  ok('minden foglalási tábla figyelve', 10, csatornak[0].figyelok.length)

  for (let i = 0; i < 10; i++) csatornak[0].figyelok[i % 10]()
  await var_(600)
  ok('tíz jelzésből egy újratöltés, mindkét figyelőnek', [1, 1], [a, b])

  doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'))
  const most = Date.now; Date.now = () => most() + 40_000
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'))
  Date.now = most
  await var_(600)
  ok('ébredés: belépés frissítve', 1, getSession)
  ok('ébredés: a régi csatorna zárva, új nyitva', [true, 2, false], [csatornak[0].zarva, csatornak.length, csatornak[1].zarva])
  ok('ébredés: egy újratöltés', [2, 2], [a, b])

  doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'))
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'))
  await var_(600)
  ok('rövid háttér: újratöltés, csatorna marad', [3, 2], [a, csatornak.length])

  le1()
  le2()
  const le3 = elo.feliratkoz(() => {})
  await var_(3300)
  ok('nézetváltáskor a csatorna nem zárul be', [false, 2], [csatornak[1].zarva, csatornak.length])
  le3()
  ok('az utolsó leiratkozás után még nyitva (vár)', false, csatornak[1].zarva)
  await var_(3300)
  ok('három másodperc múlva zárva', true, csatornak[1].zarva)
}

console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
