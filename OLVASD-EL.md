# Mosathat — indulás

## Elindítás (két parancs)

```bash
cd mosathat-admin
npm install
npm run dev
```

Nyisd meg: **http://localhost:5173**

A belépő képernyőn válaszd ki, kiként lépsz be (Fejlesztő, Tulajdonos vagy
Alkalmazott), jelszó nem kell. Nyomd meg a Belépés gombot.

Nem kell hozzá Supabase, fiók vagy internet: az alkalmazás alapból **demó
módban** indul, ahol a PostgreSQL a böngésződben fut, próbaadatokkal. Az
első betöltés 5–10 másodperc, mert akkor tölti be az adatbázist.

---

## Kicsomagolás: előbb törölj, aztán másolj

A zip csak **hozzáad és felülír**. Amit egy korábbi verzióból törölni kellett,
az a gépeden marad — és a `tsc` minden fájlt lefordít a `src` alatt, nem csak
azokat, amikre hivatkozik. Egy ottfelejtett régi képernyő ezért megbuktatja a
Vercel buildet, pedig már semmi nem használja.

Ezért kicsomagolás ELŐTT, a repó gyökerében:

```bash
rm -rf mosathat-admin/src supabase/migrations
```

Ez a két mappa az, ami teljesen a zipből jön. A `.env`, a `node_modules` és a
`.git` érintetlen marad.

Ha egy build mégis ismeretlen fájlra panaszkodik, az szinte biztosan ilyen
maradvány: töröld, és menj tovább.

---

## Mi hol van

```
Mosathat/                     <- a repó gyökere (.git itt van)
  supabase/                   <- KÖZÖS adatbázis: ezt fogja használni
    config.toml                  az admin és később a publikus oldal is
    migrations/               <- ami élesbe kimegy
    demo/                     <- próbaadat, élesbe SOHA nem megy
  mosathat-admin/             <- ez az alkalmazás
    src/
    README.md                 <- a részletes leírás itt van
  mosathat-web/               <- később: a publikus weboldal
```

---

## Amikor jön a Supabase

1. Supabase projekt létrehozása (régió: **eu-central-1 / Frankfurt**)
2. A GitHub-integrációban a **Working directory** maradjon `.`
3. `git push` — a migrációk automatikusan lefutnak
4. A `mosathat-admin/.env` fájlban (ez a fájl NINCS a csomagban, hogy a
   kulcsaidat ne írja felül — magadnak kell létrehoznod a `.env.example`
   alapján):

```
VITE_DATA_SOURCE=supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Ellenőrzés, hogy tényleg átment-e minden:

```bash
cd mosathat-admin
npx supabase login
npm run db:link
npm run db:status
```

---

## Mi van kész

| Menüpont | Mit tud |
|---|---|
| **Áttekintés** | Mai várható bevétel, autószám, foglalt munka, heti kapacitás naponta, leggyakoribb csomagok, figyelmeztetések |
| **Időpontok** | Napi nézet, helyben szerkeszthető adatok, munkalap, státuszok, élő frissítés |
| **Szolgáltatások** | Csomagárak, időtartamok, extrák — **itt kell pótolni a hiányzó adatokat** |
| **Cégek és bérletesek** | Bérletek egyedi tételekkel, szerződéses ft/autó árak |
| **Ügyfelek** | Egy oldal, két nézet: jármű szerint vagy ügyfél szerint |
| **Felhasználók** | Három szerepkör, új felhasználó felvétele, ki- és visszakapcsolás |
| **Beállítások** | Nyitvatartás, munkaidő, szünetek, kivételnapok, párhuzamos autók, bérlet alapérték |

Szürkén: Készlet, Galéria, Tartalom — ezek még nincsenek meg.

### Helyben szerkesztés

A munkalapon és az Ügyfelek alatt **minden adatra rá lehet kattintani és át
lehet írni**. Enter ment, Escape visszavon. Nincs külön Mentés gomb.

A munkalapon ez a lezárásig működik. Lezárás után a foglalás végleges — ha
javítani kell, előbb vissza kell nyitni.

Ha a csomagot, a terjedelmet vagy a méretet írod át, az ár, az idő és a
munkalista automatikusan újraszámolódik. A már kipipált lépések megmaradnak.

### A munkafolyamat három lépés

Megérkezett → Kész van → Átvette. A korábbi „Kezdjük" lépés kikerült: a
gyakorlatban vagy elfelejtették megnyomni, vagy utólag nyomták meg. A munka
kezdetének most az érkezés ideje számít, ezt a rendszer magától rögzíti.

### Szerepkörök

| | Fejlesztő | Tulajdonos | Alkalmazott |
|---|---|---|---|
| Időpontok, munkalap | igen | igen | igen |
| Ügyfelek, árak, bérletek megtekintése | igen | igen | igen |
| Árak és szolgáltatások szerkesztése | igen | igen | **nem** |
| Bérlet és szerződés kezelése | igen | igen | **nem** |
| Áttekintés (bevétel, kapacitás) | igen | igen | **nem** |
| Beállítások | igen | igen | **nem** |
| Felhasználók | mindenkit | csak alkalmazottat | **nem** |

Az alkalmazott a tiltott menüpontokat **nem szürkén látja, hanem sehogy**. A
Szolgáltatások és a Cégek menüpont neki nem a szerkesztő, hanem egy árlista és
egy bérletlista — ott nincs egyetlen beviteli mező sem.

A tiltás nem a képernyőn van, hanem az adatbázisban: RLS szabályok és
triggerek. Ha valaki megkerüli a felületet, ugyanúgy nemet kap.

Demóban mindhárom szerepkörrel be lehet lépni — a belépő képernyőn lehet
választani. Érdemes végignézni, mit lát egy alkalmazott.

**Új felhasználó felvétele**: név, e-mail és egy kezdő jelszó. A Supabase
service role kulcs nem kerül a böngészőbe; helyette meghívó készül az
adatbázisban, és a szerepkör onnan jön — nem a böngészőből. Ha a Supabase-ben
be van kapcsolva az e-mail megerősítés, az új dolgozónak előbb a levélben lévő
linkre kell kattintania.

### Amit még neked kell megcsinálni

1. **Szolgáltatások** → a hiányzó 18 Kívül/Belül időtartam és 8 extra ár.
   Amíg ezek üresek, a rendszer nem tud pontos időt és árat mondani rájuk.
   Az Áttekintés figyelmeztetései is ezt mondják.
2. Supabase → Database → **Replication**: kapcsold be a realtime-ot a
   `bookings` és `booking_tasks` táblákra, különben a többi gépen nem
   frissül magától a képernyő.
3. **Beállítások → Nyitvatartás**: ellenőrizd, hogy a munkaidő és az
   ebédszünet stimmel-e. Ebből számol a kapacitás.

---

## Hasznos parancsok

Mind a `mosathat-admin` mappából:

| parancs | mit csinál |
|---|---|
| `npm run dev` | fejlesztői szerver |
| `npm run build` | lint + típusellenőrzés + éles build |
| `npm run lint` | csak a linter |
| `npm run db:status` | mi futott le már az adatbázisban |
| `npm run db:push` | migrációk kitelepítése kézzel |

---

Részletes leírás: **`mosathat-admin/README.md`**
