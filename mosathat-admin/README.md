# Mosathat — admin felület

Autókozmetika ügyviteli rendszer. Ez a csomag az **admin** része: a napi
időpontok, a foglalásfelvitel és a munkafolyamat.

## Indítás

```bash
npm install
npm run dev
```

Nyisd meg: http://localhost:5173

Nem kell hozzá se fiók, se internet, se Supabase. Az alkalmazás alapból
**demó módban** indul.

## A két üzemmód

A `.env` fájl egyetlen sora dönti el, honnan jön az adat.

### `VITE_DATA_SOURCE=demo` (alapértelmezett)

A [PGlite](https://pglite.dev) egy WebAssemblyre fordított PostgreSQL. A
böngészőben fut, és **ugyanaz az öt migráció** fut le benne, ami majd a
Supabase-en: ugyanaz a `calc_service()`, ugyanazok a nézetek, ugyanaz a
`create_booking()`.

Ez fontos: nem egy leutánzott, egyszerűsített demó. Ugyanaz a motor. Nem
fordulhat elő, hogy a demó más árat mutat, mint az éles.

Amit pótolni kell hozzá, az a Supabase `auth` sémája — három sor a
`src/data/demo.ts` tetején. A jogosultság-szűrés (RLS) emiatt demóban
nem működik: egy felhasználó van, és az mindent lát.

Az adat a memóriában él. Lap újratöltésekor minden visszaáll a kiinduló
állapotra — bemutatáshoz ez előny.

### `VITE_DATA_SOURCE=supabase`

Az éles adatbázis. Ehhez kell:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Az `anon` kulcs nyugodtan benne lehet a kiszállított JavaScriptben:
önmagában semmit nem lát, mert az RLS a bejelentkezett felhasználóhoz
köti a hozzáférést.

A PGlite ilyenkor **le sem töltődik** — dinamikus importtal külön darabba
kerül, amit csak a demó kér be. (Fő bundle: ~180 KB. PGlite: ~13 MB.)

## Az adatbázis

```
supabase/migrations/
  0001_schema.sql         táblák, enumok, RLS
  0002_seed.sql           a valódi árak, csomagok, extrák, nyitvatartás
  0003_booking_engine.sql calc_service, munkalista, kapacitás, nézetek
  0004_demo.sql           próbaadat (a végén ott a törlőparancs)
  0005_admin_api.sql      lookup_plate, create_booking, státusz, pipálás
```

Supabase-en sorrendben kell lefuttatni őket az SQL Editorban. Éles
indulásnál a `0004` kihagyható, vagy a végén lévő törlőparanccsal
takarítható.

### Miért van a logika az adatbázisban?

Mert három helyen kell ugyanaz az eredmény: az adminban, a publikus
árkalkulátorban és majd az online foglalásnál. Ha mindhárom külön
számolna, előbb-utóbb eltérnének — és a különbséget az ügyfél venné
észre.

A `create_booking()` ugyanezért egyetlen függvény: egy foglalás hat
dolgot jelent (ügyfél, jármű, árszámítás, foglalás, tételek, munkalista).
Ha ez hat külön kérés a böngészőből, a harmadik után megszakadó net
félkész adatot hagy maga után.

## Mappaszerkezet

```
src/
  styles/tokens.css   ← EZT kell cserélni, ha a koncepció változik
  styles/*.css        a többi CSS-ben nincs konkrét szín vagy méret,
                      mind a tokenekre hivatkozik

  data/source.ts      a felület EGYETLEN adat-interfésze
  data/demo.ts        PGlite mögötte
  data/supabase.ts    Supabase mögötte
  data/index.ts       melyik fut

  lib/types.ts        DB típusok + magyar feliratok egy helyen
  lib/format.ts       Ft, idő, dátum — időzóna CSAK itt

  state/              React állapot (katalógus, nap, foglalási űrlap)
  features/           képernyők
```

A `tokens.css` a lényeg: a komponensekben nincs egyetlen `#` színkód sem.
Ha holnap kiderül, hogy mégis másik arculat kell, az az egy fájl íródik
át.

## Linter

**Oxlint** (Rust-alapú, az ESLint helyett). Futtatás:

```bash
npm run lint         # ellenőrzés
npm run lint:fix     # ami automatikusan javítható
```

A `npm run build` is lefuttatja: ami `correctness` hiba, az nem mehet ki.

A beállítás a `.oxlintrc.json`-ban van, soronként megmagyarázva, hogy
melyik szabály miért van ki- vagy bekapcsolva. A rövid indoklás: az
alapértelmezett teljes szabálykészlet 90%-ban zajt ad ennél a projektnél
(pl. `react-in-jsx-scope`, ami a Vite automatikus JSX-fordítója mellett
tárgytalan), és egy linter, amit senki nem néz meg, rosszabb a semminél.

Jelenleg 0 hiba és 9 figyelmeztetés van. A figyelmeztetések szándékosan
maradtak benne — dokumentált, halasztott döntések, nem elfelejtett munka.

## Ami már működik

- Belépés (élesben Supabase Auth)
- Napi nézet: órasávok a `work_windows()`-ból, tehát a ledolgozós szombat
  és az ünnep magától helyes
- Kapacitássáv, napi összegek, figyelmeztetések
- Nálunk álló autók (több napos kereskedős munkák)
- Új időpont: rendszám-keresés, korábbi munkák átvétele egy kattintással,
  élő ár és idő a `calc_service()`-ből, ebédszünet-szabály ellenőrzése
- Foglalás megnyitva: állapotváltás, munkalista pipálása, végleges ár
- Nyitvatartáson kívül végzett munka — a pipálások időbélyegéből, külön
  adatrögzítés nélkül

## Ami még hiányzik az adatokból

Ezek nélkül a rendszer működik, de jelzi a hiányt:

- a 18 Kívül/Belül időtartam — enélkül a csak külső / csak belső munka
  nem terheli a kapacitást (a felület figyelmeztet rá)
- 7 extra ára: felni és gumi mélytisztítás, karc eltávolítás,
  bőrtisztítás, tetőkárpit, ajtókárpit, ózongenerátor, motortér kozmetika
- a gumiápolás külön ára
