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

## v37 — ami ennél a verziónál a te dolgod

1. **Kicsomagolás** a szokásos módon (lent: előbb törölj, aztán másolj).
2. **Adatbázis:** `cd mosathat-admin && npm run db:push`. Hat új migráció
   megy fel (`20261003090000` … `20261003150000`): cégek, szerződés
   csomagonként, Hozza/Viszi, kapacitás és munkaidő-változás, a nap
   sorrendje, Áttekintés, Profilom, cég nézet. Előtte ki lehet próbálni:
   `node scripts/migracio-teszt.mjs`.
3. **Mindhárom alkalmazottnak legyen saját fiókja, Alkalmazott
   szerepkörrel.** A kapacitás az Alkalmazott fiókokból számol: ha valaki
   bejelenti, hogy korábban megy, a nap kapacitása arra az időre 80%-ra esik
   (két hiányzónál 40%-ra). Akinek nincs fiókja, az a számításban nem létezik.
4. **Szerződések:** a régi árak átkerültek — a „normál" a Startra, a
   „prémium" a Premiumra ÉS az Elitre. Nyisd meg mindegyik szerződést
   (Cégek és bérletesek → Szerződéses cégek → Szerkesztés), és nézd át: az
   Elitnek jó eséllyel saját ára van, és most már a **Magán** ár (a cég
   dolgozóinak saját autója) is megadható.
5. **Realtime:** a migráció magától bekapcsolja az élő frissítést a
   `day_order` és a `staff_absences` táblára (ha a Supabase-ben a
   `supabase_realtime` kiadvány létezik). Ellenőrizni: Database →
   Replication.

A foglalások ára visszamenőleg NEM változik. Egy régi foglalás akkor kapja
meg a szerződéses árat, ha valamit átírsz rajta (az újraszámolja).

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

## Éles indulás: a próbaadatok törlése

Amíg próbálgattátok a rendszert, felkerültek rá kitalált ügyfelek és
időpontok. Éles indulás előtt ezt egyszer ki kell üríteni.

Supabase → **SQL Editor**, az egész blokk egyben. Sorban ezt csinálja:

1. Az áthelyezett foglalások egymásra mutatnak, ezért a kapcsolatot előbb
   elengedi, különben a törlés önmagába akadna.
2. Törli a foglalásokat. Velük megy a tételsoruk, a munkalistájuk, a
   többnapos foglaltságuk és a felhasznált bérletalkalom is.
3. Törli az ügyfeleket. Velük megy a járművük és a bérletük is.
4. Törli a cégeket. Velük megy a szerződésük és a szerződéses áruk is.
5. Törli a naplót, mert az a próbaidőszak műveleteiről szól.

```sql
begin;
update public.bookings set moved_to_booking_id = null;
delete from public.bookings;
delete from public.customers;
delete from public.companies;
delete from public.audit_log;
commit;
```

**Ami megmarad:** a csomagok, az árak, az időtartamok, az egyéb
szolgáltatások, a felárak, a nyitvatartás, a munkaidő, a szünetek, a
beállítások, a kivételnapok és a felhasználók.

**Ez nem visszavonható.** A `begin` / `commit` csak annyit véd, hogy ha a
blokk közben elakad, semmi nem törlődik félig.

---

## Éles indulás előtti ellenőrzés

A törlés után ez megmondja, mi hiányzik még:

```sql
select 'ügyfél maradt' as mi, count(*)::int as ennyi, 0 as kell from public.customers
union all
select 'foglalás maradt', count(*)::int, 0 from public.bookings
union all
select 'csomag', count(*)::int, 3 from public.packages
union all
select 'hiányzó Kívül/Belül időtartam', count(*)::int, 0
  from public.package_pricing where scope <> 'TELJES' and duration_minutes is null
union all
select 'hiányzó ár a csomagoknál', count(*)::int, 0
  from public.package_pricing where price_huf is null and not requires_quote
union all
select 'hiányzó ár az egyéb szolgáltatásoknál', count(*)::int, 0
  from public.extras where active and price_huf is null and not requires_quote
union all
select 'belépni tudó felhasználó', count(*)::int, -1
  from public.staff s join auth.users u on u.id = s.id where s.active
union all
select 'nyitvatartási nap', count(*)::int, 7 from public.business_hours
union all
select 'párhuzamosan mosott autó', default_parallel_slots::int, -1 from public.shop_settings
order by 1;
```

Ahol az `ennyi` és a `kell` eltér, ott van teendő. A `-1` azt jelenti, hogy
nincs elvárt érték — csak nézd meg, hogy stimmel-e.

A két hiányozni szokó adat nem elméleti probléma:

- **Hiányzó Kívül/Belül időtartam** — az ilyen foglalás nem terheli a napi
  kapacitást, tehát a nap tele lehet úgy, hogy a rendszer szerint üres.
- **Hiányzó ár az egyéb szolgáltatásoknál** — az a tétel nulla forinttal megy
  bele a foglalásba. A munka elkészül, a pénz nincs kiszámlázva.

Mindkettő a **Szolgáltatások** menüpontban tölthető ki.

---

## Ha senki nem tud belépni

A Felhasználók képernyőn minden sor végén van **Új jelszó** gomb: a tulaj
adhat újat az alkalmazottnak, a fejlesztő bárkinek. A saját jelszavadat az
oldalsávban, a neved alatt tudod átírni — ott a mostanit is meg kell adni.

Egy esetre ez nem elég: amikor **senki nem tud belépni**. Ilyenkor a
Supabase → SQL Editorból:

```sql
select public.jelszo_visszaallitas('tulaj@mosathat.hu', 'ideiglenes123');
```

Visszaírja, kinek állította be, és figyelmeztet, ha az a hozzáférés ki van
kapcsolva. A jelszó legyen legalább 8 karakter; belépés után írd át magadnak.

