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

const dir = await mkdtemp(join(tmpdir(), 'v72-'))
await build({ entryPoints: ['src/data/tokenFetch.ts'], outfile: join(dir, 'tf.mjs'),
              format: 'esm', bundle: true, external: ['@supabase/*'], logLevel: 'error' })
await build({ entryPoints: ['src/lib/format.ts'], outfile: join(dir, 'fm.mjs'),
              format: 'esm', bundle: true, logLevel: 'error' })
const { kitartoFetch, tokenFetch, ujraprobalhato } = await import(join(dir, 'tf.mjs'))
const { halozatiHiba } = await import(join(dir, 'fm.mjs'))

function hamis(hibakSzama, hiba = () => new TypeError('Load failed')) {
  const allas = { hivas: 0 }
  allas.fetch = async () => {
    allas.hivas++
    if (allas.hivas <= hibakSzama) throw hiba()
    return new Response('[]', { status: 200 })
  }
  return allas
}
const RPC = (n) => `https://x.supabase.co/rest/v1/rpc/${n}`
const POST = { method: 'POST', body: '{}' }

console.log('=== 1) Olvasásnál újrapróbál ===\n')
{
  const h = hamis(2)
  const t0 = Date.now()
  const r = await kitartoFetch(h.fetch)(RPC('day_bookings'), POST)
  ok('a napi foglalás két hálózati hiba után is betölt', [200, 3], [r.status, h.hivas])
  ok('közben vár, nem pörget (kb. 2 mp)', true, Date.now() - t0 >= 1900)
}
{
  const h = hamis(1)
  const r = await kitartoFetch(h.fetch)('https://x.supabase.co/rest/v1/bookings?select=*', { method: 'GET' })
  ok('sima GET is újrapróbál', [200, 2], [r.status, h.hivas])
}
{
  const h = hamis(10)
  let uzenet = null
  try { await kitartoFetch(h.fetch)(RPC('day_capacity'), POST) } catch (e) { uzenet = e.message }
  ok('tartós hibánál feladja: 1 + 3 próba, utána továbbadja a hibát', [4, 'Load failed'], [h.hivas, uzenet])
}

console.log('\n=== 2) Íráskor NEM próbál újra ===\n')
for (const n of ['create_booking', 'set_booking_status', 'online_keres_dontes', 'booking_not_fitted']) {
  const h = hamis(1)
  let dobott = false
  try { await kitartoFetch(h.fetch)(RPC(n), POST) } catch { dobott = true }
  ok(`${n}: egyetlen próba, a hiba azonnal látszik`, [true, 1], [dobott, h.hivas])
}
{
  const h = hamis(1)
  let dobott = false
  try { await kitartoFetch(h.fetch)('https://x.supabase.co/rest/v1/customers', { method: 'PATCH', body: '{}' }) } catch { dobott = true }
  ok('táblába írás (PATCH) sem', [true, 1], [dobott, h.hivas])
}
{
  const h = hamis(1)
  let dobott = false
  try { await kitartoFetch(h.fetch)('https://x.supabase.co/auth/v1/user', { method: 'GET' }) } catch { dobott = true }
  ok('a belépési (auth) végpontot nem érinti', [true, 1], [dobott, h.hivas])
}

console.log('\n=== 3) Egyéb esetek ===\n')
{
  const h = hamis(1, () => new DOMException('aborted', 'AbortError'))
  let dobott = false
  try { await kitartoFetch(h.fetch)(RPC('day_bookings'), POST) } catch { dobott = true }
  ok('megszakított kérést nem ismétel', [true, 1], [dobott, h.hivas])
}
{
  const h = hamis(5)
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 200)
  const t0 = Date.now()
  let dobott = false
  try { await kitartoFetch(h.fetch)(RPC('day_bookings'), { ...POST, signal: ac.signal }) } catch { dobott = true }
  ok('várakozás közben megszakítva azonnal leáll', [true, true], [dobott, Date.now() - t0 < 600])
}
{
  const h = hamis(1)
  globalThis.fetch = h.fetch
  const kliens = { auth: { refreshSession: async () => ({ data: { session: null } }) } }
  const r = await tokenFetch(() => kliens)(RPC('week_capacity'), POST)
  ok('a tokenFetch alapból már a kitartó fetch-et használja', [200, 2], [r.status, h.hivas])
}
ok('mind a 29 stable lekérdező szerepel', 29,
  ['absence_list', 'booking_finish_preview', 'booking_form_data', 'can_edit_customers', 'ceg_jeloltek',
    'dashboard_summary', 'day_absences', 'day_bookings', 'day_capacity', 'day_lanes', 'latest_start',
    'list_companies', 'list_customers', 'list_role_permissions', 'list_staff', 'list_vehicles',
    'quote_booking', 'range_order', 'search_companies', 'search_customers', 'sheet_cegek', 'sheet_detail',
    'sheet_for_booking', 'start_perc', 'szerzodes_flottas', 'vacation_list', 'vacations_range',
    'week_capacity', 'work_windows'].filter((n) => ujraprobalhato(RPC(n), 'POST')).length)

console.log('\n=== 4) Hibaüzenet ===\n')
ok('Safari „Load failed” hálózati hibának számít', true, halozatiHiba(new Error('Napi foglalások: TypeError: Load failed')))
ok('Chrome „Failed to fetch” is', true, halozatiHiba(new Error('TypeError: Failed to fetch')))
ok('a lefordított üzenet is', true, halozatiHiba(new Error('Napi foglalások: nem sikerült elérni a szervert.')))
ok('jogosultsági hiba nem az', false, halozatiHiba(new Error('Napi foglalások: permission denied')))

console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
