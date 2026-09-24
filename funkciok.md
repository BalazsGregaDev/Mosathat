# Funkciólista

Készült: 2026.09.19. Forrás: a Mosathat projektterv és az eddigi döntések.

Ez a lista minden funkciót egy helyen sorol fel. Három dologra jó:

- **fejlesztés közben** kipipálható lista, amiből látszik, hol tartasz
- **ajánlat mellékleteként** pontosan megmutatja, mit kap az ügyfél a pénzéért
- **portfólióban** egy helyen van, mit tud a rendszer

Minden sornak van azonosítója, hogy hivatkozni lehessen rá — commit üzenetben,
hibajegyben vagy ajánlatban.

**Fázisok:** F0 alapok · F1 belső napi használat (MVP) · F2 kifelé nyitás ·
F3 üzemeltetés · F4 tartalom és anyagkezelés

| Fázis | Funkciók száma |
|---|---|
| F0 — Alapok | 3 |
| F1 — Belső napi használat (MVP) | 62 |
| F2 — Kifelé nyitás | 53 |
| F3 — Üzemeltetés | 22 |
| F4 — Tartalom és anyag | 9 |
| **Összesen** | **149** |

Területek szerint: foglalás 20 · weboldal 16 · naptár 14 · szolgáltatások és árak 12 ·
statisztika 11 · ügyfél és jármű 10 · értesítések 9 · admin 8 · tartalomkezelés 8 ·
munkalista 7 · online foglalás 7 · SEO 7 · GDPR 7 · anyagkezelés 5 · HozomViszem 4 ·
integrációk 4.

---

## A. Foglalás — FOG

| ID | Funkció | Fázis |
|---|---|---|
| FOG-01 | Négy foglalástípus: várós, leadós, többnapos, HozomViszem | F1 |
| FOG-02 | Gyors foglalásfelvitel — cél: 15 másodperc egy telefonhívás alatt | F1 |
| FOG-03 | Rendszám beírására előjön az ügyfél, a jármű és az előzménye | F1 |
| FOG-04 | Csomag, járműkategória és terjedelem (kívül / belül / teljes) választása | F1 |
| FOG-05 | Full Service kapcsoló, az ár a saját ártáblából jön | F1 |
| FOG-06 | Extrák hozzáadása mennyiséggel (ajtó, ülés, liter) | F1 |
| FOG-07 | Automatikus ár- és időszámítás minden összetevőből | F1 |
| FOG-08 | Felár hozzáadása a helyszínen, 0–50% sávban vagy fix összeggel | F1 |
| FOG-09 | Ebédszünet-szabály: a legkésőbbi kezdés sávonként magától adódik | F1 |
| FOG-10 | Ha nem fér bele egyik sávba sem, a rendszer leadós foglalást ajánl | F1 |
| FOG-11 | Száradós extránál éjszakás leadás felajánlása — az ügyfél dönt | F1 |
| FOG-12 | Árajánlatos tételnél foglalás helyett árajánlatkérés | F1 |
| FOG-13 | Állapotgép tíz állapottal | F1 |
| FOG-14 | Lemondás kettéválasztva: ügyfél mondta le vagy a műhely, plusz no-show | F1 |
| FOG-15 | Időpont áthelyezése új foglalásként, az eredetire mutató kapcsolattal | F1 |
| FOG-16 | Lezáráskor a végleges ár és a tényleges munkaidő rögzítése | F1 |
| FOG-17 | Ár, név és időtartam lementése a foglalásra — áremelés nem írja át a múltat | F1 |
| FOG-18 | Több napos munkánál kötelező határidő | F1 |
| FOG-19 | Ügyfélnek szóló és belső megjegyzés külön mezőben | F1 |
| FOG-20 | A foglalás forrásának rögzítése (telefon / online / személyes / Messenger) | F1 |

## B. Naptár és kapacitás — NAP

| ID | Funkció | Fázis |
|---|---|---|
| NAP-01 | Nap nézet | F1 |
| NAP-02 | Hét nézet | F1 |
| NAP-03 | Kapacitáscsík: lefoglalt és szabad munkaóra, telítettség százalékban | F1 |
| NAP-04 | „Nálunk álló autók" sáv a naptár alatt, a több napos munkáknak | F1 |
| NAP-05 | Készültség (4/9) és a bent töltött napok száma a kártyán | F1 |
| NAP-06 | Határidő szerinti rendezés, két napon belül lejáró kiemelése | F1 |
| NAP-07 | A párhuzamos autók száma naponta felülírható (2 vagy 3) | F1 |
| NAP-08 | Figyelmeztetés kapacitás-túllépésnél — de tiltás nincs | F1 |
| NAP-09 | Három nyitvatartási réteg: hivatalos, tényleges munkaidő, leadás 7:15-től | F1 |
| NAP-10 | Ebédszünet mint blokkolt sáv a várós foglalásoknak | F1 |
| NAP-11 | Kivételnapok mindkét irányban: rendkívüli zárva és ledolgozós szombat | F1 |
| NAP-12 | Magyar munkaszüneti napok előre betöltve | F1 |
| NAP-13 | Napi óraterv a több napos munkákra, ha terveztek rájuk időt | F3 |
| NAP-14 | Hónap nézet | F3 |

