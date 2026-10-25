import {
  useCallback, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import { useApp } from '../../state/AppContext'
import { useMentes } from '../../state/useMentes'
import { useMentetlen } from '../../state/useMentetlen'
import {
  FORDITHATO_ADATOK, foSzakaszNapok, KOZOS_VALTOZOK, SZOVEGEK, uzletbol, uzletValtozok,
  type NyitvaNap, type SzovegDef, type SzovegKulcs, type Valtozok,
} from '../../lib/publikusTartalom'
import { csomagbanBenne } from '../../lib/csomag'
import { maStr, napPlusz, percIdo } from '../../lib/format'
import { formatum, NYELVEK, type Nyelv } from '../../lib/nyelv'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import type { Catalog, PublikusAdat } from '../../data/source'
import type { DayLane, Quote } from '../../lib/types'
import type { Mod } from '../../lib/arculat'
import { KoncepcioLap, KoncepcioResz, type KoncepcioReszNev } from '../arculat/Koncepcio'
import { FoglalasomTartalom } from '../publikus/FoglalasomOldal'
import type { FoglalasomAdat, OldalAllapot } from '../../../../supabase/functions/_shared/tipusok.ts'
import { FoglalasUrlap, type Bemutato, type FoglalasForras } from '../publikus/FoglalasModul'
import { TartalomProvider, useSz, type Jelolo } from '../publikus/tartalom'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import { Elonezet, PubFej } from './kozos'
import { elofordulasok, jelol, lathato, talalat, type Elofordulas } from './szovegJelolo'
import type { Billentyu, Honnan, Ugras } from '../shell/ugras'

type Szovegek = Record<SzovegKulcs, string>
export type TartalomLap = 'fooldal' | 'foglalas' | 'gyik'

export const TARTALOM_LAPOK: { id: TartalomLap; cim: string; leiras: string }[] = [
  { id: 'fooldal', cim: 'Főoldal', leiras: 'A publikus főoldal a menütől a láblécig, benne a foglalás minden lépésével.' },
  { id: 'foglalas', cim: 'Foglalás oldal', leiras: 'Az ügyfél saját foglalás oldala, amit a visszaigazoló e-mail linkjén lát, minden állapotában.' },
  { id: 'gyik', cim: 'GYIK oldal', leiras: 'A Gyakran ismételt kérdések aloldal.' },
]

const LAP_SAVOK: Record<TartalomLap, string[]> = {
  fooldal: ['menu', 'hero', 'rolunk', 'galeria', 'csomagok', 'fogl-fej', 'fogl-1', 'fogl-2', 'fogl-3', 'fogl-4', 'fogl-5', 'fogl-5fs',
    'fogl-6', 'fogl-8', 'fogl-osszeg', 'fogl-siker', 'velemenyek', 'hely', 'gyik', 'lab'],
  foglalas: ['ugyfel-alap', 'ugyfel-kesz', 'ugyfel-atveve', 'ugyfel-egyeb'],
  gyik: ['menu', 'gyik-oldal', 'lab'],
}

const SAJAT_SAVOK: Record<TartalomLap, string[]> = {
  fooldal: LAP_SAVOK.fooldal,
  foglalas: LAP_SAVOK.foglalas,
  gyik: ['gyik-oldal'],
}
type Lepes = 'auto' | 'csomag' | 'mit' | 'extrak' | 'tipus' | 'elvitel' | 'nap' | 'adatok' | 'osszeg' | 'siker'

interface Sav {
  id: string
  cim: string
  leiras: string
  kulcsok: SzovegKulcs[]
  oldalResz?: KoncepcioReszNev
  lepes?: Lepes
  bemutato?: (b: BemutatoAlap) => Bemutato
  fej?: boolean
  ful?: boolean
  ugyfel?: OldalAllapot
}

interface BemutatoAlap {
  csomagId: string | null
  extrak: Record<string, number>
}

const KISZAMOLT: BemutatoAlap = { csomagId: null, extrak: {} }

const SAVOK: Sav[] = [
  { id: 'menu', cim: 'Menüsor és böngészőfül', leiras: 'Az oldal teteje és a böngésző fülén megjelenő cím.', oldalResz: 'nav', ful: true,
    kulcsok: ['oldal.cim', 'menu.rolunk', 'menu.galeria', 'menu.csomagok', 'menu.foglalas', 'menu.kapcsolat'] },
  { id: 'hero', cim: 'Nyitó rész', leiras: 'Az első, amit a látogató lát: felcím, nagy cím, két hasáb és a borítókép.', oldalResz: 'hero',
    kulcsok: ['hero.felcim', 'hero.cim', 'hero.bevezeto', 'hero.mellek', 'hero.borito_helye', 'hero.borito_alt'] },
  { id: 'rolunk', cim: 'Rólunk', leiras: 'A borítókép alatti sötétzöld sáv: cím és két bekezdés. Az első bekezdés nagyobb betűvel jelenik meg.', oldalResz: 'rolunk',
    kulcsok: ['rolunk.cim', 'rolunk.bekezdes1', 'rolunk.bekezdes2'] },
  { id: 'galeria', cim: 'Galéria', leiras: 'Az előtte–utána képek a Rólunk alatt. Egérrel végighúzva lemosható a kosz, érintőképernyőn a szivacs gomb bekapcsolása után. A Reset gombbal újra koszos lesz. Az előnézetben is kipróbálhatod.', oldalResz: 'galeria',
    kulcsok: ['galeria.cim', 'galeria.bevezeto', 'galeria.foglalas', 'galeria.meret', 'galeria.reset', 'galeria.szivacs', 'galeria.vege', 'galeria.kep_alt'] },
  { id: 'csomagok', cim: 'Csomagok táblázat', leiras: 'A táblázat sorai és cellái a Csomagok menüben szerkeszthetők, itt a feliratai.', oldalResz: 'csomagok',
    kulcsok: ['csomagok.cim', 'csomagok.ervenyes', 'csomagok.alcim.szemelyauto', 'csomagok.alcim.suv', 'csomagok.alcim.kisbusz', 'csomagok.kategoria',
      'csomagok.kat.szemelyauto', 'csomagok.kat.suv', 'csomagok.kat.kisbusz', 'csomagok.csoport.kulso', 'csomagok.csoport.belso',
      'csomagok.csak.kulso', 'csomagok.csak.belso', 'csomagok.egyeb.cim', 'csomagok.egyeb.kulso', 'csomagok.egyeb.belso', 'csomagok.egyeb.benne'] },
  { id: 'fogl-fej', cim: 'Időpontfoglalás: cím és bevezető', leiras: 'A foglalás szakasz feje, a csomagtáblázat mellett.', fej: true,
    kulcsok: ['foglalas.cim', 'foglalas.bevezeto'] },
  { id: 'fogl-1', cim: '1. lépés: az autó', leiras: 'Az első kérdés és a három járműkategória.', lepes: 'auto', bemutato: () => ({}),
    kulcsok: ['foglalas.auto', 'foglalas.kat.szemelyauto', 'foglalas.kat.suv', 'foglalas.kat.kisbusz'] },
  { id: 'fogl-2', cim: '2. lépés: csomag és Full Service', leiras: 'Az előnézetben egy csomag és a Full Service ki van választva, hogy minden felirat látsszon.', lepes: 'csomag',
    bemutato: (b) => ({ csomagId: b.csomagId, fs: true, ules: 'KARPIT' }),
    kulcsok: ['foglalas.csomag', 'foglalas.arajanlat', 'foglalas.fs', 'foglalas.fs_leiras', 'foglalas.fs_csomaggal',
      'foglalas.ules', 'foglalas.ules.karpit', 'foglalas.ules.bor', 'foglalas.ules.karpit_bor'] },
  { id: 'fogl-3', cim: '3. lépés: mit csináljunk', leiras: 'Full Service-nél csak a teljes csomag választható, ezért a másik kettő halvány.', lepes: 'mit',
    bemutato: (b) => ({ csomagId: b.csomagId, fs: true, ules: 'KARPIT' }),
    kulcsok: ['foglalas.mit', 'foglalas.terjedelem.teljes', 'foglalas.terjedelem.kulso', 'foglalas.terjedelem.belso',
      'foglalas.telefonon', 'foglalas.fs_teljes'] },
  { id: 'fogl-4', cim: '4. lépés: extrák', leiras: 'Az előnézetben egy extra ki van pipálva.', lepes: 'extrak',
    bemutato: (b) => ({ csomagId: b.csomagId, extrak: b.extrak }),
    kulcsok: ['foglalas.extrak', 'foglalas.nem_kotelezo', 'foglalas.extrak_benne', 'foglalas.ar_egyeztetes'] },
  { id: 'fogl-5', cim: '5. lépés: megvárod vagy itt hagyod', leiras: 'Full Service nélkül ez az ötödik lépés.', lepes: 'tipus',
    bemutato: (b) => ({ csomagId: b.csomagId, tipus: 'LEADOS' }),
    kulcsok: ['foglalas.var_vagy_hagy', 'foglalas.varom', 'foglalas.varom_leiras', 'foglalas.hagyom', 'foglalas.hagyom_leiras'] },
  { id: 'fogl-5fs', cim: '5. lépés Full Service-nél: elvitel', leiras: 'Full Service-nél ez jelenik meg a „Megvárod vagy itt hagyod” helyett.', lepes: 'elvitel',
    bemutato: (b) => ({ csomagId: b.csomagId, fs: true, ules: 'KARPIT', elvitel: 'MASNAP' }),
    kulcsok: ['foglalas.elvitel', 'foglalas.elvitel_fs', 'foglalas.aznap', 'foglalas.aznap_vizes', 'foglalas.aznap_bor',
      'foglalas.masnap', 'foglalas.masnap_szarad', 'foglalas.masnap_leiras'] },
  { id: 'fogl-6', cim: '6–7. lépés: nap és időpont', leiras: 'A naptár, a napok állapota, az időpontok és a határidő. Az előnézet az „Itt hagyom” változat.', lepes: 'nap',
    bemutato: (b) => ({ csomagId: b.csomagId, tipus: 'LEADOS', napot: true, idot: true }),
    kulcsok: ['foglalas.nap', 'foglalas.allapot.szabad', 'foglalas.allapot.keves', 'foglalas.allapot.tele', 'foglalas.allapot.zarva',
      'foglalas.nincs_munkaido', 'foglalas.hozas', 'foglalas.kezdes', 'foglalas.kesz_kb', 'foglalas.nincs_ido', 'foglalas.hatarido',
      'foglalas.hatarido_savos', 'foglalas.hatarido_nincs', 'foglalas.elvitel_mikor', 'foglalas.elvitel_szamol', 'foglalas.erkezes'] },
  { id: 'fogl-8', cim: '8. lépés: adatok', leiras: 'Az űrlap, a feltétel és az adatvédelmi mondat.', lepes: 'adatok',
    bemutato: (b) => ({ csomagId: b.csomagId, tipus: 'LEADOS', napot: true, idot: true }),
    kulcsok: ['foglalas.adatok', 'foglalas.mezo.nev', 'foglalas.mezo.telefon', 'foglalas.mezo.email', 'foglalas.minta.email',
      'foglalas.mezo.rendszam', 'foglalas.mezo.marka', 'foglalas.mezo.modell', 'foglalas.mezo.megjegyzes', 'foglalas.minta.megjegyzes',
      'foglalas.feltetel', 'foglalas.adatvedelem'] },
  { id: 'fogl-osszeg', cim: 'Összegzés és küldés', leiras: 'A foglalás alján végig látszó sáv az árral és a küldés gombbal.', lepes: 'osszeg',
    bemutato: (b) => ({ csomagId: b.csomagId, tipus: 'LEADOS', napot: true, idot: true, extrak: b.extrak }),
    kulcsok: ['foglalas.hozas_cimke', 'foglalas.hatarido_cimke', 'foglalas.kezdes_cimke', 'foglalas.elvitel_cimke',
      'foglalas.egyeztetendo', 'foglalas.egyeztetendo_tetel', 'foglalas.kuldes', 'foglalas.kuldes_folyamatban'] },
  { id: 'fogl-siker', cim: 'Köszönő üzenet', leiras: 'Ez jelenik meg a foglalási kérés elküldése után.', lepes: 'siker',
    bemutato: () => ({ kesz: true }),
    kulcsok: ['foglalas.siker', 'foglalas.siker_elvitel', 'foglalas.siker_email', 'foglalas.siker_telefon', 'foglalas.uj'] },
  { id: 'velemenyek', cim: 'Rólunk mondták', oldalResz: 'velemenyek',
    leiras: 'A Hol vagyunk fölötti sötétzöld sáv a Google-értékelésekkel. A véleményeket a Vélemények menüben veheted fel. Amíg nincs egy sem, a publikus oldalon a sáv nem jelenik meg, itt az előnézetben minta kártyák látszanak.',
    kulcsok: ['velemeny.felcim', 'velemeny.cim', 'velemeny.osszes', 'velemeny.elozo', 'velemeny.kovetkezo', 'velemeny.csillag'] },
  { id: 'hely', cim: 'Hol vagyunk', leiras: 'A címek és az adatok az Elérhetőség menüből jönnek, itt a feliratok.', oldalResz: 'hely',
    kulcsok: ['hely.cim', 'hely.bevezeto', 'cimke.cim', 'cimke.nyitvatartas', 'cimke.leadas', 'cimke.telefon',
      'hely.utvonal', 'hely.terkep_szoveg', 'hely.terkep_gomb'] },
  { id: 'gyik', cim: 'Gyakran ismételt kérdések: főoldal', oldalResz: 'gyik',
    leiras: 'A Hol vagyunk alatti, lábléc fölötti sáv. A kérdéseket és a válaszokat a GYIK menüben írhatod meg. Amíg nincs publikált kérdés, a publikus oldalon a sáv nem jelenik meg, itt minta kérdések látszanak.',
    kulcsok: ['gyik.cim', 'gyik.bevezeto', 'gyik.tovabb'] },
  { id: 'gyik-oldal', cim: 'Gyakran ismételt kérdések: aloldal', oldalResz: 'gyikoldal',
    leiras: 'A További kérdések gomb mögötti oldal, az összes publikált kérdéssel, kategóriák szerint. A kategóriaszűrő csak akkor látszik, ha legalább két kategóriában van kérdés.',
    kulcsok: ['gyik.oldal_bevezeto', 'gyik.osszes', 'gyik.kat.kulso', 'gyik.kat.belso', 'gyik.kat.egyeb', 'gyik.nem_talalod', 'gyik.nem_talalod_szoveg', 'gyik.leiras'] },
  { id: 'ugyfel-alap', cim: 'Foglalás oldala: visszaigazolt foglalás', ugyfel: 'VISSZAIGAZOLVA',
    leiras: 'Ezt látja az ügyfél a visszaigazoló e-mail linkjén. Az előnézetben a hozás ideje és a csomag módosult, és van egy elintézett módosítási kérés.',
    kulcsok: ['ugyfel.cim', 'ugyfel.visszaigazolva.cim', 'ugyfel.visszaigazolva.szoveg', 'ugyfel.keres.cim', 'ugyfel.keres.szoveg',
      'ugyfel.lepes.keres', 'ugyfel.lepes.visszaigazolva', 'ugyfel.lepes.kesz', 'ugyfel.lepes.atveve',
      'ugyfel.adatok', 'ugyfel.modositva', 'ugyfel.modositva_magyarazat', 'ugyfel.sor.nap', 'ugyfel.sor.kezdes', 'ugyfel.sor.hozas',
      'ugyfel.sor.erte', 'ugyfel.sor.kesz', 'ugyfel.sor.elvitel', 'ugyfel.sor.vissza', 'ugyfel.sor.zarasig', 'ugyfel.sor.auto',
      'ugyfel.sor.szolgaltatas', 'ugyfel.sor.extrak', 'ugyfel.sor.ar', 'ugyfel.berletbol',
      'ugyfel.modositas.cim', 'ugyfel.modositas.szoveg', 'ugyfel.modositas.minta', 'ugyfel.modositas.gomb', 'ugyfel.modositas.kuldes',
      'ugyfel.modositas.uzenetek', 'ugyfel.modositas.elkuldve', 'ugyfel.modositas.elintezve',
      'ugyfel.lemondas.cim', 'ugyfel.lemondas.szoveg', 'ugyfel.lemondas.gomb', 'ugyfel.lemondas.kerdes', 'ugyfel.lemondas.igen',
      'ugyfel.lemondas.nem', 'ugyfel.kapcsolat'] },
  { id: 'ugyfel-kesz', cim: 'Foglalás oldala: elkészült az autó', ugyfel: 'KESZ',
    leiras: 'A Kész van gomb után. A felár oka csak akkor látszik, ha a végösszeg magasabb lett a becsültnél.',
    kulcsok: ['ugyfel.kesz.cim', 'ugyfel.kesz.szoveg', 'ugyfel.kesz.doboz', 'ugyfel.kesz.legkesobb', 'ugyfel.sor.vegosszeg',
      'ugyfel.felar', 'ugyfel.kimaradt'] },
  { id: 'ugyfel-atveve', cim: 'Foglalás oldala: átvéve', ugyfel: 'ATVEVE',
    leiras: 'Az Átvette gomb után 10 napig ez látszik. A Google-értékelés linkje az Elérhetőség menüben állítható.',
    kulcsok: ['ugyfel.atveve.cim', 'ugyfel.atveve.szoveg', 'ugyfel.ertekeles.cim', 'ugyfel.ertekeles.szoveg', 'ugyfel.ertekeles.gomb',
      'ugyfel.fooldal', 'ugyfel.uj'] },
  { id: 'ugyfel-egyeb', cim: 'Foglalás oldala: lemondva, lejárt és a többi', ugyfel: 'LEMONDVA',
    leiras: 'Az előnézet a lemondott foglalás. Ugyanígy néz ki az elutasított, az elmaradt, a be nem fért és a lejárt link is, csak a cím és a szöveg más.',
    kulcsok: ['ugyfel.lemondva.cim', 'ugyfel.lemondva.szoveg', 'ugyfel.elutasitva.cim', 'ugyfel.elutasitva.szoveg',
      'ugyfel.nem_jott.cim', 'ugyfel.nem_jott.szoveg', 'ugyfel.nem_fert.cim', 'ugyfel.nem_fert.szoveg',
      'ugyfel.lejart.cim', 'ugyfel.lejart.szoveg', 'ugyfel.ismeretlen.cim', 'ugyfel.ismeretlen.szoveg'] },
  { id: 'lab', cim: 'Lábléc', leiras: 'Az oldal alja. A Cím és a Nyitvatartás felirat a Hol vagyunk sávban módosítható, az Impresszum és az Adatvédelmi tájékoztató linkje nem módosítható.', oldalResz: 'lab',
    kulcsok: ['lab.leiras', 'lab.leadas', 'cimke.kapcsolat', 'gomb.idopont'] },
]

const MIKOR: Partial<Record<SzovegKulcs, string>> = {
  'hero.borito_alt': 'Nem látszik: a képernyőolvasó olvassa fel a borítókép helyett.',
  'hero.borito_helye': 'Csak addig látszik, amíg nincs feltöltve borítókép.',
  'galeria.meret': 'Nem látszik: a képernyőolvasó olvassa fel a csúszka neveként.',
  'galeria.reset': 'Felirat nélküli gomb: a képernyőolvasó olvassa fel, és egérrel fölé állva jelenik meg.',
  'galeria.kep_alt': 'Nem látszik: a képernyőolvasó olvassa fel a képek helyett.',
  'velemeny.osszes': 'Az Elérhetőség menüben megadott Google-értékelés linkre visz, ha nincs megadva, a Google-keresés találatára.',
  'velemeny.elozo': 'Nyíl gomb, csak akkor látszik, ha több vélemény van, mint amennyi egyszerre elfér. A képernyőolvasó olvassa fel.',
  'velemeny.kovetkezo': 'Nyíl gomb, csak akkor látszik, ha több vélemény van, mint amennyi egyszerre elfér. A képernyőolvasó olvassa fel.',
  'gyik.leiras': 'Nem látszik az oldalon: ezt mutatja a Google a találat alatt, és ezt látják a megosztott linkek is.',
  'velemeny.csillag': 'Nem látszik: a képernyőolvasó olvassa fel a csillagok helyett.',
  'galeria.foglalas': 'A Foglalás részhez görget, mint a menü Foglalás pontja. Telefonon ugyanez a gomb a nyitó részben is megjelenik.',
  'galeria.szivacs': 'Csak érintőképernyőn gomb: bekapcsolva ujjal lehet mosni, a görgetés szünetel.',
  'galeria.vege': 'Csak érintőképernyőn látszik: kikapcsolja a mosást, újra lehet görgetni.',
  'foglalas.arajanlat': 'Csak akkor látszik, ha egy csomagnak nincs fix ára.',
  'foglalas.telefonon': 'Csak akkor látszik, ha egy terjedelem nem foglalható online.',
  'foglalas.ar_egyeztetes': 'Csak az egyeztetendő árú extráknál látszik.',
  'foglalas.allapot.zarva': 'A zárva tartó napokon látszik a naptárban (az előnézetben szombaton).',
  'foglalas.nincs_munkaido': 'Csak akkor látszik, ha egy választáshoz nincs megadva munkaidő.',
  'foglalas.kezdes': 'A „Megvárom” választásnál látszik, az előnézet az „Itt hagyom” változat.',
  'foglalas.nincs_ido': 'Csak akkor látszik, ha a kiválasztott napon már nincs szabad időpont.',
  'foglalas.hatarido_nincs': 'Csak akkor látszik, ha a választott hozási időre nem vállalható határidő.',
  'foglalas.elvitel_mikor': 'Full Service-nél, másnapi elvitelnél látszik az időpontok alatt.',
  'foglalas.elvitel_szamol': 'Egy pillanatig látszik, amíg az elvitel napja számolódik.',
  'foglalas.kezdes_cimke': 'A „Megvárom” választásnál látszik.',
  'foglalas.elvitel_cimke': 'Full Service-nél, másnapi elvitelnél látszik.',
  'foglalas.egyeztetendo': 'Csak egyeztetendő árú extra választásakor látszik.',
  'foglalas.egyeztetendo_tetel': 'Csak egyeztetendő árú extra választásakor látszik.',
  'foglalas.kuldes_folyamatban': 'A küldés gombon látszik, amíg a kérés elmegy.',
  'foglalas.siker_telefon': 'Akkor látszik az e-mailes mondat helyett, ha a foglaló nem adott meg e-mail címet.',
}

const ELERHETOSEG_VALTOZOK = ['nev', 'telefon', 'email', 'irsz', 'cim', 'haz', 'szint', 'bejarat', 'kerulet']
const BEALLITAS_VALTOZOK = ['nyitvatartas', 'nyitas', 'zaras', 'leadas', 'lemondas_ora']

const VALTOZO_HELY: Record<string, string> = {
  nev: 'Elérhetőség, Megjelenő név', telefon: 'Elérhetőség, Telefonszám', email: 'Elérhetőség, E-mail cím',
  irsz: 'Elérhetőség, Irányítószám és város', cim: 'Elérhetőség, Utca, házszám', haz: 'Elérhetőség, Épület',
  szint: 'Elérhetőség, Szint', bejarat: 'Elérhetőség, Bejárat', kerulet: 'Elérhetőség, Kerület',
  nyitvatartas: 'Beállítások, Nyitvatartás fül', nyitas: 'Beállítások, Nyitvatartás fül, nyitás oszlop',
  zaras: 'Beállítások, Nyitvatartás fül, zárás oszlop', leadas: 'Beállítások, Általános fül, Leadás legkorábban',
  lemondas_ora: 'Beállítások, Általános fül, Online lemondás határideje',
}

const BILLENTYU: Record<string, Billentyu> = { telefon: 'tel', email: 'email' }

const KOZOS_LEIRAS: Record<string, string> = Object.fromEntries(KOZOS_VALTOZOK.map((x) => [x.nev, x.leiras]))

function kovetkezoHetkoznap(): string {
  let d = napPlusz(maStr(), 1)
  while ([0, 6].includes(new Date(`${d}T12:00:00`).getDay())) d = napPlusz(d, 1)
  return d
}

function sajatLeiras(nyelv: Nyelv): Record<string, string> {
  const f = formatum(nyelv)
  return {
    csomag: 'a kiválasztott csomag neve, például: Premium',
    tol: 'a legkorábbi vállalható határidő, például: 15:30',
    ig: 'a legkésőbbi vállalható határidő, például: 17:00',
    mikor: `az elvitel napja és időablaka, például: ${f.napCim(kovetkezoHetkoznap())}, ${f.kozott('8:00', '17:00')}`,
    n: 'a vélemény csillagainak száma, például: 5',
    csomagok: 'a csomagok neve, amelyekben a szolgáltatás benne van, például: Elit',
  }
}

const SAJAT_LEIRAS: Record<Nyelv, Record<string, string>> = { hu: sajatLeiras('hu'), en: sajatLeiras('en') }

function ValtozoMagyarazat({ ertek, sajat, valtozok, nyelv, onValtozo }: {
  ertek: string
  sajat: readonly string[]
  valtozok: Valtozok
  nyelv: Nyelv
  onValtozo: (nev: string) => void
}) {
  const hasznalt = [...new Set([...ertek.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))]
  const nevek = [...hasznalt, ...sajat.filter((n) => !hasznalt.includes(n))]
  if (nevek.length === 0) return null
  return (
    <ul className="pub-valtozo-magyarazat">
      {nevek.map((nev) => {
        if (sajat.includes(nev)) {
          return (
            <li key={nev}>
              {!hasznalt.includes(nev) && 'Használható: '}<code>{`{${nev}}`}</code> = {SAJAT_LEIRAS[nyelv][nev] ?? 'a foglalás közben kitöltött adat'}
            </li>
          )
        }
        if (KOZOS_LEIRAS[nev]) {
          return (
            <li key={nev}>
              <button type="button" className="pub-valtozo-link" data-valtozo-link={nev}
                      title={`Módosítás helye: ${VALTOZO_HELY[nev]}.`} onClick={() => onValtozo(nev)}>
                {`{${nev}}`}
              </button>
              {' '}= {KOZOS_LEIRAS[nev]}, most: {String(valtozok[nev] ?? '')}
            </li>
          )
        }
        return (
          <li key={nev} data-ismeretlen>
            <code>{`{${nev}}`}</code> = nincs ilyen adat, a publikus oldalon kapcsos zárójellel együtt, változatlanul jelenne meg.
          </li>
        )
      })}
    </ul>
  )
}

function valtozoCel(nev: string, napok: NyitvaNap[], nyelv: Nyelv = 'hu'): Ugras {
  if (nyelv === 'en' && (FORDITHATO_ADATOK as readonly string[]).includes(nev)) {
    return { oldal: 'pub-elerhetoseg', fokusz: `[data-mezo="${nev}_en"]`, billentyu: 'text', nyelv: 'en' }
  }
  if (ELERHETOSEG_VALTOZOK.includes(nev)) {
    return { oldal: 'pub-elerhetoseg', fokusz: `[data-mezo="${nev}"]`, billentyu: BILLENTYU[nev] ?? 'text' }
  }
  if (nev === 'leadas') return { oldal: 'beallitasok', ful: 'altalanos', fokusz: '[data-mezo="leadas"]', valaszto: true }
  if (nev === 'lemondas_ora') return { oldal: 'beallitasok', ful: 'altalanos', fokusz: '[data-mezo="lemondas_ora"]', billentyu: 'numeric' }
  const fo = foSzakaszNapok(napok)
  if (nev === 'nyitas' || nev === 'zaras') {
    return {
      oldal: 'beallitasok', ful: 'ido', valaszto: true,
      fokusz: `[data-mezo="${nev}"]${fo.length ? `[data-nap="${fo[0]}"]` : ''}`,
      kiemel: fo.length ? fo.map((n) => `[data-mezo="${nev}"][data-nap="${n}"]`).join(', ') : undefined,
    }
  }
  const elso = [...napok].sort((a, b) => a.weekday - b.weekday).find((d) => !d.closed && d.opens && d.closes)
  return {
    oldal: 'beallitasok', ful: 'ido', kiemel: '[data-mezo="nyitvatartas"]',
    fokusz: elso ? `[data-mezo="nyitas"][data-nap="${elso.weekday}"]` : '[data-mezo="nyitvatartas"]',
  }
}

const LISTA: readonly SzovegDef[] = SZOVEGEK
const DEF = Object.fromEntries(LISTA.map((s) => [s.kulcs, s])) as Record<SzovegKulcs, SzovegDef>

type Ket = Record<Nyelv, Szovegek>

const piszkozat: Record<Nyelv, Partial<Szovegek>> = { hu: {}, en: {} }

const alapSzoveg = (s: SzovegDef, nyelv: Nyelv) => (nyelv === 'en' ? s.en : s.alap)

function kezdo(sajat: Record<string, string> | undefined, nyelv: Nyelv): Szovegek {
  return Object.fromEntries(LISTA.map((s) => [s.kulcs, sajat?.[s.kulcs]?.trim() ? sajat[s.kulcs] : alapSzoveg(s, nyelv)])) as Szovegek
}

function kezdoKet(pub: PublikusAdat | null): Ket {
  return { hu: kezdo(pub?.tartalom.szovegek, 'hu'), en: kezdo(pub?.tartalom.szovegek_en, 'en') }
}

function piszkozattal(pub: PublikusAdat | null): Ket {
  const k = kezdoKet(pub)
  return { hu: { ...k.hu, ...piszkozat.hu }, en: { ...k.en, ...piszkozat.en } }
}

function SugoTorzs({ id, valtozok, onValtozo }: { id: string; valtozok: Valtozok; onValtozo: (nev: string, sugo: string) => void }) {
  const leiras = Object.fromEntries(KOZOS_VALTOZOK.map((x) => [x.nev, x.leiras]))
  const csoport = (cim: string, nevek: string[]) => (
    <div className="pub-valtozo-csoport">
      <span className="pub-valtozo-cim">{cim}</span>
      <div className="pub-valtozok">
        {nevek.map((nev) => (
          <button key={nev} type="button" className="pub-valtozo" data-valtozo={nev}
                  title={`${leiras[nev] ?? nev}. Módosítás helye: ${VALTOZO_HELY[nev]}.`}
                  onClick={() => onValtozo(nev, id)}>
            <code>{`{${nev}}`}</code>
            <span>{String(valtozok[nev] ?? '')}</span>
          </button>
        ))}
      </div>
    </div>
  )
  return (
      <div className="panel-torzs">
        <ul>
          <li>
            <strong>Kapcsos zárójelben</strong> az adatok automatikusan beíródnak, például a
            {' '}<code>{'{telefon}'}</code> helyére a telefonszám. Így ha egy adat változik, a szövegekben nem kell átírni.
          </li>
          <li>
            <strong>Kattints egy adatra</strong>, és odaviszünk, ahol módosíthatod. A még nem mentett szövegeid
            megmaradnak, a fejlécben lévő Vissza a Tartalomhoz gombbal ide térsz vissza.
          </li>
          <li>Az előnézetben a <strong>sárgás háttér</strong> a még nem mentett módosítást jelzi.</li>
          <li><strong>Csillagok között</strong> a szöveg kiemelt lesz, például <code>*Évekig*</code>.</li>
          <li>A több soros mezőkben az Enter új sort kezd. Ha egy mezőt üresen hagysz, az eredeti szöveg áll vissza.</li>
        </ul>
        {csoport('Az Elérhetőség menüben módosítható', ELERHETOSEG_VALTOZOK)}
        {csoport('A Beállítások menüben módosítható', BEALLITAS_VALTOZOK)}
      </div>
  )
}

function negyedek(tol: number, ig: number, lanes: number): DayLane[] {
  const ki: DayLane[] = []
  for (let t = tol; t < ig; t += 15) ki.push({ starts: percIdo(t), ends: percIdo(t + 15), lanes })
  return ki
}

function bemutatoForras(k: Catalog): FoglalasForras {
  const savok = (d: string): DayLane[] => {
    const hetnap = new Date(`${d}T12:00:00`).getDay()
    if (hetnap === 0 || hetnap === 6) return []
    if (hetnap === 3) return negyedek(8 * 60, 11 * 60, 1)
    if (hetnap === 4) return negyedek(8 * 60, 9 * 60 + 30, 1)
    return negyedek(8 * 60, 17 * 60, 2)
  }
  return {
    getDay: async () => [],
    getDayLanes: async (d) => savok(d),
    onlineBooking: async () => 'bemutato',
    quoteBooking: async (i) => {
      const pp = k.packagePricing.find((x) => x.package_id === i.package_id && x.category === i.category && x.scope === (i.scope ?? 'TELJES'))
      const fs = i.full_service ? k.fullServicePricing.find((x) => x.package_id === i.package_id && x.category === i.category) : null
      const extrak = (i.extras ?? []).reduce((o, e) => o + (k.extras.find((x) => x.id === e.extra_id)?.price_huf ?? 0) * e.quantity, 0)
      const q: Quote = {
        price_huf: (fs?.price_huf ?? pp?.price_huf ?? 0) + extrak,
        work_minutes: pp?.duration_minutes ?? 90, rest_minutes: 0, requires_quote: false, duration_known: true,
        lines: [], company_id: null, contract_id: null, contract_kind: null, contract_price: false, contract_prices: {},
        berlet: null, berlet_csomagok: [],
      }
      return q
    },
  }
}

function bemutatoAlap(k: Catalog): BemutatoAlap {
  const csomagok = k.packages.filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order)
  const vanFs = (id: string) => k.fullServicePricing.some((f) => f.package_id === id && f.category === 'SZEMELYAUTO' && f.price_huf != null && !f.requires_quote)
  const csomag = (csomagok[1] && vanFs(csomagok[1].id) ? csomagok[1] : csomagok.find((p) => vanFs(p.id))) ?? csomagok[1] ?? csomagok[0] ?? null
  const extra = k.extras
    .filter((e) => e.active && !csomagbanBenne(e, csomag?.id ?? null, 'TELJES', false))
    .sort((a, b) => a.sort_order - b.sort_order)[0]
  return { csomagId: csomag?.id ?? null, extrak: extra ? { [extra.id]: 1 } : {} }
}

