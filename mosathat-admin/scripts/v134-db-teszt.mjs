import { adatbazis, ALK, FEJL, TULAJ, tesztelo } from './_db.mjs'

const t = tesztelo()
const KEP = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA='

console.log('=== 0) A v130-ban beállított adatok átkerülnek ===\n')
{
  const db = await adatbazis({ demo: true, meddig: '20261031120000' })
  await db.exec(`select set_config('app.uid', '${TULAJ}', false)`)
  await db.query(`select public.felugro_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, cim: 'Régi', szoveg: 'Régi üzenet', szoveg_en: 'Old' })])
  await db.query(`select public.egyedi_mentes($1::jsonb)`, [JSON.stringify({ aktiv: false, szoveg: 'Régi szekció', kepek: [KEP], igazitas: 'JOBB' })])
  const { readFile } = await import('node:fs/promises')
  const { GYOKER } = await import('./_db.mjs')
  await db.exec(await readFile(`${GYOKER}/supabase/migrations/20261031120000_bejelentes_idozites.sql`, 'utf8'))
  const sorok = (await db.query(`select tipus, aktiv, cim, szoveg, szoveg_en, jsonb_array_length(kepek) kep, igazitas, kezdes, zaras from public.oldal_bejelentesek order by tipus`)).rows
  t.ok('a felugró és a szekció is átkerült, időzítés nélkül', [
    { tipus: 'EGYEDI', aktiv: false, cim: '', szoveg: 'Régi szekció', szoveg_en: '', kep: 1, igazitas: 'JOBB', kezdes: null, zaras: null },
    { tipus: 'FELUGRO', aktiv: true, cim: 'Régi', szoveg: 'Régi üzenet', szoveg_en: 'Old', kep: 0, igazitas: 'KOZEP', kezdes: null, zaras: null },
  ], sorok)
  const [{ x }] = (await db.query(`select public.publikus_oldal() x`)).rows
  t.ok('a bekapcsolt régi felugró továbbra is látszik', ['Régi üzenet', null], [x.felugro?.szoveg, x.egyedi])
  t.ok('a régi tábla megszűnt', null, (await db.query(`select to_regclass('public.oldal_bejelentes') x`)).rows[0].x)
  await db.close()
}

const db = await adatbazis({ demo: true })
const q = async (s, p = []) => (await db.query(s, p)).rows
const mint = (uid) => db.exec(`select set_config('app.uid', '${uid}', false)`)
const hiba = async (s, p = []) => {
  try { await db.query(s, p); return null } catch (e) { return e.message }
}
const ment = async (x) => (await q(`select public.bejelentes_mentes($1::jsonb) id`, [JSON.stringify(x)]))[0].id
const pub = async () => (await q(`select public.publikus_oldal() x`))[0].x
const ALAP = Date.now()
const ido = (napok, ora = 0) => new Date(ALAP + napok * 864e5 + ora * 36e5).toISOString()
await mint(TULAJ)

console.log('\n=== 1) Időzítés ===\n')
const most = await ment({ tipus: 'FELUGRO', cim: 'Most', szoveg: 'Most látszik', kezdes: ido(-1), zaras: ido(2) })
const kesobb = await ment({ tipus: 'FELUGRO', cim: 'Karácsony', szoveg: 'Ünnepi nyitvatartás', kezdes: ido(5), zaras: ido(10) })
t.ok('a mostani időszakú látszik', 'Most látszik', (await pub()).felugro?.szoveg)
await q(`update public.oldal_bejelentesek set kezdes = $1, zaras = $2 where id = $3`, [ido(-10), ido(-8), most])
t.ok('ha lejárt, nem látszik, és a jövőbeli még nem', null, (await pub()).felugro)
await q(`update public.oldal_bejelentesek set kezdes = $1 where id = $2`, [ido(-1), kesobb])
t.ok('amikor eljön a kezdése, a következő látszik', 'Ünnepi nyitvatartás', (await pub()).felugro?.szoveg)
await q(`update public.oldal_bejelentesek set kezdes = $1 where id = $2`, [ido(5), kesobb])
const nyitott = await ment({ tipus: 'FELUGRO', szoveg: 'Zárás nélkül', kezdes: ido(-3), zaras: ido(-2, 23) })
t.ok('a zárás idejétől már nem látszik', null, (await pub()).felugro)
await q(`delete from public.oldal_bejelentesek where id = $1`, [nyitott])

console.log('\n=== 2) Egyszerre csak egy ===\n')
const utk = await hiba(`select public.bejelentes_mentes($1::jsonb)`, [JSON.stringify({ tipus: 'FELUGRO', szoveg: 'Ütköző', kezdes: ido(8), zaras: ido(12) })])
t.ok('átfedő bekapcsolt időszak nem menthető, megmondja, mivel ütközik', true, /Ütközik.*Karácsony/.test(utk ?? ''))
t.ok('kikapcsolva elmenthető (piszkozat)', null, await hiba(`select public.bejelentes_mentes($1::jsonb)`, [JSON.stringify({ tipus: 'FELUGRO', aktiv: false, szoveg: 'Piszkozat', kezdes: ido(8), zaras: ido(12) })]))
t.ok('pont a zárásnál kezdődő mehet', null, await hiba(`select public.bejelentes_mentes($1::jsonb)`, [JSON.stringify({ tipus: 'FELUGRO', szoveg: 'Utána', kezdes: (await q(`select zaras from public.oldal_bejelentesek where id = $1`, [kesobb]))[0].zaras, zaras: ido(20) })]))
t.ok('időzítés nélküli (azonnal, visszavonásig) ütközik a jövőbeliekkel', true, /Ütközik/.test(await hiba(`select public.bejelentes_mentes($1::jsonb)`, [JSON.stringify({ tipus: 'FELUGRO', szoveg: 'Örök' })]) ?? ''))
t.ok('a felugró és az egyedi szekció nem ütközik egymással', null, await hiba(`select public.bejelentes_mentes($1::jsonb)`, [JSON.stringify({ tipus: 'EGYEDI', szoveg: 'Szekció', kezdes: ido(6), zaras: ido(9) })]))
t.ok('saját magával nem ütközik (szerkesztés)', null, await hiba(`select public.bejelentes_mentes($1::jsonb)`, [JSON.stringify({ id: kesobb, tipus: 'FELUGRO', cim: 'Karácsony', szoveg: 'Ünnepi nyitvatartás!', kezdes: ido(5), zaras: ido(10) })]))
t.ok('a zárás nem lehet a kezdés előtt', true, /zárásnak/.test(await hiba(`select public.bejelentes_mentes($1::jsonb)`, [JSON.stringify({ tipus: 'FELUGRO', szoveg: 'x', kezdes: ido(30), zaras: ido(29) })]) ?? ''))

console.log('\n=== 3) Lista, változat, törlés ===\n')
const [{ x: lista }] = await q(`select public.bejelentesek_lista('FELUGRO') x`)
t.ok('a lista minden felugrót tartalmaz, a szekciót nem', [4, false], [lista.length, lista.some((s) => s.tipus === 'EGYEDI')])
const v1 = lista.find((s) => s.id === kesobb).valtozat
await ment({ id: kesobb, tipus: 'FELUGRO', cim: 'Karácsony', szoveg: 'Ünnepi nyitvatartás!', kezdes: ido(4), zaras: ido(10) })
const v2 = (await q(`select public.bejelentesek_lista('FELUGRO') x`))[0].x.find((s) => s.id === kesobb).valtozat
t.ok('csak az időpont módosítása nem ugratja fel újra annak, aki már bezárta', v1, v2)
await ment({ id: kesobb, tipus: 'FELUGRO', cim: 'Karácsony', szoveg: 'Új szöveg', kezdes: ido(4), zaras: ido(10) })
const v3 = (await q(`select public.bejelentesek_lista('FELUGRO') x`))[0].x.find((s) => s.id === kesobb).valtozat
t.ok('szövegmódosításra új változat', true, v3 !== v2)
await q(`select public.bejelentes_torles($1)`, [kesobb])
t.ok('törölhető', 3, (await q(`select public.bejelentesek_lista('FELUGRO') x`))[0].x.length)

console.log('\n=== 4) Egyedi szekció ellenőrzései ===\n')
t.ok('legfeljebb 3 kép', true, /3 kép/.test(await hiba(`select public.bejelentes_mentes($1::jsonb)`, [JSON.stringify({ tipus: 'EGYEDI', kepek: [KEP, KEP, KEP, KEP], aktiv: false })]) ?? ''))
t.ok('hibás képlink', true, /Hibás kép/.test(await hiba(`select public.bejelentes_mentes($1::jsonb)`, [JSON.stringify({ tipus: 'EGYEDI', kepek: ['javascript:x'], aktiv: false })]) ?? ''))
t.ok('üres nem menthető', true, /szöveget vagy/.test(await hiba(`select public.bejelentes_mentes($1::jsonb)`, [JSON.stringify({ tipus: 'EGYEDI', aktiv: false })]) ?? ''))
const kepes = await ment({ tipus: 'EGYEDI', kepek: [KEP], kep_hely: 'ALATT', igazitas: 'BAL', meret: 'NAGY', kezdes: ido(-1), zaras: ido(1) })
const p = await pub()
t.ok('csak képpel is látszik, a beállításaival', [kepes, 1, 'ALATT', 'BAL', 'NAGY'], [p.egyedi?.id, p.egyedi?.kepek.length, p.egyedi?.kep_hely, p.egyedi?.igazitas, p.egyedi?.meret])

console.log('\n=== 5) Jogosultság ===\n')
await mint(ALK)
t.ok('alkalmazott nem látja a listát', true, /tulajdonos/.test(await hiba(`select public.bejelentesek_lista('FELUGRO')`) ?? ''))
t.ok('alkalmazott nem menthet', true, /tulajdonos/.test(await hiba(`select public.bejelentes_mentes('{"tipus":"FELUGRO","szoveg":"x"}')`) ?? ''))
t.ok('alkalmazott nem törölhet', true, /tulajdonos/.test(await hiba(`select public.bejelentes_torles($1)`, [kepes]) ?? ''))
await mint(FEJL)
t.ok('a fejlesztő igen', null, await hiba(`select public.bejelentesek_lista('EGYEDI')`))
await db.exec(`set role anon`)
t.ok('belépés nélkül a tábla nem olvasható', true, /permission denied/.test(await hiba(`select * from public.oldal_bejelentesek`) ?? ''))
t.ok('belépés nélkül a mentés nem hívható', true, /permission denied/.test(await hiba(`select public.bejelentes_mentes('{}')`) ?? ''))
t.ok('a publikus oldal olvasható', null, await hiba(`select public.publikus_oldal()`))
await db.exec(`reset role`)

t.vege()