## C. Munkalista — MUN

| ID | Funkció | Fázis |
|---|---|---|
| MUN-01 | Lépések automatikus generálása a csomagtartalomból és az extrákból | F1 |
| MUN-02 | Pipálás tableten, egy koppintással | F1 |
| MUN-03 | Rögzül, ki és mikor pipálta ki — ez adja a nyitvatartáson kívüli munka adatát | F1 |
| MUN-04 | Készültség megjelenítése a foglaláskártyán | F1 |
| MUN-05 | Kézi lépés hozzáadása, ha menet közben derül ki valami | F1 |
| MUN-06 | Ha minden kész, a rendszer felajánlja a KÉSZ állapotot — de nem lépteti magától | F1 |
| MUN-07 | „Csak kívül" foglalásnál a belső lépések rá sem kerülnek a listára | F1 |

## D. Ügyfél és jármű — UGY

| ID | Funkció | Fázis |
|---|---|---|
| UGY-01 | Ügyfél lehet magánszemély vagy cég | F1 |
| UGY-02 | Céges adatok: cégnév, adószám | F1 |
| UGY-03 | Egy ügyfélhez több jármű | F1 |
| UGY-04 | Rendszám formátum kényszerítése nélkül, normalizált kereséssel | F1 |
| UGY-05 | Ország automatikus felismerése magyar minta alapján, kézzel átírható | F1 |
| UGY-06 | Ülésszám nyilvántartása — a Full Service öt ülésre szól | F1 |
| UGY-07 | Teljes ügyfél- és járműtörténet | F1 |
| UGY-08 | Céges ügyfélre szűrve egyben látszik, hány autója áll most nálatok | F1 |
| UGY-09 | Ügyfélprofil: látogatások, átlagos költés, leggyakoribb csomag, átlagos intervallum | F3 |
| UGY-10 | GDPR-anonimizálás: az adat kiürül, a statisztikai sor marad | F2 |

## E. Szolgáltatások és árak — SZO

| ID | Funkció | Fázis |
|---|---|---|
| SZO-01 | Csomagok egymásra épülve (Premium tartalmazza a Startot, Elit a Premiumot) | F1 |
| SZO-02 | Csomagtartalom külső és belső bontásban | F1 |
| SZO-03 | Tétel felülírása magasabb csomagban — falc áttörlés → mélytisztítás, gyors viasz → hosszantartó vax | F1 |
| SZO-04 | 27 ársor: csomag × járműkategória × terjedelem | F1 |
| SZO-05 | Időtartam ugyanezen három dimenzió szerint | F1 |
| SZO-06 | Full Service saját ártáblája, mert a kárpit ára csomagonként más | F1 |
| SZO-07 | Bármelyik árcella lehet szám helyett „Érdeklődjön" | F1 |
| SZO-08 | Extrák: ár, munkaidő, száradási idő, éjszakás ajánlás | F1 |
| SZO-09 | Az ár és az idő külön mértékegysége (6 500 Ft/ülés, de 45 perc az egész autóra) | F1 |
| SZO-10 | Egy tétel egyszerre lehet csomagtartalom és külön kérhető extra (gumiápolás) | F1 |
| SZO-11 | Felárak konfigurálása: típus, alapérték, maximum, idő-szorzó | F1 |
| SZO-12 | Minden adminból szerkeszthető — semmi nincs a kódba égetve | F1 |

## F. Admin alapok — ADM

| ID | Funkció | Fázis |
|---|---|---|
| ADM-01 | Bejelentkezés | F0 |
| ADM-02 | Szerepkörök: SUPERADMIN és STAFF | F0 |
| ADM-03 | Jogosultság az adatbázisban (RLS), nem a frontendben | F0 |
| ADM-04 | Felhasználók kezelése: létrehozás, szerepkör, deaktiválás | F1 |
| ADM-05 | Napló: ki, mit, mikor, mi volt előtte és utána | F1 |
| ADM-06 | Beállítások: leadás kezdete, párhuzamos autók, fordulóidő | F1 |
| ADM-07 | Telepíthető webalkalmazás (PWA) — a push értesítés feltétele | F2 |
| ADM-08 | Áttekintő dashboard: mai foglalások, bevétel, kapacitás, figyelmeztetések | F3 |

