import { adatbazis, tesztelo, TULAJ, FEJL, ALK } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p = []) => (await db.query(s, p)).rows
const egy = async (s, p = []) => (await q(s, p))[0]
const hiba = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }
const ki = async (uid) => q(`select set_config('app.uid', $1, false)`, [uid])

const ZIP = (jel) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`proba-${jel}`)]).toString('base64')
const tartalom = (jel) => [{ r: [{ s: `Impresszum ${jel}` }], t: 'h1' }, { r: [{ s: `Szöveg ${jel}` }], t: 'p' }]
const feltolt = async (jel, dok = 'impresszum', nyelv = 'hu', extra = {}) =>
  (await egy(`select jogi_valtozat_feltoltes($1) id`, [JSON.stringify({
    dokumentum: dok, nyelv, fajlnev: `${dok}-${jel}.docx`, fajl: ZIP(jel), tartalom: tartalom(jel), ...extra,
  })])).id
const lista = async (dok = 'impresszum', nyelv = 'hu') =>
  ((await egy(`select jogi_valtozatok() x`)).x).filter((v) => v.dokumentum === dok && v.nyelv === nyelv)
const publikus = async (dok = 'impresszum', nyelv = 'hu') => (await egy(`select publikus_jogi($1, $2) x`, [dok, nyelv])).x
const nevek = (l) => l.map((v) => (v.beepitett ? 'beépített' : v.fajlnev))

console.log('=== 1) Jogosultság ===\n')
const jog = async (szerep, fv) => (await egy(`select has_function_privilege($1, $2, 'execute') a`, [szerep, fv])).a
t.ok('belépés nélkül csak a publikus olvasás hívható', [false, false, false, false, true], [
  await jog('anon', 'public.jogi_valtozatok()'),
  await jog('anon', 'public.jogi_valtozat_feltoltes(jsonb)'),
  await jog('anon', 'public.jogi_valtozat_fajl(uuid)'),
  await jog('anon', 'public.jogi_valtozat_visszaallitas(uuid)'),
  await jog('anon', 'public.publikus_jogi(text,text)'),
])
t.ok('a tábla közvetlenül senkinek sem olvasható', [false, false], [
  (await egy(`select has_table_privilege('anon', 'public.jogi_valtozatok', 'select') a`)).a,
  (await egy(`select has_table_privilege('authenticated', 'public.jogi_valtozatok', 'select') a`)).a,
])
await ki(ALK)
const tiltott = /csak a tulajdonos és a fejlesztő/
t.ok('alkalmazott nem láthatja, nem tölthet fel', [true, true], [
  tiltott.test(await hiba(() => lista()) ?? ''),
  tiltott.test(await hiba(() => feltolt('x')) ?? ''),
])
await ki('')
t.ok('belépés nélkül sem', true, tiltott.test(await hiba(() => feltolt('x')) ?? ''))

console.log('\n=== 2) Kiinduló állapot ===\n')
await ki(TULAJ)
t.ok('még nincs változat, a weboldal a beépített szöveget mutatja', [[], null, null], [await lista(), await publikus(), await publikus('adatvedelem', 'en')])

console.log('\n=== 3) Feltöltés ===\n')
const v1 = await feltolt('v1')
const l1 = await lista()
t.ok('az első feltöltéskor a beépített szöveg lesz az előző változat', [['impresszum-v1.docx', 'beépített'], [true, false]],
  [nevek(l1), l1.map((v) => v.aktiv)])
t.ok('a feltöltő neve és a fájl mérete', ['Tulajdonos', 12], [l1[0].feltolto_nev, l1[0].meret])
t.ok('a weboldal már a feltöltött szöveget kapja', tartalom('v1'), await publikus())
t.ok('a többi dokumentum és nyelv változatlan', [null, null, null],
  [await publikus('impresszum', 'en'), await publikus('adatvedelem', 'hu'), await publikus('adatvedelem', 'en')])
t.ok('a lista nem tartalmazza a fájlt és a szöveget', false, 'fajl' in l1[0] || 'tartalom' in l1[0])

await ki(FEJL)
await feltolt('v2')
await feltolt('v3')
await ki(TULAJ)
await feltolt('v4')
t.ok('négy feltöltés után: a jelenlegi és 3 előző, a beépített már kiesett',
  ['impresszum-v4.docx', 'impresszum-v3.docx', 'impresszum-v2.docx', 'impresszum-v1.docx'], nevek(await lista()))
