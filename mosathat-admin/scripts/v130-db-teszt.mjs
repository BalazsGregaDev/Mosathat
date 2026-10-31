import { adatbazis, ALK, FEJL, TULAJ, tesztelo } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p = []) => (await db.query(s, p)).rows
const mint = (uid) => db.exec(`select set_config('app.uid', '${uid}', false)`)
const hiba = async (s, p = []) => {
  try { await db.query(s, p); return null } catch (e) { return e.message }
}
const pub = async () => (await q(`select public.publikus_oldal() x`))[0].x
const KEP = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA='

console.log('=== 1) Alapállapot ===\n')
await mint(TULAJ)
const [{ x: alap }] = await q(`select public.bejelentes_adat() x`)
t.ok('mindkettő kikapcsolva', [false, false], [alap.felugro.aktiv, alap.egyedi.aktiv])
t.ok('alapbeállítások', ['FELETT', 'KOZEP', 'KOZEPES', []], [alap.egyedi.kep_hely, alap.egyedi.igazitas, alap.egyedi.meret, alap.egyedi.kepek])
let p = await pub()
t.ok('a publikus oldalon nincs felugró és egyedi szekció', [null, null], [p.felugro, p.egyedi])
t.ok('a régi adatok megmaradtak', true, Array.isArray(p.packages) && 'gyik' in p && 'velemenyek' in p)

console.log('\n=== 2) Jogosultság ===\n')
await mint(ALK)
t.ok('alkalmazott nem olvashatja', true, /tulajdonos/.test(await hiba(`select public.bejelentes_adat()`)))
t.ok('alkalmazott nem mentheti a felugrót', true, /tulajdonos/.test(await hiba(`select public.felugro_mentes('{"aktiv":true,"szoveg":"x"}')`)))
t.ok('alkalmazott nem mentheti a szekciót', true, /tulajdonos/.test(await hiba(`select public.egyedi_mentes('{"aktiv":true,"szoveg":"x"}')`)))
await mint(FEJL)
t.ok('a fejlesztő olvashatja', null, await hiba(`select public.bejelentes_adat()`))

console.log('\n=== 3) Felugró ablak ===\n')
await mint(TULAJ)
t.ok('üzenet nélkül nem kapcsolható be', true, /üzenetet/.test(await hiba(`select public.felugro_mentes('{"aktiv":true,"cim":"Cím"}')`)))
await q(`select public.felugro_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, cim: ' Ünnepi nyitvatartás ', szoveg: 'Dec. 24-én zárva.', cim_en: 'Holiday hours', szoveg_en: 'Closed on Dec 24.' })])
p = await pub()
t.ok('megjelenik, levágott szóközzel', ['Ünnepi nyitvatartás', 'Dec. 24-én zárva.', 'Closed on Dec 24.'], [p.felugro.cim, p.felugro.szoveg, p.felugro.szoveg_en])
const v1 = p.felugro.valtozat
await q(`select public.felugro_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, cim: 'Ünnepi nyitvatartás', szoveg: 'Dec. 24-én zárva.', cim_en: 'Holiday hours', szoveg_en: 'Closed on Dec 24.' })])
t.ok('változatlan mentésnél a változat marad', v1, (await pub()).felugro.valtozat)
await q(`select public.felugro_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, cim: 'Ünnepi nyitvatartás', szoveg: 'Dec. 24-én és 31-én zárva.' })])
const v2 = (await pub()).felugro.valtozat
t.ok('új szövegnél új változat (újra felugrik)', true, v2 !== v1)
await q(`select public.felugro_mentes($1::jsonb)`, [JSON.stringify({ aktiv: false, cim: 'Ünnepi nyitvatartás', szoveg: 'Dec. 24-én és 31-én zárva.' })])
t.ok('kikapcsolva eltűnik', null, (await pub()).felugro)
const [{ x: meg }] = await q(`select public.bejelentes_adat() x`)
t.ok('kikapcsolva is megmarad a szöveg az adminban', 'Dec. 24-én és 31-én zárva.', meg.felugro.szoveg)
await q(`select public.felugro_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, cim: 'Ünnepi nyitvatartás', szoveg: 'Dec. 24-én és 31-én zárva.' })])
t.ok('visszakapcsolva új változat', true, (await pub()).felugro.valtozat !== v2)
t.ok('túl hosszú üzenet', true, /2000/.test(await hiba(`select public.felugro_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, szoveg: 'x'.repeat(2001) })])))

console.log('\n=== 4) Egyedi szekció ===\n')
t.ok('üresen nem kapcsolható be', true, /szöveget vagy/.test(await hiba(`select public.egyedi_mentes('{"aktiv":true}')`)))
t.ok('legfeljebb 3 kép', true, /3 kép/.test(await hiba(`select public.egyedi_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, kepek: [KEP, KEP, KEP, KEP] })])))
t.ok('csak kép-adat vagy https link', true, /Hibás kép/.test(await hiba(`select public.egyedi_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, kepek: ['javascript:alert(1)'] })])))
t.ok('http link nem jó', true, /Hibás kép/.test(await hiba(`select public.egyedi_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, kepek: ['http://x.hu/a.jpg'] })])))
t.ok('hibás igazítás', true, /igazítás/.test(await hiba(`select public.egyedi_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, szoveg: 'x', igazitas: 'FEL' })])))
t.ok('hibás méret', true, /méret/.test(await hiba(`select public.egyedi_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, szoveg: 'x', meret: 'OS' })])))
await q(`select public.egyedi_mentes($1::jsonb)`, [JSON.stringify({ aktiv: true, kepek: [KEP] })])
t.ok('csak képpel is bekapcsolható', 1, (await pub()).egyedi.kepek.length)
await q(`select public.egyedi_mentes($1::jsonb)`, [JSON.stringify({
  aktiv: true, szoveg: ' Új szolgáltatás: kerámia bevonat ', szoveg_en: 'New: ceramic coating',
  kepek: [KEP, 'https://pelda.supabase.co/storage/v1/object/public/oldal-kepek/a.webp'], kep_hely: 'ALATT', igazitas: 'JOBB', meret: 'NAGY',
})])
p = await pub()
t.ok('elmentve a publikus oldalra', ['Új szolgáltatás: kerámia bevonat', 'New: ceramic coating', 2, 'ALATT', 'JOBB', 'NAGY'],
  [p.egyedi.szoveg, p.egyedi.szoveg_en, p.egyedi.kepek.length, p.egyedi.kep_hely, p.egyedi.igazitas, p.egyedi.meret])
await q(`select public.egyedi_mentes($1::jsonb)`, [JSON.stringify({ ...p.egyedi, aktiv: false })])
t.ok('kikapcsolva eltűnik a publikus oldalról', null, (await pub()).egyedi)
const [{ x: meg2 }] = await q(`select public.bejelentes_adat() x`)
t.ok('az adminban megmarad', [false, 2, 'JOBB'], [meg2.egyedi.aktiv, meg2.egyedi.kepek.length, meg2.egyedi.igazitas])

console.log('\n=== 5) Közvetlen táblahozzáférés tiltva ===\n')
await db.exec(`set role anon`)
t.ok('anon nem olvassa a táblát', true, /permission denied/.test(await hiba(`select * from public.oldal_bejelentes`)))
t.ok('anon nem hívhatja a mentést', true, /permission denied/.test(await hiba(`select public.egyedi_mentes('{}')`)))
t.ok('anon olvashatja a publikus oldalt', null, await hiba(`select public.publikus_oldal()`))
await db.exec(`reset role`)

t.vege()