**Ez a függvény a felületről szándékosan nem hívható** — ha hívható lenne, egy
alkalmazott saját magának adhatna tulajdonosi jelszót.

---

## Migráció ellenőrzése feltöltés előtt

Az `npm run db:push` az éles adatbázisra ír. Előtte egy paranccsal ki lehet
próbálni az összes migrációt egy igazi PostgreSQL-en, helyben:

```bash
node scripts/migracio-teszt.mjs
```

Ha elgépelés van egy migrációban, itt derül ki — nem a működő rendszeren.
Ugyanígy futtatható: `jarmu-teszt.mjs`, `veszjelszo-teszt.mjs`,
`urites-teszt.mjs`, `eles-ellenorzes.mjs`, `ugyfel-jog-teszt.mjs`,
`hozomviszem-teszt.mjs`, `kereses-teszt.mjs`, és a v37 szabályai:
`fazis1-teszt.mjs` (cégek, szerződéses árak, Hozza/Viszi, kapacitás),
`fazis3-db-teszt.mjs` (Áttekintés), `fazis4-db-teszt.mjs` (munkaidő-változás,
új szolgáltatás, cég nézet).

A telefonos elrendezéshez külön ellenőrzés van. Ehhez futnia kell a
fejlesztői kiszolgálónak (`npm run dev`), és telepítve kell lennie a
Playwrightnak:

```bash
node scripts/mobil-teszt.mjs
node scripts/urlap-teszt.mjs
node scripts/fazis2-teszt.mjs
node scripts/fazis3-teszt.mjs
node scripts/fazis4-teszt.mjs
```

A `fazis2` az új időpontot, a munkalapot és a „Biztosan elkészült?" kérdést,
a `fazis3` a napi listát, az áthúzást, a heti és havi nézetet és a tabletes
elrendezést, a `fazis4` a Profilomat, a szolgáltatásokat, az ügyfeleket és a
szerződést nézi végig.

Az első azt nézi, hogy a nagyítás tiltva van-e, az árlista kifér-e a
képernyőre, a mögöttes tartalom görgetése zárva van-e amíg az árlista nyitva,
és hogy a munkalap gombjai kiférnek-e — négy gombbal is.

A második a foglalási űrlapot: a szakaszok sorrendjét, hogy a rendszám és a
név mező is keres, és hogy az ablakot nem lehet oldalra elhúzni.

---

## Régi adatok feltöltése

A **Felhasználók** képernyő tetején van egy kapcsoló:
*Ügyfelek, cégek és bérletesek szerkesztése*.

Alapból csak a tulajdonos és a fejlesztő tud ügyfelet, autót, bérletet és
szerződést átírni — az alkalmazott ezeket a képernyőket csak olvassa. A napi
munkáját ez nem érinti: foglalást felvenni, módosítani, lezárni és bérletből
alkalmat levonni továbbra is tud.

A régi, papíros adatok feltöltésekor viszont mindenki gépel, aki ráér. Ezért:

1. **Feltöltés előtt** kapcsold be az *Alkalmazott* soránál — ettől minden
   alkalmazott tud ügyfelet felvenni és szerkeszteni.
2. **Feltöltés után** kapcsold vissza. Egy kattintás, mindenkire hat.

Ha valakinél máshogy kell, mint a szerepköréhez tartozik, a listában a saját
sorában is van kapcsoló; a *vissza a szerepköréhez* felirat állítja helyre.

Maga a felvétel: **Ügyfelek → + Ügyfél hozzáadása**. Az autó rendszáma ott van
ugyanabban az ablakban, tehát egy papírsor egy ablak.

A telefonszám az, amin az ügyfelet később megtalálod. A `+36 30 111 2233` és a
`06 30 111 2233` a rendszernek UGYANAZ a szám: nem lesz belőle két ügyfél, és
bármelyik alakra rákeresve előjön. Ha a szám már szerepel valakinél, a mentés
megáll és megmondja, kinél — a *Mégis felveszem* gomb viszi tovább.

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
| **Áttekintés** | Mai várható bevétel, autószám, foglalt munka (ugyanaz, mint a napi kártyán), heti kapacitás naponta, leggyakoribb csomagok, kattintható figyelmeztetések |
| **Időpontok** | Napi lista kézi sorrenddel (áthúzás), többnapos munka minden napján, munkalap, státuszok, élő frissítés; heti nézetben a többnaposak sávként |
| **Szolgáltatások** | Csomagárak, időtartamok, extrák, új egyéb szolgáltatás felvétele — **itt kell pótolni a hiányzó adatokat** |
| **Cégek és bérletesek** | Bérletek egyedi tételekkel; szerződés csomagonként (Start, Premium, Elit), méretenként, Céges és Magán áron; hozom-viszem fuvardíj |
| **Ügyfelek** | Egy oldal, három nézet: jármű, ügyfél és cég szerint. Új ügyfél és további jármű felvétele |
| **Profilom** | Mindenkinek: jelszó, kilépés, munkaidő-változás bejelentése (később jön, korábban megy, napközben távol, egész nap) |
| **Felhasználók** | Három szerepkör, új felhasználó felvétele, ki- és visszakapcsolás, jelszó, ügyfélszerkesztési jog szerepkörre és fiókra |
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

A „Kész van" és az „Átvette" rákérdez („Biztosan elkészült?" Igen / Nem),
a „Megérkezett" nem. A gomb csak az adott autó állapotát váltja: a lista
nem töltődik újra, és a sorrend sem változik.

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
   `bookings` és `booking_tasks` táblákra (a `day_order` és a
   `staff_absences` a v37 migrációval magától bekapcsol), különben a többi
   gépen nem frissül magától a képernyő.
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
