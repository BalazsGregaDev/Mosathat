import { adatbazis, tesztelo, ALK, TULAJ, FEJL } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: false })
const q = async (s, p = []) => (await db.query(s, p)).rows
const egy = async (s, p = []) => (await q(s, p))[0]
const ki = async (uid) => q(`select set_config('app.uid', $1, false)`, [uid])
const hiba = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }
const allas = async () => egy(`select arculat, arculat_mod from shop_settings`)

console.log('=== Arculat választás ===\n')
t.ok('alapból nincs kiválasztva', { arculat: null, arculat_mod: null }, await allas())

await ki(TULAJ)
await q(`select arculat_valasztas('03', 'SOTET')`)
t.ok('a tulaj kiválaszthatja', { arculat: '03', arculat_mod: 'SOTET' }, await allas())

await ki(FEJL)
await q(`select arculat_valasztas('07', 'VILAGOS')`)
t.ok('a fejlesztő is', { arculat: '07', arculat_mod: 'VILAGOS' }, await allas())

await ki(ALK)
t.ok('az alkalmazott nem', true, /csak a tulajdonos/.test(await hiba(() => q(`select arculat_valasztas('01', 'VILAGOS')`)) ?? ''))
t.ok('és nem is változott', { arculat: '07', arculat_mod: 'VILAGOS' }, await allas())

await ki(TULAJ)
t.ok('ismeretlen koncepciót nem fogad el', true, (await hiba(() => q(`select arculat_valasztas('09', 'VILAGOS')`))) !== null)
t.ok('ismeretlen módot sem', true, (await hiba(() => q(`select arculat_valasztas('01', 'SZURKE')`))) !== null)
await q(`select arculat_valasztas('05', null)`)
t.ok('mód nélkül világos', { arculat: '05', arculat_mod: 'VILAGOS' }, await allas())

const s = await egy(`select drop_off_from::text, default_parallel_slots, default_travel_minutes,
                            pass_validity_kind::text, pass_validity_value, online_lemondas_ora from shop_settings`)
await q(`select save_shop_settings($1::jsonb)`, [JSON.stringify(s)])
t.ok('a Beállítások mentése nem törli a választást', { arculat: '05', arculat_mod: 'VILAGOS' }, await allas())

const jog = await egy(`select has_function_privilege('anon', 'public.arculat_valasztas(text,text)', 'execute') a`)
t.ok('kívülről nem hívható', false, jog.a)

await db.close()
t.vege()
