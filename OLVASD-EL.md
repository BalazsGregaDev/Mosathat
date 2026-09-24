# Mosathat — indulás

## Elindítás (két parancs)

```bash
cd mosathat-admin
npm install
npm run dev
```

Nyisd meg: **http://localhost:5173**

A belépő képernyőn az e-mail már ki van töltve, jelszó nem kell. Nyomd meg
a Belépés gombot.

Nem kell hozzá Supabase, fiók vagy internet: az alkalmazás alapból **demó
módban** indul, ahol a PostgreSQL a böngésződben fut, próbaadatokkal. Az
első betöltés 5–10 másodperc, mert akkor tölti be az adatbázist.

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
4. A `mosathat-admin/.env` fájlban:

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