function BongeszoFul() {
  const sz = useSz()
  return (
    <div className="pub-bongeszo" aria-hidden="true">
      <span className="pub-bongeszo-pottyok"><i /><i /><i /></span>
      <span className="pub-bongeszo-ful">{sz('oldal.cim')}</span>
    </div>
  )
}

function FoglalasFej({ mod }: { mod: Mod }) {
  const sz = useSz()
  return (
    <div className="kv" data-k="03" data-mod={mod === 'SOTET' ? 'sotet' : 'vilagos'}>
      <section className="kv-foglalas kv-foglalas-elo pub-fogl-elonezet">
        <h2>{sz('foglalas.cim')}</h2>
        <p className="kv-bevezeto">{sz('foglalas.bevezeto')}</p>
      </section>
    </div>
  )
}

function FoglalasLepes({ lepes, bemutato, mod, k, lemondasOra, forras }: {
  lepes: Lepes
  bemutato: Bemutato
  mod: Mod
  k: Catalog
  lemondasOra: number
  forras: FoglalasForras
}) {
  const id = useId()
  return (
    <div className="kv" data-k="03" data-mod={mod === 'SOTET' ? 'sotet' : 'vilagos'}>
      <section className="kv-foglalas kv-foglalas-elo pub-fogl-elonezet" data-elonezet={id}>
        <style>{`[data-elonezet="${id}"] .fogl > :not([data-lepes="${lepes}"]) { display: none !important; }`}</style>
        <FoglalasUrlap data={forras} katalogus={k} revision={0} refresh={() => {}}
                       lemondasOra={lemondasOra} bemutato={bemutato} />
      </section>
    </div>
  )
}