## G. Publikus weboldal — WEB

| ID | Funkció | Fázis |
|---|---|---|
| WEB-01 | Vite + React, build-time prerenderrel | F2 |
| WEB-02 | Aloldalanként saját cím, leírás és tartalom a nyers HTML-ben | F2 |
| WEB-03 | Mobil-first: hamburger menü fent, ragadós foglalás gomb alul | F2 |
| WEB-04 | Desktopon magazin navigáció, szekciónként finom színátmenettel | F2 |
| WEB-05 | A nyolc arculati koncepció közül a kiválasztott irány kivitelezése | F2 |
| WEB-06 | Hero és rövid bemutatkozás | F2 |
| WEB-07 | Csomag-összehasonlító táblázat háromféle cellával (van / nincs / más szinten) | F2 |
| WEB-08 | Extrák listája árral és időigénnyel | F2 |
| WEB-09 | Galéria szűrőkkel | F2 |
| WEB-10 | Előtte/utána összehasonlító csúszka | F3 |
| WEB-11 | Fontos információk: mélygarázs, bejárat a Dagály utcából, leadás 7:15-től | F2 |
| WEB-12 | GYIK | F2 |
| WEB-13 | Térkép | F2 |
| WEB-14 | Kapcsolat | F2 |
| WEB-15 | Szolgáltatás-aloldalak a helyi kereséshez | F2 |
| WEB-16 | Tudástár rich text szerkesztővel | F4 |

## H. Online foglalás és árkalkulátor — ONL

| ID | Funkció | Fázis |
|---|---|---|
| ONL-01 | Árkalkulátor: jármű → csomag → terjedelem → Full Service → extrák | F2 |
| ONL-02 | A kalkulátorból egy gombbal át lehet menni foglalásba | F2 |
| ONL-03 | Foglalási kérés a várós / leadós elágazással | F2 |
| ONL-04 | Nem kérdezi meg, mennyire koszos az autó — helyette tájékoztat a felárról | F2 |
| ONL-05 | A kérés jóváhagyása vagy elutasítása adminból | F2 |
| ONL-06 | Szerveroldali validáció és rate limiting — nincs publikus írási jog az adatbázison | F2 |
| ONL-07 | Várólista, ha nincs szabad időpont | F3 |

## I. Értesítések — ERT

| ID | Funkció | Fázis |
|---|---|---|
| ERT-01 | Csatorna-független értesítési réteg (email / SMS / push) | F2 |
| ERT-02 | Email visszaigazolás | F2 |
| ERT-03 | SMS visszaigazolás | F2 |
| ERT-04 | Előző napi emlékeztető | F2 |
| ERT-05 | Push értesítés a staffnak új online kérésről | F2 |
| ERT-06 | Tartalék: hangjelzés az adminban, és SMS a műhelynek 15 perc után | F2 |
| ERT-07 | Messenger bejövő forrásként, kimásolható válaszszöveggel | F2 |
| ERT-08 | „Elkészült az autó" értesítés | F3 |
| ERT-09 | Értékeléskérés a munka után | F4 |

## J. Tartalomkezelés — TAR

| ID | Funkció | Fázis |
|---|---|---|
| TAR-01 | A publikus oldal szekcióinak sorrendje húzható listával | F2 |
| TAR-02 | Látható / rejtett kapcsoló szekciónként | F2 |
| TAR-03 | A kötelező szekciók (kapcsolat, foglalás, nyitvatartás) nem rejthetők el | F2 |
| TAR-04 | „Közzététel" gomb, ami újrabuildeli az élő oldalt | F2 |
| TAR-05 | „Van nem publikált változás" jelzés | F2 |
| TAR-06 | Galéria kezelése: feltöltés, kategória, sorrend, kiemelés | F2 |
| TAR-07 | GYIK kezelése sorrenddel | F2 |
| TAR-08 | Szövegblokkok szerkesztése | F2 |

## K. Google értékelések és SEO — SEO

| ID | Funkció | Fázis |
|---|---|---|
| SEO-01 | Napi ütemezett értékelés-lehúzás (a Places API legfeljebb ötöt ad) | F2 |
| SEO-02 | Értékelések tárolása és beépítése a statikus oldalba | F2 |
| SEO-03 | Egyes értékelések kiemelése vagy elrejtése adminból | F2 |
| SEO-04 | Saját értékelésre NINCS strukturált adat — nem hoz csillagot, viszont szabálysértő | F2 |
| SEO-05 | LocalBusiness strukturált adat értékelés nélkül | F2 |
| SEO-06 | Sitemap, robots, canonical, Open Graph | F2 |
| SEO-07 | Core Web Vitals figyelése | F2 |

## L. Statisztikák — STA

