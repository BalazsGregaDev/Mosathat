import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
const ki = (id) => q(`select set_config('app.uid', $1, false)`, [id ?? ''])
const hiba = async (f) => { try { await f(); return null } catch (e) { return e.message } }

console.log('=== 1) Minden UPDATE és DELETE függvényben WHERE feltétellel (a Supabase safeupdate miatt) ===\n')
const fv = await q(`select p.proname n, p.prosrc s from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.prolang in (select oid from pg_language where lanname in ('plpgsql', 'sql'))`)
const hibasak = []
for (const { n, s } of fv) {
  const tiszta = s.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''")
  for (const m of tiszta.matchAll(/\b(update|delete\s+from)\s+[\w.]+[\s\S]*?;/gi)) {
    const elotte = tiszta.slice(Math.max(0, m.index - 40), m.index)
    if (/do\s*$/i.test(elotte)) continue
    if (!/\bwhere\b/i.test(m[0])) hibasak.push(`${n}: ${m[0].replace(/\s+/g, ' ').slice(0, 80)}`)
  }
}
t.ok('nincs WHERE nélküli UPDATE vagy DELETE', [], hibasak)

console.log('\n=== 2) A javított függvények működnek ===\n')
await ki(TULAJ)
await q(`select gyik_beallitas('VELETLEN', 4)`)
t.ok('GYIK: véletlenszerűre állítható', ['VELETLEN', 4], Object.values((await q(`select gyik_mod, gyik_max from publikus_adatok`))[0]))
await q(`select publikus_tartalom_mentes($1::jsonb)`, [JSON.stringify({ adatok: { telefon: '+36 1 111 2222' } })])
t.ok('Elérhetőség mentése', '+36 1 111 2222', (await q(`select telefon from publikus_adatok`))[0].telefon)
await q(`select arculat_valasztas('03', 'SOTET')`)
t.ok('Arculat mentése', ['03', 'SOTET'], Object.values((await q(`select arculat, arculat_mod from shop_settings`))[0]))
t.ok('jogosultság nélkül továbbra sem', true, /tulajdonos/.test(await hiba(async () => { await ki(''); await q(`select gyik_beallitas('VALOGATOTT', 5)`) }) ?? ''))

t.vege()