function mintaFoglalas(allapot: OldalAllapot): FoglalasomAdat {
  const nap = napPlusz(maStr(), 3)
  const most = {
    nap, tipus: 'LEADOS' as const, kezdes: null, hozas: '08:00', kesz: null, elvitel_nap: nap, elvitel: '16:30',
    csomag: 'Premium', csomag_en: 'Premium', full_service: false, terjedelem: 'TELJES' as const, kategoria: 'SZEMELYAUTO' as const,
    extrak: [], rendszam: 'ABC-123', marka: 'Skoda', modell: 'Octavia', ar: 15600,
  }
  const kesz = new Date()
  kesz.setHours(17, 0, 0, 0)
  return {
    allapot, nyelv: 'hu', nev: 'Kovács Péter', ceges: false,
    most, eredeti: { ...most, hozas: '09:00', csomag: 'Start', csomag_en: 'Start', ar: 12800 },
    ar: { becsult: 15600, vegleges: 18600, felar_indok: 'erősen kutyaszőrös belső', kimaradt: null, kimaradt_huf: null },
    kesz_ig: kesz.toISOString(), lemondhato: allapot === 'VISSZAIGAZOLVA', lemondas_hatarido: new Date(Date.now() + 2 * 86400000).toISOString(),
    modosithato: allapot === 'VISSZAIGAZOLVA' || allapot === 'KESZ',
    kerelmek: allapot === 'VISSZAIGAZOLVA'
      ? [{ uzenet: 'Egy órával korábban hoznám, 8:00 körül.', mikor: new Date(Date.now() - 3600000).toISOString(), elintezve: new Date().toISOString() }]
      : [],
  }
}

