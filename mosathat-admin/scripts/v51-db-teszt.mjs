// v51, adatbázis: szabadság — rögzítés, jogok, listák, kapacitás.
import { adatbazis, tesztelo, ALK, TULAJ } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
const belep = (id) => db.exec(`select set_config('app.uid','${id}',false)`)
const hiba = async (sql, p = []) => { try { await q(sql, p); return null } catch (e) { return e.message } }
// Egy biztosan munkanap (a jövő hét szerdája)
const szerda = (await egy(`select (date_trunc('week', current_date) + interval '9 days')::date::text d`)).d
const nap = async (n) => (await egy(`select ($1::date + $2::int)::text d`, [szerda, n])).d

console.log('=== rögzítés ===\n')
await belep(ALK)
const kap0 = await egy(`select capacity_minutes c, staff_pct p from day_capacity($1::date)`, [szerda])
const id = (await egy(`select set_vacation($1::jsonb) id`, [JSON.stringify({ from_day: szerda, to_day: await nap(2), note: 'Balaton' })])).id
t.ok('a saját szabadság rögzítve', 1, (await q(`select * from vacation_list()`)).length)
const egyNap = (await egy(`select set_vacation($1::jsonb) id`, [JSON.stringify({ from_day: await nap(14) })])).id
t.ok('utolsó nap nélkül: egy nap', [await nap(14), await nap(14)],
  Object.values(await egy(`select from_day::text, to_day::text from staff_vacations where id = $1`, [egyNap])))
t.ok('rossz sorrend: hiba', true,
  /korábban/.test(await hiba(`select set_vacation($1::jsonb)`, [JSON.stringify({ from_day: await nap(3), to_day: szerda })])))
t.ok('másnak nem írhat be az alkalmazott', true,
  /tulajdonos/.test(await hiba(`select set_vacation($1::jsonb)`, [JSON.stringify({ staff_id: TULAJ, from_day: szerda })])))

console.log('\n=== a kapacitás csökken ===\n')
const kap1 = await egy(`select capacity_minutes c, staff_pct p from day_capacity($1::date)`, [szerda])
t.ok('a szabadság napján kisebb a kapacitás', true, kap1.c < kap0.c)
t.ok('a jelenlét 100% alatt', true, Number(kap1.p) < 100)
// (a szabadság szerdától péntekig tart; a kedd egy munkanap előtte)
const kap0kedd = await egy(`select capacity_minutes c from day_capacity($1::date)`, [await nap(-1)])
t.ok('az előtte lévő munkanapon teljes a kapacitás', '100.0',
  String((await egy(`select staff_pct p from day_capacity($1::date)`, [await nap(-1)])).p))
t.ok('és nem nulla', true, kap0kedd.c > 0)

console.log('\n=== listák ===\n')
const r = await q(`select staff_name, from_day::text f, to_day::text t from vacations_range($1::date, $2::date)`, [szerda, await nap(30)])
t.ok('a napi kártyára: a következő hónap mindkét szabadsága', 2, r.length)
const kozbe = await q(`select 1 from vacations_range($1::date, $1::date)`, [await nap(1)])
t.ok('a szabadság közepén nézett nap is látja', 1, kozbe.length)

await belep(TULAJ)
t.ok('a tulajdonos mindenkiét látja a Profilomban', true,
  (await q(`select * from vacation_list() where not sajat`)).length >= 2)
const masnak = (await egy(`select set_vacation($1::jsonb) id`, [JSON.stringify({ staff_id: ALK, from_day: await nap(20), to_day: await nap(21) })])).id
t.ok('a tulajdonos másnak is beírhatja', ALK,
  (await egy(`select staff_id::text s from staff_vacations where id = $1`, [masnak])).s)

console.log('\n=== törlés ===\n')
await belep(ALK)
await q(`select delete_vacation($1)`, [id])
t.ok('törölve, a kapacitás visszaállt', kap0.c,
  (await egy(`select capacity_minutes c from day_capacity($1::date)`, [szerda])).c)

t.vege()