await feltolt('v5')
const l5 = await lista()
t.ok('az ötödiknél a legrégebbi törlődik', ['impresszum-v5.docx', 'impresszum-v4.docx', 'impresszum-v3.docx', 'impresszum-v2.docx'], nevek(l5))
t.ok('a fejlesztő feltöltése is a nevével szerepel', 'Fejlesztő', l5.find((v) => v.fajlnev === 'impresszum-v3.docx')?.feltolto_nev)
t.ok('a törölt változat fájlja sem kérhető le', true,
  /már nincs meg/.test(await hiba(() => q(`select jogi_valtozat_fajl($1)`, [v1])) ?? ''))

console.log('\n=== 4) Letöltés és visszaállítás ===\n')
const v2 = l5.find((v) => v.fajlnev === 'impresszum-v2.docx').id
const f2 = (await egy(`select jogi_valtozat_fajl($1) x`, [v2])).x
t.ok('a régi változat fájlja bájtra ugyanaz', ['impresszum-v2.docx', ZIP('v2'), false], [f2.fajlnev, f2.fajl, f2.beepitett])
await ki(TULAJ)
await q(`select jogi_valtozat_visszaallitas($1)`, [v2])
const lv = await lista()
t.ok('visszaállítás után a v2 a jelenlegi, a többi sorrendben az előző', ['impresszum-v2.docx', 'impresszum-v5.docx', 'impresszum-v4.docx', 'impresszum-v3.docx'], nevek(lv))
t.ok('nem törlődött semmi, és látszik, ki töltötte fel és ki állította vissza', [4, 'Tulajdonos', 'Fejlesztő'],
  [lv.length, lv[0].aktivalta_nev, lv[0].feltolto_nev])
t.ok('a weboldal a visszaállított szöveget kapja', tartalom('v2'), await publikus())
await ki(ALK)
t.ok('alkalmazott nem állíthat vissza és nem tölthet le', [true, true], [
  tiltott.test(await hiba(() => q(`select jogi_valtozat_visszaallitas($1)`, [v2])) ?? ''),
  tiltott.test(await hiba(() => q(`select jogi_valtozat_fajl($1)`, [v2])) ?? ''),
])

console.log('\n=== 5) Vissza a beépített szövegre ===\n')
await ki(TULAJ)
await feltolt('a1', 'adatvedelem', 'en')
const la = await lista('adatvedelem', 'en')
await q(`select jogi_valtozat_visszaallitas($1)`, [la.find((v) => v.beepitett).id])
t.ok('a beépített visszaállítva: a weboldal ismét a beépített szöveget mutatja', [null, ['beépített', 'adatvedelem-a1.docx']],
  [await publikus('adatvedelem', 'en'), nevek(await lista('adatvedelem', 'en'))])
await feltolt('a2', 'adatvedelem', 'en')
t.ok('újabb feltöltéskor nem kerül be második beépített', ['adatvedelem-a2.docx', 'beépített', 'adatvedelem-a1.docx'], nevek(await lista('adatvedelem', 'en')))

console.log('\n=== 6) Ellenőrzések ===\n')
const rossz = async (extra) => hiba(() => feltolt('r', 'impresszum', 'hu', extra))
t.ok('nem Word-fájl', true, /nem Word/.test(await rossz({ fajl: Buffer.from('%PDF-1.4 proba').toString('base64') }) ?? ''))
t.ok('üres dokumentum', true, /nincs szöveg/.test(await rossz({ tartalom: [] }) ?? ''))
t.ok('túl nagy fájl', true, /túl nagy/.test(await rossz({ fajl: 'UEsD' + 'A'.repeat(2800000) }) ?? ''))
t.ok('ismeretlen dokumentum és nyelv', [true, true], [
  /Ismeretlen dokumentum/.test(await rossz({ dokumentum: 'aszf' }) ?? ''),
  /Ismeretlen nyelv/.test(await rossz({ nyelv: 'de' }) ?? ''),
])
t.ok('hiányzó fájlnév', true, /neve hiányzik/.test(await rossz({ fajlnev: '  ' }) ?? ''))
t.ok('a hibás feltöltések nem kerültek be', 4, (await lista()).length)

t.vege()