function SavElonezet({ sav, pub, forras, alap }: {
  sav: Sav
  pub: PublikusAdat
  forras: FoglalasForras
  alap: BemutatoAlap
}) {
  const mod: Mod = pub.arculat === '03' && pub.mod ? pub.mod : 'VILAGOS'
  if (sav.oldalResz) {
    return (
      <Elonezet szel={1280} keret mobilon>
        {sav.ful && <BongeszoFul />}
        <KoncepcioResz resz={sav.oldalResz} mod={mod} k={pub.katalogus} />
      </Elonezet>
    )
  }
  if (sav.fej) return <Elonezet szel={660} mobilon><FoglalasFej mod={mod} /></Elonezet>
  if (sav.ugyfel) {
    return (
      <Elonezet szel={900} keret mobilon>
        <div className="pub-ceg pub-ugyfel">
          <KoncepcioLap mod={mod} k={pub.katalogus}>
            <FoglalasomTartalom adat={mintaFoglalas(sav.ugyfel)} muvelet={null} google="#" />
          </KoncepcioLap>
        </div>
      </Elonezet>
    )
  }
  if (sav.lepes && sav.bemutato) {
    return (
      <Elonezet szel={660} mobilon>
        <FoglalasLepes lepes={sav.lepes} bemutato={sav.bemutato(alap)} mod={mod} k={pub.katalogus}
                       lemondasOra={pub.lemondasOra} forras={forras} />
      </Elonezet>
    )
  }
  return null
}