| ID | Funkció | Fázis |
|---|---|---|
| STA-01 | Napi, heti és havi bevétel | F3 |
| STA-02 | Foglalásszám és átlagos kosárérték | F3 |
| STA-03 | Csomagok és extrák népszerűsége | F3 |
| STA-04 | Járműkategóriák aránya | F3 |
| STA-05 | Kapacitáskihasználtság | F3 |
| STA-06 | Tervezett és tényleges munkaidő eltérése | F3 |
| STA-07 | Nyitvatartáson kívül készült munkák bevétele — a pipálás időbélyegéből | F3 |
| STA-08 | Több napos munkák: bevétel, átlagos állásidő, egyszerre bent lévő autók | F3 |
| STA-09 | Felárak gyakorisága és összege | F3 |
| STA-10 | Lemondások típus szerint és no-show arány | F3 |
| STA-11 | Visszatérő és új ügyfelek | F3 |

## M. GDPR — GDP

| ID | Funkció | Fázis |
|---|---|---|
| GDP-01 | Adatkezelési tájékoztató | F2 |
| GDP-02 | Elfogadó jelölőnégyzet a foglalásnál | F2 |
| GDP-03 | Marketing hozzájárulás külön a foglalástól | F2 |
| GDP-04 | Törlési igény: anonimizálás, nem fizikai törlés | F2 |
| GDP-05 | Megőrzési idő az ügyféladatokra | F2 |
| GDP-06 | Adatfeldolgozók felsorolása | F2 |
| GDP-07 | Kamerarendszer tájékoztatója — a rendszeren kívül, de idetartozik | F2 |

## N. Integrációk — INT

| ID | Funkció | Fázis |
|---|---|---|
| INT-01 | Egyirányú naptár push (Supabase → Google Calendar) | F2 |
| INT-02 | SMS szolgáltató | F2 |
| INT-03 | Számlázó integráció | F4 |
| INT-04 | Automatikus napi/heti riport | F4 |

## O. HozomViszem és céges ügyfelek — HOZ

| ID | Funkció | Fázis |
|---|---|---|
| HOZ-01 | HozomViszem foglalástípus | F3 |
| HOZ-02 | Cégenkénti fordulóidő, foglalásonként felülírható (alapból 20 perc) | F3 |
| HOZ-03 | Felvételi cím, idősávok, kihez van rendelve | F3 |
| HOZ-04 | Céges szerződések nyilvántartása | F3 |

## P. Anyag és készlet — ANY

| ID | Funkció | Fázis |
|---|---|---|
| ANY-01 | Termékek nyilvántartása | F4 |
| ANY-02 | Beszerzések rögzítése számla alapján | F4 |
| ANY-03 | Időszakos leltár | F4 |
| ANY-04 | Tényleges fogyás visszaszámolása a leltárak és a beszerzések különbségéből | F4 |
| ANY-05 | Anyagköltség autónként, valós adatból | F4 |

---

## Ami tudatosan kimarad

Ezek nem elfelejtett funkciók, hanem megvizsgált és elvetett ötletek. Azért vannak
leírva, hogy fél év múlva ne kelljen újra végigvitatni őket.

| Mi | Miért maradt ki |
|---|---|
| Erőforrás-allokáció (mosóállás, dolgozó hozzárendelés) | 2-3 párhuzamos autónál túltervezés |
| Recept alapú anyagfelhasználás (150 ml APC autónként) | Senki nem mér ki ennyit; a vegyszer autónként fillér. Helyette leltár. |
| Állapotfotók érkezéskor | A hely kamerázva van, évi egy panasz |
| Előleg és online fizetés | Nem lesz |
| Messenger kimenő automatizálás | A Meta szabálya nem engedi |
| Kétirányú naptár szinkron | Időzsák, az egyirányú lefedi az igényt |
| Cloudinary | Kevés kép, a Supabase Storage elég |
| Több telephely | Egy telephely van; a sablonosításnál kerül elő újra |

---

## Ami még hiányzik a bevitelhez

Nem funkció, hanem adat — de enélkül több funkció nem tud élesedni.

1. **A csak kívül és csak belül időtartamai** — 18 cella. Az árak megvannak, az idők nem.
2. **Hét extra ára:** felni és gumi mélytisztítás, karc eltávolítás, bőrtisztítás,
   tetőkárpit, ajtókárpit, ózongenerátor, motortér kozmetika.
3. **A gumiápolás külön ára** — csomagban benne van, de külön is kérhető.
4. **Van-e több „szintes" sor a falcon és a viaszon kívül**, ahol a drágább csomag
   ugyanazt alaposabban vagy jobb anyaggal csinálja.
5. **Az arculati irány kiválasztása** a nyolc koncepció közül.