const SORSZAM = Object.fromEntries(LISTA.map((s, i) => [s.kulcs, i])) as Record<SzovegKulcs, number>
const SAV = Object.fromEntries(SAVOK.map((s) => [s.id, s])) as Record<string, Sav>
const KULCS_SAV: Partial<Record<SzovegKulcs, Sav>> = {}
for (const sav of SAVOK) for (const k of sav.kulcsok) KULCS_SAV[k] ??= sav

const lapKulcsai = (lap: TartalomLap): SzovegKulcs[] =>
  [...new Set(SAJAT_SAVOK[lap].flatMap((id) => SAV[id]?.kulcsok ?? []))]

export function kulcsLapja(kulcs: SzovegKulcs): TartalomLap {
  return TARTALOM_LAPOK.find((l) => lapKulcsai(l.id).includes(kulcs))?.id ?? 'fooldal'
}

interface Doboz { left: number; top: number; width: number; height: number }

interface Szerkesztes {
  sorszam: number
  hanyadik: number | null
  elem?: Element | null
}

interface Rajz {
  hover: Doboz[]
  aktiv: Doboz[]
  valtozott: Doboz[]
  rejtett: SzovegKulcs[]
  kartya: { left: number; top: number } | null
}

function osszevon(lista: Doboz[]): Doboz[] {
  const ki: Doboz[] = []
  for (const d of [...lista].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const sor = ki.find((k) => Math.min(k.top + k.height, d.top + d.height) - Math.max(k.top, d.top) > Math.min(k.height, d.height) / 2
      && d.left <= k.left + k.width + 8 && d.left + d.width >= k.left - 8)
    if (!sor) { ki.push({ ...d }); continue }
    const jobb = Math.max(sor.left + sor.width, d.left + d.width)
    const lent = Math.max(sor.top + sor.height, d.top + d.height)
    sor.left = Math.min(sor.left, d.left)
    sor.top = Math.min(sor.top, d.top)
    sor.width = jobb - sor.left
    sor.height = lent - sor.top
  }
  return ki
}

const URES_RAJZ: Rajz = { hover: [], aktiv: [], valtozott: [], rejtett: [], kartya: null }
const KARTYA_SZEL = 440

function rovid(s: string, n = 70): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function SzovegSzerkeszto({ kulcs, ny, ertek, eredetiErtek, valtozok, hely, onIr, onBezar, onValtozo }: {
  kulcs: SzovegKulcs
  ny: Nyelv
  ertek: string
  eredetiErtek: string
  valtozok: Valtozok
  hely: { left: number; top: number } | null
  onIr: (ertek: string) => void
  onBezar: () => void
  onValtozo: (nev: string) => void
}) {
  const s = DEF[kulcs]
  const alapErtek = alapSzoveg(s, ny)
  const mezo = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const doboz = useRef<HTMLDivElement>(null)
  const azon = `tsz-${ny}-${kulcs}`
  const fent = hely?.top
  useEffect(() => {
    if (fent === undefined || window.matchMedia('(max-width: 760px)').matches) return
    doboz.current?.scrollIntoView({ block: 'nearest' })
  }, [kulcs, fent])
  useEffect(() => {
    const m = mezo.current
    if (!m) return
    m.focus({ preventScroll: true })
    m.setSelectionRange(m.value.length, m.value.length)
  }, [kulcs, ny])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onBezar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onBezar])

  return (
    <div ref={doboz} className="tsz-kartya" role="dialog" aria-labelledby={`${azon}-cim`} data-kulcs={kulcs}
         style={hely ? { left: hely.left, top: hely.top } : undefined} data-helyetlen={hely ? undefined : ''}>
      <div className="tsz-kartya-fej">
        <div className="tsz-kartya-cim">
          <span className="tsz-kartya-hol">{KULCS_SAV[kulcs]?.cim}</span>
          <label id={`${azon}-cim`} htmlFor={azon}>
            {s.cimke}{ny === 'en' && <span className="pub-nyelv-jel">EN</span>}
          </label>
        </div>
        <button type="button" className="bezar" aria-label="Bezárás" onClick={onBezar}>×</button>
      </div>
      {s.sor ? (
        <textarea id={azon} ref={mezo} className="beviteli" lang={ny} value={ertek} placeholder={alapErtek}
                  rows={Math.min(8, Math.max(3, Math.ceil(ertek.length / 48) + ertek.split('\n').length - 1))}
                  onChange={(e) => onIr(e.target.value)} />
      ) : (
        <input id={azon} ref={mezo} className="beviteli" lang={ny} value={ertek} placeholder={alapErtek}
               onChange={(e) => onIr(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onBezar() } }} />
      )}
      <ValtozoMagyarazat ertek={ertek} sajat={s.valtozok ?? []} valtozok={valtozok} nyelv={ny} onValtozo={onValtozo} />
      {MIKOR[kulcs] && <small className="pub-mikor">{MIKOR[kulcs]}</small>}
      <div className="tsz-kartya-lab">
        {ertek !== eredetiErtek && <span className="cimke-pill">nem mentett</span>}
        {ertek !== alapErtek && (
          <button type="button" className="btn btn-kicsi btn-csendes" onClick={() => onIr(alapErtek)}>Eredeti szöveg</button>
        )}
        <button type="button" className="btn btn-kicsi btn-fo" onClick={onBezar}>Kész</button>
      </div>
    </div>
  )
}

export default function TartalomOldal({ onUgras, visszaterve = null, lap = 'fooldal', onLap }: {
  onUgras?: (cel: Ugras, honnan: Honnan) => void
  visszaterve?: Honnan | null
  lap?: TartalomLap
  onLap?: (lap: TartalomLap) => void
}) {
  const { data } = useApp()
  const { adat: pub, frissit } = usePublikusAdat()
  const [alap, setAlap] = useState(pub)
  const [v, setV] = useState<Ket>(() => piszkozattal(pub))
  const [ny, setNy] = useState<Nyelv>('hu')
  const [szerk, setSzerk] = useState<Szerkesztes | null>(null)
  const [hover, setHover] = useState<{ sorszam: number; hanyadik: number } | null>(null)
  const [rajz, setRajz] = useState<Rajz>(URES_RAJZ)
  const [rejtettNyitva, setRejtettNyitva] = useState(false)
  const [ujra, setUjra] = useState(0)
  const [sugoNyitva, setSugoNyitva] = useState(false)
  const { allapot, fut } = useMentes()
  const visszaRef = useRef(visszaterve)
  const varRef = useRef<{ sorszam: number; valtozo: string; hatarido: number } | null>(null)
  const terulet = useRef<HTMLDivElement>(null)
  const lapRef = useRef<HTMLDivElement>(null)
  const listaRef = useRef<Elofordulas[]>([])
  const kocka = useRef(0)
  const gorgetve = useRef('')

  if (pub !== alap) {
    setAlap(pub)
    setV(piszkozattal(pub))
  }

  const eredeti = useMemo(() => kezdoKet(pub), [pub])
  const valtozottak: Record<Nyelv, readonly SzovegDef[]> = {
    hu: LISTA.filter((s) => v.hu[s.kulcs as SzovegKulcs] !== eredeti.hu[s.kulcs as SzovegKulcs]),
    en: LISTA.filter((s) => v.en[s.kulcs as SzovegKulcs] !== eredeti.en[s.kulcs as SzovegKulcs]),
  }
  const vanValtozas = valtozottak.hu.length + valtozottak.en.length > 0
  const valtozottKulcsok = valtozottak[ny].map((s) => s.kulcs).join(',')
  const valtozottSorszam = useMemo(
    () => new Set(valtozottKulcsok.split(',').filter(Boolean).map((k) => SORSZAM[k as SzovegKulcs])),
    [valtozottKulcsok],
  )
  useMentetlen(vanValtozas)

  useEffect(() => {
    if (!pub) return
    for (const n of NYELVEK) {
      piszkozat[n] = Object.fromEntries(valtozottak[n].map((s) => [s.kulcs, v[n][s.kulcs as SzovegKulcs]])) as Partial<Szovegek>
    }
  })

  useEffect(() => {
    const h = visszaRef.current
    if (!h || !pub) return
    visszaRef.current = null
    if (h.kulcs) {
      const k = h.kulcs as SzovegKulcs
      if (SORSZAM[k] === undefined) return
      onLap?.(kulcsLapja(k))
      varRef.current = { sorszam: SORSZAM[k], valtozo: h.valtozo, hatarido: performance.now() + 2500 }
    } else {
      setSugoNyitva(true)
      window.setTimeout(() => {
        document.querySelector<HTMLElement>(`.pub-sugo [data-valtozo="${h.valtozo}"]`)?.focus()
      }, 100)
    }
  }, [pub, onLap])

  const kesleltetett = useDeferredValue(v)
  const elonezetTartalom = useMemo(
    () => (pub ? { ...pub.tartalom, szovegek: kesleltetett.hu, szovegek_en: kesleltetett.en } : null),
    [pub, kesleltetett],
  )
  const forras = useMemo(() => (pub ? bemutatoForras(pub.katalogus) : null), [pub])
  const bAlap = useMemo(() => (pub ? bemutatoAlap(pub.katalogus) : KISZAMOLT), [pub])
  const valtozok = useMemo<Record<Nyelv, Valtozok>>(() => (pub
    ? {
        hu: uzletValtozok(uzletbol(pub.tartalom, 'hu'), pub.lemondasOra),
        en: uzletValtozok(uzletbol(pub.tartalom, 'en'), pub.lemondasOra),
      }
    : { hu: {}, en: {} }), [pub])
  const jelolo = useCallback<Jelolo>((k, sz) => (SORSZAM[k] === undefined ? sz : jelol(SORSZAM[k], sz)), [])

  const bezar = useCallback(() => setSzerk(null), [])

  const rajzol = useCallback(() => {
    cancelAnimationFrame(kocka.current)
    kocka.current = requestAnimationFrame(() => {
      const t = terulet.current
      const l = lapRef.current
      if (!t || !l) return
      const lista = elofordulasok(l)
      listaRef.current = lista
      const tr = t.getBoundingClientRect()
      const rel = (r: DOMRect): Doboz => ({ left: r.left - tr.left, top: r.top - tr.top, width: r.width, height: r.height })
      const rectek = (rng: Range) => osszevon([...rng.getClientRects()].filter((x) => x.width > 0 && x.height > 0).map(rel))
      const nedik = (sorszam: number, n: number) => lista.filter((e) => e.sorszam === sorszam)[n]
      const latott = new Set<number>()
      for (const e of lista) if (lathato(e.tartomany)) latott.add(e.sorszam)
      l.querySelectorAll('[placeholder]').forEach((el) => {
        const p = el.getAttribute('placeholder') ?? ''
        const i = p.indexOf('⁣')
        if (i >= 0 && el.getClientRects().length > 0) {
          const d = [1, 2, 3].map((j) => p.charCodeAt(i + j) - 0xfe00)
          latott.add((d[0] << 8) | (d[1] << 4) | d[2])
        }
      })

      const varakozo = varRef.current
      if (varakozo) {
        const elso = lista.find((e) => e.sorszam === varakozo.sorszam && lathato(e.tartomany))
        if (!elso && performance.now() < varakozo.hatarido) {
          window.setTimeout(() => setUjra((n) => n + 1), 150)
          return
        }
        varRef.current = null
        if (elso) {
          elso.tartomany.startContainer.parentElement?.scrollIntoView({ block: 'center' })
          setSzerk({ sorszam: varakozo.sorszam, hanyadik: lista.filter((e) => e.sorszam === varakozo.sorszam).indexOf(elso) })
        } else {
          setRejtettNyitva(true)
          setSzerk({ sorszam: varakozo.sorszam, hanyadik: null })
        }
        window.setTimeout(() => {
          document.querySelector<HTMLElement>(`.tsz-kartya [data-valtozo-link="${varakozo.valtozo}"]`)?.focus()
        }, 150)
        return
      }

      let horgony: DOMRect | null = null
      let aktiv: Doboz[] = []
      if (szerk) {
        if (szerk.hanyadik !== null) {
          const e = nedik(szerk.sorszam, szerk.hanyadik)
          if (e) {
            aktiv = rectek(e.tartomany)
            horgony = e.tartomany.getBoundingClientRect()
          }
        }
        if (!horgony) {
          const el = szerk.elem?.isConnected ? szerk.elem
            : t.querySelector(`[data-rejtett-kulcs="${LISTA[szerk.sorszam]?.kulcs}"]`)
          if (el) horgony = el.getBoundingClientRect()
          if (el && horgony && l.contains(el)) aktiv = [rel(horgony)]
        }
        if (!horgony) {
          const e = lista.find((x) => x.sorszam === szerk.sorszam && lathato(x.tartomany))
          if (e) {
            aktiv = rectek(e.tartomany)
            horgony = e.tartomany.getBoundingClientRect()
          }
        }
      }
      const szerkAzon = szerk ? `${szerk.sorszam}-${szerk.hanyadik}` : ''
      if (horgony && szerkAzon !== gorgetve.current && window.matchMedia('(max-width: 760px)').matches
        && horgony.bottom > window.innerHeight * 0.5) {
        const gorgo = t.closest('.tartalom')
        const tav = horgony.top - window.innerHeight * 0.25
        if (gorgo && gorgo.scrollHeight > gorgo.clientHeight + 1) gorgo.scrollBy({ top: tav })
        else window.scrollBy({ top: tav })
      }
      gorgetve.current = szerkAzon
      const kartya = horgony
        ? {
            left: Math.max(8, Math.min(horgony.left - tr.left, tr.width - KARTYA_SZEL - 8)),
            top: horgony.bottom - tr.top + 10,
          }
        : null
      const hoverE = hover ? nedik(hover.sorszam, hover.hanyadik) : null
      setRajz({
        hover: hoverE && !(szerk && szerk.sorszam === hover?.sorszam && szerk.hanyadik === hover.hanyadik) ? rectek(hoverE.tartomany) : [],
        aktiv,
        valtozott: lista.filter((e) => valtozottSorszam.has(e.sorszam) && e.sorszam !== szerk?.sorszam).flatMap((e) => rectek(e.tartomany)),
        rejtett: lapKulcsai(lap).filter((k) => !latott.has(SORSZAM[k])),
        kartya,
      })
    })
  }, [hover, szerk, valtozottSorszam, lap])

  const rejtettLista = rajz.rejtett.join(',')
  useLayoutEffect(() => { rajzol() }, [rajzol, ny, kesleltetett, rejtettNyitva, rejtettLista, ujra])

  useEffect(() => {
    const l = lapRef.current
    if (!l) return
    const megfigyelo = new MutationObserver(() => rajzol())
    megfigyelo.observe(l, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['open', 'class', 'style'] })
    const meret = new ResizeObserver(() => rajzol())
    meret.observe(l)
    window.addEventListener('resize', rajzol)
    l.addEventListener('load', rajzol, true)
    return () => {
      megfigyelo.disconnect()
      meret.disconnect()
      window.removeEventListener('resize', rajzol)
      l.removeEventListener('load', rajzol, true)
      cancelAnimationFrame(kocka.current)
    }
  }, [rajzol, pub])

  useEffect(() => {
    setSzerk(null)
    setHover(null)
    terulet.current?.closest('.tartalom')?.scrollTo({ top: 0 })
  }, [lap])

  if (!pub || !elonezetTartalom || !forras) return <div className="betolt">Betöltés…</div>

  const valtozora = (nev: string, sugo: string) => onUgras?.(valtozoCel(nev, pub.tartalom.nyitvatartas), { sugo, valtozo: nev })
  const mezobol = (kulcs: string) => (nev: string) =>
    onUgras?.(valtozoCel(nev, pub.tartalom.nyitvatartas, ny), { kulcs, valtozo: nev })

  const modositott = LISTA.filter((s) => v.hu[s.kulcs as SzovegKulcs] !== s.alap).length
    + LISTA.filter((s) => v.en[s.kulcs as SzovegKulcs] !== s.en).length

  const kuldendo = (n: Nyelv) => Object.fromEntries(valtozottak[n].map((s) => {
    const uj = v[n][s.kulcs as SzovegKulcs]
    return [s.kulcs, uj.trim() === '' || uj === alapSzoveg(s, n) ? null : uj]
  }))

  const ir = (k: SzovegKulcs, ertek: string) => setV((x) => ({ ...x, [ny]: { ...x[ny], [k]: ertek } }))

  const pontbol = (x: number, y: number, cel: Element | null): Szerkesztes | null => {
    const l = lapRef.current
    if (!l) return null
    const t = talalat(listaRef.current, l, x, y, cel)
    if (!t) return null
    const hanyadik = t.tartomany ? listaRef.current.filter((e) => e.sorszam === t.sorszam).indexOf(t as Elofordulas) : null
    return { sorszam: t.sorszam, hanyadik, elem: t.tartomany ? null : cel }
  }

  const lapAdat = TARTALOM_LAPOK.find((l) => l.id === lap)!
  const szerkKulcs = szerk ? (LISTA[szerk.sorszam]?.kulcs as SzovegKulcs | undefined) : undefined
  const dobozok = (lista: Doboz[], osztaly: string) => lista.map((d, i) => (
    <span key={`${osztaly}-${i}`} className={osztaly} style={{ left: d.left - 2, top: d.top - 1, width: d.width + 4, height: d.height + 2 }} />
  ))

  return (
    <div className="oldal pub-oldal tsz-oldal">
      <PubFej
        cim={`Tartalom: ${lapAdat.cim}`}
        alcim="Kattints az előnézetben bármelyik szövegre, és mellette átírhatod. A változás azonnal látszik, a Mentés gombbal kerül ki a publikus oldalra."
        linkek={[['Publikus oldal megnyitása', lap === 'gyik' ? '/gyik' : '/publikus']]}
        valtozott={vanValtozas}
        allapot={allapot}
        onElvet={() => { setV(eredeti); setSzerk(null) }}
        onMent={() => void fut(async () => {
          await data.savePublikusTartalom({ szovegek: kuldendo('hu'), szovegek_en: kuldendo('en') })
          await frissit()
        })}
      />

      <div className="tsz-eszkozok">
        <div className="fulek tsz-lapok" role="tablist" aria-label="Tartalom oldalai">
          {TARTALOM_LAPOK.map((l) => (
            <button key={l.id} type="button" role="tab" aria-selected={l.id === lap} className={l.id === lap ? 'aktiv' : ''}
                    onClick={() => onLap?.(l.id)}>{l.cim}</button>
          ))}
        </div>
        <NyelvKapcsolo nyelv={ny} cimke="Az előnézet nyelve" onValt={(n) => { setNy(n); setSzerk(null) }} />
        <span className="halk tsz-szamlalo">{modositott} szöveg eltér az eredetitől</span>
      </div>

      <details className="panel pub-sugo" data-sugo="fent" open={sugoNyitva}
               onToggle={(e) => setSugoNyitva(e.currentTarget.open)}>
        <summary>Beírható adatok és kiemelés</summary>
        {sugoNyitva && <SugoTorzs id="fent" valtozok={valtozok.hu} onValtozo={valtozora} />}
      </details>

      <div className="tsz-terulet" ref={terulet}>
        <div className="panel tsz-rejtett" data-nyitva={rejtettNyitva || undefined}>
          <button type="button" className="tsz-rejtett-fej" aria-expanded={rejtettNyitva}
                  onClick={() => setRejtettNyitva((x) => !x)}>
            <span>Nem látható szövegek <span className="tsz-db">{rajz.rejtett.length}</span></span>
            <small className="halk">Képernyőolvasónak szóló, csak bizonyos helyzetben megjelenő vagy rejtett szövegek ezen az oldalon</small>
          </button>
          {rejtettNyitva && (
            <ul className="tsz-rejtett-lista">
              {rajz.rejtett.map((k) => (
                <li key={k}>
                  <button type="button" data-rejtett-kulcs={k} aria-pressed={szerkKulcs === k}
                          data-valtozott={valtozottSorszam.has(SORSZAM[k]) || undefined}
                          onClick={() => setSzerk({ sorszam: SORSZAM[k], hanyadik: null })}>
                    <strong>{DEF[k].cimke}</strong>
                    <span className="halk">{MIKOR[k] ?? KULCS_SAV[k]?.cim}</span>
                    <span className="tsz-rejtett-ertek">{rovid(v[ny][k])}</span>
                  </button>
                </li>
              ))}
              {rajz.rejtett.length === 0 && <li className="halk">Ezen az oldalon minden szöveg látszik az előnézetben.</li>}
            </ul>
          )}
        </div>

        <div className="tsz-lap" ref={lapRef} data-mutat={hover ? '' : undefined}
             onMouseMove={(e) => {
               const p = pontbol(e.clientX, e.clientY, e.target as Element)
               const uj = p && p.hanyadik !== null ? { sorszam: p.sorszam, hanyadik: p.hanyadik } : null
               setHover((x) => (x?.sorszam === uj?.sorszam && x?.hanyadik === uj?.hanyadik ? x : uj))
             }}
             onMouseLeave={() => setHover(null)}
             onSubmitCapture={(e) => e.preventDefault()}
             onClickCapture={(e) => {
               const p = pontbol(e.clientX, e.clientY, e.target as Element)
               if (p) {
                 e.preventDefault()
                 e.stopPropagation()
                 setSzerk(p)
                 return
               }
               if ((e.target as Element).closest('a')) e.preventDefault()
               if (szerk) setSzerk(null)
             }}>
          <TartalomProvider t={elonezetTartalom} lemondasOra={pub.lemondasOra} nyelv={ny} jelolo={jelolo}>
            {LAP_SAVOK[lap].map((id) => {
              const sav = SAV[id]
              return (
                <section key={id} className="tsz-blokk" data-sav={id}>
                  <div className="tsz-blokk-fej">
                    <span className="tsz-blokk-cim">{sav.cim}</span>
                    <span className="tsz-blokk-leiras">{sav.leiras}</span>
                  </div>
                  <SavElonezet sav={sav} pub={pub} forras={forras} alap={bAlap} />
                </section>
              )
            })}
          </TartalomProvider>
        </div>

        <div className="tsz-retegek" aria-hidden="true">
          {dobozok(rajz.valtozott, 'tsz-valtozott')}
          {dobozok(rajz.hover, 'tsz-hover')}
          {dobozok(rajz.aktiv, 'tsz-aktiv')}
        </div>

        {szerkKulcs && (
          <SzovegSzerkeszto kulcs={szerkKulcs} ny={ny} ertek={v[ny][szerkKulcs]} eredetiErtek={eredeti[ny][szerkKulcs]}
                            valtozok={valtozok[ny]} hely={rajz.kartya}
                            onIr={(x) => ir(szerkKulcs, x)} onBezar={bezar} onValtozo={mezobol(szerkKulcs)} />
        )}
      </div>
    </div>
  )
}
