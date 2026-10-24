import type { GyikPublikus } from './gyik'
import { UZLET } from './arculat'
import { ADATFELDOLGOZOK, CEG, JOGI_HATALY, TERVEZET, type Kamera } from './ceg'
import type { Nyelv } from './nyelv'
import type { BookingScope, SeatMaterial, VehicleCategory } from './types'

export interface PublikusAdatokNyers {
  nev?: string | null
  telefon?: string | null
  email?: string | null
  irsz?: string | null
  cim?: string | null
  haz?: string | null
  szint?: string | null
  bejarat?: string | null
  kerulet?: string | null
  szint_en?: string | null
  bejarat_en?: string | null
  kerulet_en?: string | null
  ceg_nev?: string | null
  ceg_rovid_nev?: string | null
  ceg_szekhely?: string | null
  ceg_cegjegyzekszam?: string | null
  ceg_cegbirosag?: string | null
  ceg_adoszam?: string | null
  jogi_hataly?: string | null
  jogi_tervezet?: boolean | null
  konyvelo_nev?: string | null
  konyvelo_cim?: string | null
  kamera_megorzes?: string | null
  kamera_megorzes_en?: string | null
  google_ertekeles?: string | null
}


export interface NyitvaNap {
  weekday: number
  closed: boolean
  opens: string | null
  closes: string | null
}

export interface Velemeny {
  nev: string
  csillag: number
  szoveg: string
  datum: string | null
}

export interface VelemenySor extends Velemeny {
  id?: string
  aktiv: boolean
}

export const GOOGLE_KERESES = 'https://www.google.com/search?q=Mosathat+-+Hand+Car+Wash+Budapest'

export interface PublikusTartalomNyers {
  velemenyek?: Velemeny[]
  gyik?: GyikPublikus
  adatok: PublikusAdatokNyers
  szovegek: Record<string, string>
  szovegek_en: Record<string, string>
  kamerak: Kamera[]
  nyitvatartas: NyitvaNap[]
  leadas: string | null
}

export interface PublikusMentes {
  adatok?: PublikusAdatokNyers
  szovegek?: Record<string, string | null>
  szovegek_en?: Record<string, string | null>
  kamerak?: Kamera[]
}

export const URES_TARTALOM: PublikusTartalomNyers = { adatok: {}, szovegek: {}, szovegek_en: {}, kamerak: [], nyitvatartas: [], leadas: null }

export interface Uzlet {
  nev: string
  telefon: string
  email: string
  irsz: string
  cim: string
  haz: string
  szint: string
  bejarat: string
  kerulet: string
  napok: string
  napokRovid: string
  nyitas: string
  zaras: string
  nyitvatartas: string
  leadas: string
}

export const ELERHETOSEG_ALAP: Record<'nev' | 'telefon' | 'email' | 'irsz' | 'cim' | 'haz' | 'szint' | 'bejarat' | 'kerulet', string> = {
  nev: UZLET.nev,
  telefon: UZLET.telefon,
  email: CEG.email,
  irsz: UZLET.irsz,
  cim: UZLET.cim,
  haz: UZLET.haz,
  szint: UZLET.szint,
  bejarat: UZLET.bejarat,
  kerulet: UZLET.kerulet,
}

export const ELERHETOSEG_ALAP_EN: Record<'szint' | 'bejarat' | 'kerulet', string> = {
  szint: 'underground car park, level −1',
  bejarat: 'from Dagály utca',
  kerulet: 'Budapest, District XIII',
}

export const FORDITHATO_ADATOK = ['szint', 'bejarat', 'kerulet'] as const

export const CEG_ALAP: Record<'ceg_nev' | 'ceg_rovid_nev' | 'ceg_szekhely' | 'ceg_cegjegyzekszam' | 'ceg_cegbirosag' | 'ceg_adoszam' | 'jogi_hataly', string> = {
  ceg_nev: CEG.nev,
  ceg_rovid_nev: CEG.rovidNev,
  ceg_szekhely: CEG.szekhely,
  ceg_cegjegyzekszam: CEG.cegjegyzekszam,
  ceg_cegbirosag: CEG.cegbirosag,
  ceg_adoszam: CEG.adoszam,
  jogi_hataly: JOGI_HATALY,
}

const NAP_NEV: Record<Nyelv, string[]> = {
  hu: ['', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'],
  en: ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
}
const NAP_ROVID: Record<Nyelv, string[]> = {
  hu: ['', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'],
  en: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}

function ora(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':')
  return `${Number(h)}:${m ?? '00'}`
}

export interface NyitvaSzakasz {
  napok: string
  napokRovid: string
  nyitas: string
  zaras: string
  hossz: number
}

function szakaszok(napok: NyitvaNap[]): { tol: number; ig: number; nyitas: string; zaras: string }[] {
  const nyitott = [...napok].sort((a, b) => a.weekday - b.weekday).filter((d) => !d.closed && d.opens && d.closes)
  const ki: { tol: number; ig: number; nyitas: string; zaras: string }[] = []
  for (const d of nyitott) {
    const utolso = ki[ki.length - 1]
    if (utolso && utolso.ig === d.weekday - 1 && utolso.nyitas === ora(d.opens) && utolso.zaras === ora(d.closes)) {
      utolso.ig = d.weekday
    } else {
      ki.push({ tol: d.weekday, ig: d.weekday, nyitas: ora(d.opens), zaras: ora(d.closes) })
    }
  }
  return ki
}

export function foSzakaszNapok(napok: NyitvaNap[]): number[] {
  const fo = [...szakaszok(napok)].sort((x, y) => (y.ig - y.tol) - (x.ig - x.tol))[0]
  return fo ? Array.from({ length: fo.ig - fo.tol + 1 }, (_, i) => fo.tol + i) : []
}

function nyitvaSzakaszok(napok: NyitvaNap[], nyelv: Nyelv = 'hu'): NyitvaSzakasz[] {
  const nev = NAP_NEV[nyelv]
  const rovid = NAP_ROVID[nyelv]
  return szakaszok(napok).map((s) => ({
    napok: s.tol === s.ig ? nev[s.tol] : `${nev[s.tol]}–${nev[s.ig]}`,
    napokRovid: s.tol === s.ig ? rovid[s.tol] : `${rovid[s.tol]}–${rovid[s.ig]}`,
    nyitas: s.nyitas,
    zaras: s.zaras,
    hossz: s.ig - s.tol + 1,
  }))
}

const ertek = (v: string | null | undefined, alap: string) => (v && v.trim() ? v.trim() : alap)

export function uzletbol(t: PublikusTartalomNyers, nyelv: Nyelv = 'hu'): Uzlet {
  const a = t.adatok
  const nyitva = nyitvaSzakaszok(t.nyitvatartas, nyelv)
  const fo = [...nyitva].sort((x, y) => y.hossz - x.hossz)[0]
  const en = nyelv === 'en'
  const forditott = (k: (typeof FORDITHATO_ADATOK)[number]) => (en
    ? a[`${k}_en`]?.trim() || ELERHETOSEG_ALAP_EN[k]
    : ertek(a[k], ELERHETOSEG_ALAP[k]))
  return {
    nev: ertek(a.nev, ELERHETOSEG_ALAP.nev),
    telefon: ertek(a.telefon, ELERHETOSEG_ALAP.telefon),
    email: ertek(a.email, ELERHETOSEG_ALAP.email),
    irsz: ertek(a.irsz, ELERHETOSEG_ALAP.irsz),
    cim: ertek(a.cim, ELERHETOSEG_ALAP.cim),
    haz: ertek(a.haz, ELERHETOSEG_ALAP.haz),
    szint: forditott('szint'),
    bejarat: forditott('bejarat'),
    kerulet: forditott('kerulet'),
    napok: fo?.napok ?? (en ? 'Monday–Friday' : UZLET.napok),
    napokRovid: fo?.napokRovid ?? (en ? 'Mon–Fri' : UZLET.napokRovid),
    nyitas: fo?.nyitas ?? UZLET.nyitas,
    zaras: fo?.zaras ?? UZLET.zaras,
    nyitvatartas: nyitva.length > 0
      ? nyitva.map((s) => `${s.napok} ${s.nyitas}–${s.zaras}`).join(', ')
      : `${en ? 'Monday–Friday' : UZLET.napok} ${UZLET.nyitas}–${UZLET.zaras}`,
    leadas: t.leadas ? ora(t.leadas) : UZLET.leadas,
  }
}

export interface CegAdatok {
  nev: string
  rovidNev: string
  szekhely: string
  cegjegyzekszam: string
  cegbirosag: string
  adoszam: string
  email: string
  telefon: string
}

export interface Adatfeldolgozo {
  nev: string
  cim: string
  feladat: string
}

export interface JogiAdatok {
  hataly: string
  tervezet: boolean
  adatfeldolgozok: Adatfeldolgozo[]
  kamera: { megorzes: string | null; kamerak: Kamera[] }
}

export function cegbol(t: PublikusTartalomNyers, u: Uzlet): CegAdatok {
  const a = t.adatok
  return {
    nev: ertek(a.ceg_nev, CEG_ALAP.ceg_nev),
    rovidNev: ertek(a.ceg_rovid_nev, CEG_ALAP.ceg_rovid_nev),
    szekhely: ertek(a.ceg_szekhely, CEG_ALAP.ceg_szekhely),
    cegjegyzekszam: ertek(a.ceg_cegjegyzekszam, CEG_ALAP.ceg_cegjegyzekszam),
    cegbirosag: ertek(a.ceg_cegbirosag, CEG_ALAP.ceg_cegbirosag),
    adoszam: ertek(a.ceg_adoszam, CEG_ALAP.ceg_adoszam),
    email: u.email,
    telefon: u.telefon,
  }
}

export function jogibol(t: PublikusTartalomNyers, u: Uzlet, nyelv: Nyelv = 'hu'): JogiAdatok {
  const a = t.adatok
  const konyvelo = a.konyvelo_nev?.trim()
  const en = nyelv === 'en'
  return {
    hataly: ertek(a.jogi_hataly, CEG_ALAP.jogi_hataly),
    tervezet: a.jogi_tervezet ?? TERVEZET,
    adatfeldolgozok: ADATFELDOLGOZOK.map((x) => {
      const feladat = en ? x.feladatEn : x.feladat
      if (x.konyvelo) {
        return konyvelo
          ? { nev: konyvelo, cim: a.konyvelo_cim?.trim() ?? '', feladat }
          : { nev: en ? x.nevEn : x.nev, cim: '', feladat }
      }
      if (x.levelezes) {
        return { nev: x.nev, cim: en ? x.cimEn : x.cim, feladat: en ? `hosting of the ${u.email} mailbox` : `az ${u.email} e-mail fiók tárhelye` }
      }
      return { nev: x.nev, cim: en ? x.cimEn : x.cim, feladat }
    }),
    kamera: {
      megorzes: (en ? a.kamera_megorzes_en?.trim() || a.kamera_megorzes?.trim() : a.kamera_megorzes?.trim()) || null,
      kamerak: en
        ? t.kamerak.map((k) => ({ hely: k.hely_en?.trim() || k.hely, terulet: k.terulet_en?.trim() || k.terulet }))
        : t.kamerak,
    },
  }
}

export interface SzovegDef {
  kulcs: string
  csoport: SzovegCsoport
  cimke: string
  alap: string
  en: string
  sor?: boolean
  valtozok?: string[]
}

export type SzovegCsoport = 'menu' | 'hero' | 'rolunk' | 'galeria' | 'csomagok' | 'foglalas' | 'adatok' | 'hely' | 'lab' | 'cimkek' | 'oldal' | 'ugyfel' | 'velemeny' | 'gyik'

export const SZOVEGEK = [
  { kulcs: 'menu.rolunk', csoport: 'menu', cimke: 'Menü: rólunk', alap: 'Rólunk', en: 'About us' },
  { kulcs: 'menu.galeria', csoport: 'menu', cimke: 'Menü: galéria', alap: 'Galéria', en: 'Gallery' },
  { kulcs: 'menu.csomagok', csoport: 'menu', cimke: 'Menü: csomagok', alap: 'Csomagok', en: 'Packages' },
  { kulcs: 'menu.foglalas', csoport: 'menu', cimke: 'Menü: foglalás', alap: 'Foglalás', en: 'Booking' },
  { kulcs: 'menu.kapcsolat', csoport: 'menu', cimke: 'Menü: kapcsolat', alap: 'Kapcsolat', en: 'Contact' },
  { kulcs: 'gomb.idopont', csoport: 'menu', cimke: 'Időpontkérő gomb és link', alap: 'Időpontot kérek', en: 'Book an appointment' },

  { kulcs: 'hero.felcim', csoport: 'hero', cimke: 'Felcím (a nagy cím fölött)', alap: 'Kézi autókozmetika — {kerulet}', en: 'Hand car detailing — {kerulet}' },
  { kulcs: 'hero.cim', csoport: 'hero', cimke: 'Nagy cím', alap: 'Az autó nem tárgy.\n*Évekig* veled van.', sor: true, en: 'Your car isn’t just a thing.\nIt’s with you *for years*.' },
  { kulcs: 'hero.bevezeto', csoport: 'hero', cimke: 'Bevezető (bal hasáb)', sor: true,
    alap: 'Kézi mosás és kézi takarítás a Váci úti {haz} mélygarázsában. Bogároldótól a hosszantartó vaxig, három csomagban — és pontosan leírva, melyik mit tud.', en: 'Hand washing and hand cleaning in the underground car park of {haz} on Váci út. From bug removal to long-lasting wax, in three packages — with a clear description of what each one includes.' },
  { kulcs: 'hero.mellek', csoport: 'hero', cimke: 'Kiegészítő szöveg (jobb hasáb)', sor: true,
    alap: 'Hétfőtől péntekig {nyitas}–{zaras}, de autót már reggel {leadas} után le lehet adni. A bejárat a {bejarat} nyílik, a mélygarázs −1. szintjén.', en: 'Monday to Friday {nyitas}–{zaras}, but you can drop your car off from {leadas} in the morning. The entrance is {bejarat}, on level −1 of the underground car park.' },
  { kulcs: 'hero.borito_alt', csoport: 'hero', cimke: 'Borítókép leírása (képernyőolvasónak)', alap: '{nev} — kézi autókozmetika a {haz} mélygarázsában', en: '{nev} — hand car detailing in the underground car park of {haz}' },
  { kulcs: 'hero.borito_helye', csoport: 'hero', cimke: 'Felirat, amíg nincs borítókép', alap: 'Fotó helye — garázs, munka közben', en: 'Photo placeholder — the garage, at work' },

  { kulcs: 'rolunk.cim', csoport: 'rolunk', cimke: 'Cím', alap: 'Rólunk', en: 'About us' },
  { kulcs: 'rolunk.bekezdes1', csoport: 'rolunk', cimke: 'Első bekezdés (nagyobb betűvel)', sor: true,
    alap: 'Látogass el a XIII. kerületi autómosónkba, ha autódnak egy igazán alapos tisztításra van szüksége. Kézi mosónkban biztos lehetsz benne, hogy kiváló kiszolgálásban lesz részed.',
    en: 'Visit our car wash in Budapest’s District XIII when your car needs a truly thorough clean. At our hand car wash, you can be sure of excellent service.' },
  { kulcs: 'rolunk.bekezdes2', csoport: 'rolunk', cimke: 'Második bekezdés', sor: true,
    alap: 'A gyors és minőségi kiszolgálás garanciáját a szakembereink többéves tapasztalata biztosítja. Mosás közben csak és kizárólag a legjobb minőségű eszközöket és anyagokat használjuk, mert hiszünk abban, hogy egy autó azt érdemli, amit a tulajdonosa: törődést a legmagasabb színvonalon. Az autónk több, mint egy használati tárgy, éveken keresztül kísér el bennünket, ezért fontos, hogy komfortosan érezzük magunkat benne rövid és hosszútávon egyaránt.',
    en: 'Our specialists’ years of experience guarantee fast, high-quality service. We only ever use the best tools and products, because we believe a car deserves the same as its owner: care of the highest standard. A car is more than an everyday object — it stays with us for years, so it matters that we feel comfortable in it, in the short run and the long run alike.' },

  { kulcs: 'galeria.cim', csoport: 'galeria', cimke: 'Cím', alap: 'Galéria', en: 'Gallery' },
  { kulcs: 'galeria.bevezeto', csoport: 'galeria', cimke: 'Bevezető', sor: true,
    alap: 'A képeken egy régen mosott autót láthatsz, nézd meg mire képes a csapatunk! Használd a szivacsot és mentsd meg a kosztól a Subarut. A következő lehet a te autód is!',
    en: 'These photos show a car that had not been washed in a long time. See what our team can do! Grab the sponge and save the Subaru from the dirt. Your car could be next!' },
  { kulcs: 'galeria.foglalas', csoport: 'galeria', cimke: 'Gomb a leírás alatt', alap: 'Időpontfoglalás', en: 'Book an appointment' },
  { kulcs: 'galeria.meret', csoport: 'galeria', cimke: 'A csúszka neve (képernyőolvasónak)', alap: 'Szivacs mérete', en: 'Sponge size' },
  { kulcs: 'galeria.reset', csoport: 'galeria', cimke: 'A Reset gomb neve (képernyőolvasónak, egérrel fölé állva is látszik)', alap: 'Újra koszos', en: 'Make it dirty again' },
  { kulcs: 'galeria.szivacs', csoport: 'galeria', cimke: 'A szivacs gomb neve (képernyőolvasónak, érintőképernyőn)', alap: 'Szivacs: mosás ujjal', en: 'Sponge: wash with your finger' },
  { kulcs: 'galeria.vege', csoport: 'galeria', cimke: 'Az X gomb neve (képernyőolvasónak, érintőképernyőn)', alap: 'Mosás vége, görgetés vissza', en: 'Stop washing and scroll again' },
  { kulcs: 'galeria.kep_alt', csoport: 'galeria', cimke: 'A képek leírása (képernyőolvasónak)', alap: 'Ugyanaz az autó koszosan és tisztán', en: 'The same car dirty and clean' },

  { kulcs: 'csomagok.cim', csoport: 'csomagok', cimke: 'Cím', alap: 'Csomagok', en: 'Packages' },
  { kulcs: 'csomagok.ervenyes', csoport: 'csomagok', cimke: 'Alcím: az árak érvényessége', alap: 'Áraink ettől érvényesek: 2026.01.01.', en: 'Our prices are valid from 1 January 2026.' },
  { kulcs: 'csomagok.alcim.szemelyauto', csoport: 'csomagok', cimke: 'Alcím: személyautónál', alap: 'Személygépjármű — sedan, kombi, ferdehátú', en: 'Passenger car — saloon, estate, hatchback' },
  { kulcs: 'csomagok.alcim.suv', csoport: 'csomagok', cimke: 'Alcím: SUV-nál', alap: 'SUV, egyterű', en: 'SUV, MPV' },
  { kulcs: 'csomagok.alcim.kisbusz', csoport: 'csomagok', cimke: 'Alcím: kisbusznál', alap: 'Kisbusz, furgon', en: 'Minibus, van' },
  { kulcs: 'csomagok.kategoria', csoport: 'csomagok', cimke: 'A kategóriaválasztó címe', alap: 'Járműkategória', en: 'Vehicle category' },
  { kulcs: 'csomagok.kat.szemelyauto', csoport: 'csomagok', cimke: 'Kategória gomb: személyautó', alap: 'Személygépjármű', en: 'Passenger car' },
  { kulcs: 'csomagok.kat.suv', csoport: 'csomagok', cimke: 'Kategória gomb: SUV', alap: 'SUV, Egyterű', en: 'SUV, MPV' },
  { kulcs: 'csomagok.kat.kisbusz', csoport: 'csomagok', cimke: 'Kategória gomb: kisbusz', alap: 'Kisbusz, Furgon', en: 'Minibus, Van' },
  { kulcs: 'csomagok.csoport.kulso', csoport: 'csomagok', cimke: 'Sorcsoport: külső munkák', alap: 'Mosás', en: 'Exterior' },
  { kulcs: 'csomagok.csoport.belso', csoport: 'csomagok', cimke: 'Sorcsoport: belső munkák', alap: 'Takarítás', en: 'Interior' },
  { kulcs: 'csomagok.csak.kulso', csoport: 'csomagok', cimke: 'A Mosás sor felirata az árak előtt', alap: 'Csak mosás:', en: 'Exterior only:' },
  { kulcs: 'csomagok.csak.belso', csoport: 'csomagok', cimke: 'A Takarítás sor felirata az árak előtt', alap: 'Csak takarítás:', en: 'Interior only:' },
  { kulcs: 'csomagok.egyeb.cim', csoport: 'csomagok', cimke: 'Egyéb szolgáltatások: cím a táblázat alatt', alap: 'Egyéb szolgáltatások', en: 'Other services' },
  { kulcs: 'csomagok.egyeb.kulso', csoport: 'csomagok', cimke: 'Egyéb szolgáltatások: külső oszlop', alap: 'Külső', en: 'Exterior' },
  { kulcs: 'csomagok.egyeb.belso', csoport: 'csomagok', cimke: 'Egyéb szolgáltatások: belső oszlop', alap: 'Belső', en: 'Interior' },
  { kulcs: 'csomagok.egyeb.benne', csoport: 'csomagok', cimke: 'Egyéb szolgáltatások: ha egy csomagban benne van', alap: 'Benne van: {csomagok}', valtozok: ['csomagok'], en: 'Included in: {csomagok}' },

  { kulcs: 'foglalas.cim', csoport: 'foglalas', cimke: 'Cím', alap: 'Időpontfoglalás', en: 'Online booking' },
  { kulcs: 'foglalas.bevezeto', csoport: 'foglalas', cimke: 'Bevezető', sor: true,
    alap: 'Válaszd ki, mit szeretnél, és mutatjuk a szabad időpontokat. A kérésedet munkatársunk igazolja vissza.', en: 'Choose what you need and we’ll show you the available times. Our team will confirm your request.' },
  { kulcs: 'foglalas.auto', csoport: 'foglalas', cimke: '1. lépés címe', alap: 'Milyen autóval jössz?', en: 'What car are you bringing?' },
  { kulcs: 'foglalas.kat.szemelyauto', csoport: 'foglalas', cimke: 'Autó: személyautó', alap: 'Személyautó', en: 'Passenger car' },
  { kulcs: 'foglalas.kat.suv', csoport: 'foglalas', cimke: 'Autó: SUV', alap: 'SUV / Egyterű', en: 'SUV / MPV' },
  { kulcs: 'foglalas.kat.kisbusz', csoport: 'foglalas', cimke: 'Autó: kisbusz', alap: 'Kisbusz / Furgon', en: 'Minibus / Van' },
  { kulcs: 'foglalas.csomag', csoport: 'foglalas', cimke: '2. lépés címe', alap: 'Csomag', en: 'Package' },
  { kulcs: 'foglalas.arajanlat', csoport: 'foglalas', cimke: 'Ha nincs fix ár', alap: 'árajánlat alapján', en: 'price on request' },
  { kulcs: 'foglalas.fs', csoport: 'foglalas', cimke: 'Full Service neve', alap: 'Full Service', en: 'Full Service' },
  { kulcs: 'foglalas.fs_leiras', csoport: 'foglalas', cimke: 'Full Service leírása', sor: true,
    alap: 'A csomag mellé az ülések mélytisztítása: kárpitnál vizes kárpittisztítás, bőrnél bőrtisztítás és ápolás. A vizes kárpit aznap is elvihető, de ajánlott egy éjszakára nálunk hagyni, hogy megszáradjon.', en: 'Deep cleaning of the seats on top of the package: wet cleaning for fabric upholstery, cleaning and conditioning for leather. Wet upholstery can be collected the same day, but we recommend leaving the car with us overnight so it can dry.' },
  { kulcs: 'foglalas.fs_csomaggal', csoport: 'foglalas', cimke: 'Full Service ár alatt', alap: '{csomag} csomaggal együtt', valtozok: ['csomag'], en: 'together with the {csomag} package' },
  { kulcs: 'foglalas.ules', csoport: 'foglalas', cimke: 'Ülés kérdése', alap: 'Milyen az ülés?', en: 'What are the seats like?' },
  { kulcs: 'foglalas.ules.karpit', csoport: 'foglalas', cimke: 'Ülés: kárpit', alap: 'Kárpit', en: 'Fabric' },
  { kulcs: 'foglalas.ules.bor', csoport: 'foglalas', cimke: 'Ülés: bőr', alap: 'Bőr', en: 'Leather' },
  { kulcs: 'foglalas.ules.karpit_bor', csoport: 'foglalas', cimke: 'Ülés: kárpit-bőr', alap: 'Kárpit-bőr', en: 'Fabric and leather' },
  { kulcs: 'foglalas.mit', csoport: 'foglalas', cimke: '3. lépés címe', alap: 'Mit csináljunk?', en: 'What should we do?' },
  { kulcs: 'foglalas.terjedelem.teljes', csoport: 'foglalas', cimke: 'Terjedelem: teljes', alap: 'Teljes', en: 'Inside and out' },
  { kulcs: 'foglalas.terjedelem.kulso', csoport: 'foglalas', cimke: 'Terjedelem: csak kívül', alap: 'Csak kívül', en: 'Exterior only' },
  { kulcs: 'foglalas.terjedelem.belso', csoport: 'foglalas', cimke: 'Terjedelem: csak belül', alap: 'Csak belül', en: 'Interior only' },
  { kulcs: 'foglalas.telefonon', csoport: 'foglalas', cimke: 'Ha csak telefonon kérhető', alap: 'telefonon', en: 'by phone' },
  { kulcs: 'foglalas.fs_teljes', csoport: 'foglalas', cimke: 'Full Service-nél (3. lépés)', alap: 'Full Service-nél a teljes csomag jár, kívül és belül.', en: 'Full Service includes the complete package, inside and out.' },
  { kulcs: 'foglalas.extrak', csoport: 'foglalas', cimke: '4. lépés címe', alap: 'Kérsz még valamit?', en: 'Anything else?' },
  { kulcs: 'foglalas.nem_kotelezo', csoport: 'foglalas', cimke: '4. lépés kiegészítése', alap: 'nem kötelező', en: 'optional' },
  { kulcs: 'foglalas.extrak_benne', csoport: 'foglalas', cimke: 'Megjegyzés az extrákhoz', alap: 'Ami a {csomag} csomagban már benne van, azt itt nem kínáljuk külön.', valtozok: ['csomag'], en: 'Anything already included in the {csomag} package is not offered separately here.' },
  { kulcs: 'foglalas.ar_egyeztetes', csoport: 'foglalas', cimke: 'Extra egyeztetendő árral', alap: 'ár egyeztetés után', en: 'price on consultation' },
  { kulcs: 'foglalas.var_vagy_hagy', csoport: 'foglalas', cimke: '5. lépés címe', alap: 'Megvárod, vagy itt hagyod?', en: 'Will you wait, or leave it with us?' },
  { kulcs: 'foglalas.varom', csoport: 'foglalas', cimke: 'Megvárom', alap: 'Megvárom', en: 'I’ll wait' },
  { kulcs: 'foglalas.varom_leiras', csoport: 'foglalas', cimke: 'Megvárom: leírás', alap: 'Pontos kezdési időpontot választasz, és amíg kész, nálunk várhatsz.', en: 'You choose an exact start time and can wait with us until it’s done.' },
  { kulcs: 'foglalas.hagyom', csoport: 'foglalas', cimke: 'Itt hagyom', alap: 'Itt hagyom', en: 'I’ll leave it' },
  { kulcs: 'foglalas.hagyom_leiras', csoport: 'foglalas', cimke: 'Itt hagyom: leírás', alap: 'Behozod amikor tudod, kész vagyunk mire viszed.', en: 'Bring it in when it suits you, and it’ll be ready by the time you collect it.' },
  { kulcs: 'foglalas.elvitel', csoport: 'foglalas', cimke: '5. lépés címe Full Service-nél', alap: 'Mikor viszed el?', en: 'When will you collect it?' },
  { kulcs: 'foglalas.elvitel_fs', csoport: 'foglalas', cimke: '5. lépés magyarázata Full Service-nél', alap: 'Full Service-nél az autót nálunk hagyod.', en: 'With Full Service you leave the car with us.' },
  { kulcs: 'foglalas.aznap', csoport: 'foglalas', cimke: 'Aznap', alap: 'Aznap', en: 'Same day' },
  { kulcs: 'foglalas.aznap_vizes', csoport: 'foglalas', cimke: 'Aznap: kárpitos ülésnél', alap: 'Amint elkészül, vizesen elviheted.', en: 'You can take it as soon as it’s done, while the seats are still damp.' },
  { kulcs: 'foglalas.aznap_bor', csoport: 'foglalas', cimke: 'Aznap: bőr ülésnél', alap: 'Amint elkészül, elviheted.', en: 'You can take it as soon as it’s done.' },
  { kulcs: 'foglalas.masnap', csoport: 'foglalas', cimke: 'Másnap', alap: 'Másnap', en: 'Next day' },
  { kulcs: 'foglalas.masnap_szarad', csoport: 'foglalas', cimke: 'Másnap: ajánlás kárpitos ülésnél', alap: 'Ajánlott: egy éjszakát nálunk szárad.', en: 'Recommended: it dries overnight with us.' },
  { kulcs: 'foglalas.masnap_leiras', csoport: 'foglalas', cimke: 'Másnap: leírás', alap: 'Másnap reggel 8-tól zárásig bármikor elviheted.', en: 'You can collect it any time the next day from 8:00 until closing.' },
  { kulcs: 'foglalas.nap', csoport: 'foglalas', cimke: '6. lépés címe', alap: 'Melyik nap?', en: 'Which day?' },
  { kulcs: 'foglalas.nincs_munkaido', csoport: 'foglalas', cimke: 'Ha nincs munkaidő megadva', sor: true,
    alap: 'Ehhez a választáshoz nincs megadva munkaidő, ezért nem tudunk szabad időpontot számolni. Kérjük, hívj minket.', en: 'No working time has been set for this choice, so we can’t calculate the available times. Please give us a call.' },
  { kulcs: 'foglalas.allapot.szabad', csoport: 'foglalas', cimke: 'Nap állapota: szabad', alap: 'Szabad', en: 'Available' },
  { kulcs: 'foglalas.allapot.keves', csoport: 'foglalas', cimke: 'Nap állapota: kevés hely', alap: 'Kevés hely', en: 'Few left' },
  { kulcs: 'foglalas.allapot.tele', csoport: 'foglalas', cimke: 'Nap állapota: tele', alap: 'Tele', en: 'Full' },
  { kulcs: 'foglalas.allapot.zarva', csoport: 'foglalas', cimke: 'Nap állapota: zárva', alap: 'Zárva', en: 'Closed' },
  { kulcs: 'foglalas.kezdes', csoport: 'foglalas', cimke: '7. lépés címe, ha megvárja', alap: 'Mikor kezdjük?', en: 'When should we start?' },
  { kulcs: 'foglalas.hozas', csoport: 'foglalas', cimke: '7. lépés címe, ha itt hagyja', alap: 'Mikor hozod?', en: 'When will you bring it?' },
  { kulcs: 'foglalas.nincs_ido', csoport: 'foglalas', cimke: 'Ha a napon nincs szabad időpont', alap: 'Erre a napra már nincs szabad időpont.', en: 'There are no available times left on this day.' },
  { kulcs: 'foglalas.kesz_kb', csoport: 'foglalas', cimke: 'Időpont alatt: várható elkészülés', alap: 'kész kb.', en: 'ready approx.' },
  { kulcs: 'foglalas.hatarido', csoport: 'foglalas', cimke: 'Határidő kérdése', alap: 'Mikorra legyen kész?', en: 'When do you need it ready?' },
  { kulcs: 'foglalas.hatarido_nincs', csoport: 'foglalas', cimke: 'Ha nem vállalható határidő', alap: 'Erre a hozási időre nem tudunk határidőt vállalni, válassz korábbit.', en: 'We can’t promise a ready time for this drop-off time. Please choose an earlier one.' },
  { kulcs: 'foglalas.hatarido_savos', csoport: 'foglalas', cimke: 'Határidő tartománya', alap: 'Legkorábban {tol}, legkésőbb {ig}.', valtozok: ['tol', 'ig'], en: 'Earliest {tol}, latest {ig}.' },
  { kulcs: 'foglalas.elvitel_mikor', csoport: 'foglalas', cimke: 'Másnapi elvitel ideje', alap: 'Elviheted: *{mikor}*, bármikor.', valtozok: ['mikor'], en: 'You can collect it: *{mikor}*, any time.' },
  { kulcs: 'foglalas.elvitel_szamol', csoport: 'foglalas', cimke: 'Amíg az elvitel napja számolódik', alap: 'Az elvitel napját számoljuk…', en: 'Working out the collection day…' },
  { kulcs: 'foglalas.erkezes', csoport: 'foglalas', cimke: 'Tájékoztató az időpont alatt', sor: true,
    alap: 'Kérjük, ha lehet, a választott időpont előtt *5–10 perccel* érkezz. Ha késel, kérjük, telefonálj: {telefon}\nA végleges ár az autó állapotától függően eltérhet, erősen szennyezett autón 50% felárat számíthatunk fel.', en: 'If possible, please arrive *5–10 minutes* before your chosen time. If you’re running late, please call us: {telefon}\nThe final price may vary depending on the condition of the car; for heavily soiled cars we may charge a 50% surcharge.' },

  { kulcs: 'foglalas.adatok', csoport: 'adatok', cimke: '8. lépés címe', alap: 'Az adataid', en: 'Your details' },
  { kulcs: 'foglalas.mezo.nev', csoport: 'adatok', cimke: 'Mező: név', alap: 'Név', en: 'Name' },
  { kulcs: 'foglalas.mezo.telefon', csoport: 'adatok', cimke: 'Mező: telefonszám', alap: 'Telefonszám', en: 'Phone number' },
  { kulcs: 'foglalas.mezo.email', csoport: 'adatok', cimke: 'Mező: e-mail', alap: 'E-mail', en: 'E-mail' },
  { kulcs: 'foglalas.minta.email', csoport: 'adatok', cimke: 'E-mail mező halvány szövege', alap: 'a visszaigazoláshoz', en: 'for the confirmation' },
  { kulcs: 'foglalas.mezo.rendszam', csoport: 'adatok', cimke: 'Mező: rendszám', alap: 'Rendszám', en: 'Licence plate' },
  { kulcs: 'foglalas.mezo.marka', csoport: 'adatok', cimke: 'Mező: márka', alap: 'Márka', en: 'Make' },
  { kulcs: 'foglalas.mezo.modell', csoport: 'adatok', cimke: 'Mező: modell', alap: 'Modell', en: 'Model' },
  { kulcs: 'foglalas.mezo.megjegyzes', csoport: 'adatok', cimke: 'Mező: megjegyzés', alap: 'Megjegyzés', en: 'Notes' },
  { kulcs: 'foglalas.minta.megjegyzes', csoport: 'adatok', cimke: 'Megjegyzés mező halvány szövege', alap: 'pl. kutyaszőr a hátsó ülésen', en: 'e.g. dog hair on the back seat' },
  { kulcs: 'foglalas.feltetel', csoport: 'adatok', cimke: 'Elfogadandó feltétel', sor: true,
    alap: 'Tudomásul veszem, hogy ez foglalási kérés: az időpont akkor végleges, amikor visszaigazoljuk. Ha megadom az e-mail címem, a visszaigazolásban kapok egy linket a foglalásom oldalára, ahol módosítást kérhetek, és az időpont előtt legalább {lemondas_ora} órával lemondhatom a foglalást. Ha ez a határidő már lejárt, telefonon tudom jelezni.', en: 'I understand that this is a booking request: the appointment becomes final when you confirm it. If I give my e-mail address, the confirmation will include a link to my booking page, where I can ask for changes and cancel at least {lemondas_ora} hours before the appointment. After that deadline I can let you know by phone.' },
  { kulcs: 'foglalas.adatvedelem', csoport: 'adatok', cimke: 'Adatvédelmi mondat (utána jön a link)', alap: 'A megadott adatokat a foglalás teljesítéséhez kezeljük. Részletek:', en: 'We process the details you provide in order to fulfil your booking. More information:' },
  { kulcs: 'foglalas.kezdes_cimke', csoport: 'adatok', cimke: 'Összegzés: kezdés', alap: 'kezdés', en: 'start' },
  { kulcs: 'foglalas.hozas_cimke', csoport: 'adatok', cimke: 'Összegzés: hozás', alap: 'hozás', en: 'drop-off' },
  { kulcs: 'foglalas.hatarido_cimke', csoport: 'adatok', cimke: 'Összegzés: határidő', alap: 'határidő', en: 'ready by' },
  { kulcs: 'foglalas.elvitel_cimke', csoport: 'adatok', cimke: 'Összegzés: elvitel', alap: 'elvitel', en: 'collection' },
  { kulcs: 'foglalas.egyeztetendo', csoport: 'adatok', cimke: 'Összegzés: egyeztetendő extrák', alap: 'Ára egyeztetés után:', en: 'Price to be agreed:' },
  { kulcs: 'foglalas.egyeztetendo_tetel', csoport: 'adatok', cimke: 'Összegzés: ár alatt', alap: '+ egyeztetendő tétel', en: '+ item priced on consultation' },
  { kulcs: 'foglalas.kuldes', csoport: 'adatok', cimke: 'Küldés gomb', alap: 'Foglalási kérés küldése', en: 'Send booking request' },
  { kulcs: 'foglalas.kuldes_folyamatban', csoport: 'adatok', cimke: 'Küldés gomb küldés közben', alap: 'Küldés…', en: 'Sending…' },
  { kulcs: 'foglalas.siker', csoport: 'adatok', cimke: 'Köszönő üzenet címe', alap: 'Köszönjük, megkaptuk a foglalási kérésed!', en: 'Thank you, we’ve received your booking request!' },
  { kulcs: 'foglalas.siker_elvitel', csoport: 'adatok', cimke: 'Köszönő üzenet: elvitel', alap: 'Elviheted: {mikor}.', valtozok: ['mikor'], en: 'You can collect it: {mikor}.' },
  { kulcs: 'foglalas.siker_email', csoport: 'adatok', cimke: 'Köszönő üzenet, ha adott meg e-mailt', sor: true, alap: 'Amint visszaigazoltuk, e-mailt küldünk róla, benne a foglalásod oldalának linkjével.', en: 'As soon as we’ve confirmed it, we’ll send you an e-mail with a link to your booking page.' },
  { kulcs: 'foglalas.siker_telefon', csoport: 'adatok', cimke: 'Köszönő üzenet e-mail nélkül', alap: 'Hamarosan visszaigazoljuk telefonon.', en: 'We’ll confirm it by phone shortly.' },
  { kulcs: 'foglalas.uj', csoport: 'adatok', cimke: 'Új foglalás gomb', alap: 'Új foglalás', en: 'New booking' },

  { kulcs: 'velemeny.cim', csoport: 'velemeny', cimke: 'Cím', alap: 'Rólunk mondták', en: 'What people say about us' },
  { kulcs: 'velemeny.felcim', csoport: 'velemeny', cimke: 'Felcím (a cím fölött)', alap: 'Google-értékelések', en: 'Google reviews' },
  { kulcs: 'velemeny.osszes', csoport: 'velemeny', cimke: 'Link az összes értékeléshez', alap: 'Összes értékelés a Google-on', en: 'All reviews on Google' },
  { kulcs: 'velemeny.elozo', csoport: 'velemeny', cimke: 'Előző gomb neve (képernyőolvasónak)', alap: 'Előző vélemények', en: 'Previous reviews' },
  { kulcs: 'velemeny.kovetkezo', csoport: 'velemeny', cimke: 'Következő gomb neve (képernyőolvasónak)', alap: 'Következő vélemények', en: 'Next reviews' },
  { kulcs: 'velemeny.csillag', csoport: 'velemeny', cimke: 'A csillagok felolvasva (képernyőolvasónak)', alap: '{n} csillag az 5-ből', valtozok: ['n'], en: '{n} out of 5 stars' },

  { kulcs: 'gyik.cim', csoport: 'gyik', cimke: 'Cím (a főoldalon, az aloldalon és a lábléc linkjében)', alap: 'Gyakran ismételt kérdések', en: 'Frequently asked questions' },
  { kulcs: 'gyik.bevezeto', csoport: 'gyik', cimke: 'Bevezető a főoldalon', sor: true, alap: 'Amit a legtöbben kérdeznek tőlünk a garázsban és telefonon.', en: 'What people ask us most often, in the garage and on the phone.' },
  { kulcs: 'gyik.tovabb', csoport: 'gyik', cimke: 'Gomb az aloldalra', alap: 'További kérdések', en: 'More questions' },
  { kulcs: 'gyik.oldal_bevezeto', csoport: 'gyik', cimke: 'Bevezető az aloldalon', sor: true, alap: 'Összegyűjtöttük, amit a legtöbben kérdeznek a mosásról, a belső takarításról és a foglalásról.', en: 'We’ve collected the questions we hear most about washing, interior cleaning and booking.' },
  { kulcs: 'gyik.leiras', csoport: 'gyik', cimke: 'Az aloldal leírása a keresőknek (Google-találat alatti szöveg)', sor: true, alap: 'Válaszok a leggyakoribb kérdésekre a kézi autómosásról, a belső takarításról és a foglalásról — {nev}, {kerulet}.', en: 'Answers to the most common questions about hand car washing, interior cleaning and booking — {nev}, {kerulet}.' },
  { kulcs: 'gyik.osszes', csoport: 'gyik', cimke: 'Szűrő: összes kérdés', alap: 'Összes', en: 'All' },
  { kulcs: 'gyik.kat.kulso', csoport: 'gyik', cimke: 'Kategória: külső', alap: 'Külső', en: 'Exterior' },
  { kulcs: 'gyik.kat.belso', csoport: 'gyik', cimke: 'Kategória: belső', alap: 'Belső', en: 'Interior' },
  { kulcs: 'gyik.kat.egyeb', csoport: 'gyik', cimke: 'Kategória: egyéb', alap: 'Egyéb', en: 'Other' },
  { kulcs: 'gyik.nem_talalod', csoport: 'gyik', cimke: 'Doboz az aloldal alján: cím', alap: 'Nem találtad a választ?', en: 'Didn’t find your answer?' },
  { kulcs: 'gyik.nem_talalod_szoveg', csoport: 'gyik', cimke: 'Doboz az aloldal alján: szöveg', sor: true, alap: 'Hívj minket a {telefon} számon, vagy írj az {email} címre.', en: 'Call us on {telefon}, or write to {email}.' },

  { kulcs: 'hely.cim', csoport: 'hely', cimke: 'Cím', alap: 'Hol vagyunk', en: 'Where we are' },
  { kulcs: 'hely.bevezeto', csoport: 'hely', cimke: 'Bevezető', sor: true, alap: 'A {haz} mélygarázsában, a −1. szinten. A bejárat a {bejarat} nyílik.', en: 'In the underground car park of {haz}, on level −1. The entrance is {bejarat}.' },
  { kulcs: 'hely.utvonal', csoport: 'hely', cimke: 'Útvonaltervező link', alap: 'Útvonaltervezés a Google Térképpel', en: 'Get directions with Google Maps' },
  { kulcs: 'hely.terkep_szoveg', csoport: 'hely', cimke: 'A térkép betöltése előtti tájékoztatás', sor: true,
    alap: 'A térképet a Google szolgáltatja. Betöltéskor a Google megkapja az IP-címedet, és sütiket helyezhet el a böngésződben.', en: 'The map is provided by Google. When it loads, Google receives your IP address and may place cookies in your browser.' },
  { kulcs: 'hely.terkep_gomb', csoport: 'hely', cimke: 'Térkép gomb', alap: 'Térkép betöltése', en: 'Load map' },

  { kulcs: 'cimke.cim', csoport: 'cimkek', cimke: 'Cím', alap: 'Cím', en: 'Address' },
  { kulcs: 'cimke.nyitvatartas', csoport: 'cimkek', cimke: 'Nyitvatartás', alap: 'Nyitvatartás', en: 'Opening hours' },
  { kulcs: 'cimke.leadas', csoport: 'cimkek', cimke: 'Leadás', alap: 'Leadás legkorábban', en: 'Drop-off from' },
  { kulcs: 'cimke.telefon', csoport: 'cimkek', cimke: 'Telefon', alap: 'Telefon', en: 'Phone' },
  { kulcs: 'cimke.kapcsolat', csoport: 'cimkek', cimke: 'Kapcsolat', alap: 'Kapcsolat', en: 'Contact' },

  { kulcs: 'lab.leiras', csoport: 'lab', cimke: 'Rövid leírás a név alatt', sor: true, alap: 'Kézi autókozmetika a Váci úti {haz} mélygarázsában.', en: 'Hand car detailing in the underground car park of {haz} on Váci út.' },
  { kulcs: 'lab.leadas', csoport: 'lab', cimke: 'Leadás sor a nyitvatartás alatt', alap: 'Leadás legkorábban {leadas}', en: 'Drop-off from {leadas}' },

  { kulcs: 'oldal.cim', csoport: 'oldal', cimke: 'Az oldal címe a böngészőfülön és a keresőben', alap: '{nev} — kézi autókozmetika, {irsz}, {cim}', en: '{nev} — hand car detailing, {irsz}, {cim}' },

  { kulcs: 'ugyfel.cim', csoport: 'ugyfel', cimke: 'Az oldal neve (fejléc és böngészőfül)', alap: 'Foglalásom', en: 'My booking' },
  { kulcs: 'ugyfel.keres.cim', csoport: 'ugyfel', cimke: 'Jóváhagyásra vár: cím', alap: 'Megkaptuk a foglalási kérésedet', en: 'We’ve received your booking request' },
  { kulcs: 'ugyfel.keres.szoveg', csoport: 'ugyfel', cimke: 'Jóváhagyásra vár: szöveg', sor: true, alap: 'Hamarosan visszaigazoljuk. Addig is itt követheted, hol tart.', en: 'We’ll confirm it shortly. In the meantime you can follow it here.' },
  { kulcs: 'ugyfel.visszaigazolva.cim', csoport: 'ugyfel', cimke: 'Visszaigazolva: cím', alap: 'Visszaigazolt foglalás', en: 'Your booking is confirmed' },
  { kulcs: 'ugyfel.visszaigazolva.szoveg', csoport: 'ugyfel', cimke: 'Visszaigazolva: szöveg', sor: true, alap: 'Várunk szeretettel a megbeszélt időpontban.', en: 'We look forward to seeing you at the agreed time.' },
  { kulcs: 'ugyfel.kesz.cim', csoport: 'ugyfel', cimke: 'Elkészült: cím', alap: 'Elkészült az autód', en: 'Your car is ready' },
  { kulcs: 'ugyfel.kesz.szoveg', csoport: 'ugyfel', cimke: 'Elkészült: szöveg', sor: true, alap: 'Már átveheted, legkésőbb: *{mikor}*.', valtozok: ['mikor'], en: 'You can collect it now, by *{mikor}* at the latest.' },
  { kulcs: 'ugyfel.atveve.cim', csoport: 'ugyfel', cimke: 'Átvéve: cím', alap: 'Köszönjük, hogy minket választottál!', en: 'Thank you for choosing us!' },
  { kulcs: 'ugyfel.atveve.szoveg', csoport: 'ugyfel', cimke: 'Átvéve: szöveg', sor: true, alap: 'Reméljük, örömöd leled a tiszta autóban. Várunk vissza szeretettel, legközelebb is mi gondoskodunk róla.', en: 'We hope you enjoy your clean car. We look forward to seeing you again, next time we’ll take care of it too.' },
  { kulcs: 'ugyfel.nem_fert.cim', csoport: 'ugyfel', cimke: 'Nem fért be: cím', alap: 'Ezúttal nem fért bele az időbe', en: 'We couldn’t fit it in this time' },
  { kulcs: 'ugyfel.nem_fert.szoveg', csoport: 'ugyfel', cimke: 'Nem fért be: szöveg', sor: true, alap: 'Sajnáljuk, hogy most nem tudtuk elvégezni a munkát. Foglalj új időpontot, vagy hívj minket: {telefon}.', en: 'We’re sorry we couldn’t do the job this time. Book a new appointment, or call us: {telefon}.' },
  { kulcs: 'ugyfel.lemondva.cim', csoport: 'ugyfel', cimke: 'Lemondva: cím', alap: 'A foglalás lemondva', en: 'Your booking is cancelled' },
  { kulcs: 'ugyfel.lemondva.szoveg', csoport: 'ugyfel', cimke: 'Lemondva: szöveg', sor: true, alap: 'Ha mégis jönnél, foglalj új időpontot, szívesen látunk.', en: 'If you’d still like to come, book a new appointment, we’ll be glad to see you.' },
  { kulcs: 'ugyfel.elutasitva.cim', csoport: 'ugyfel', cimke: 'Elutasítva: cím', alap: 'Erre az időpontra nem tudtunk helyet adni', en: 'We couldn’t offer you this time' },
  { kulcs: 'ugyfel.elutasitva.szoveg', csoport: 'ugyfel', cimke: 'Elutasítva: szöveg', sor: true, alap: 'Sajnáljuk. Válassz másik időpontot, vagy hívj minket: {telefon}.', en: 'We’re sorry. Please choose another time, or call us: {telefon}.' },
  { kulcs: 'ugyfel.nem_jott.cim', csoport: 'ugyfel', cimke: 'Nem jött el: cím', alap: 'A foglalt időpont elmúlt', en: 'The appointment has passed' },
  { kulcs: 'ugyfel.nem_jott.szoveg', csoport: 'ugyfel', cimke: 'Nem jött el: szöveg', sor: true, alap: 'Most nem tudtál jönni. Ha szeretnéd, foglalj új időpontot.', en: 'You couldn’t make it this time. Book a new appointment whenever you like.' },
  { kulcs: 'ugyfel.lejart.cim', csoport: 'ugyfel', cimke: 'Lejárt link: cím', alap: 'Ez a link már nem érvényes', en: 'This link is no longer valid' },
  { kulcs: 'ugyfel.lejart.szoveg', csoport: 'ugyfel', cimke: 'Lejárt link: szöveg', sor: true, alap: 'A foglalás oldala az átvétel után 10 napig érhető el. Foglalj új időpontot, vagy hívj minket: {telefon}.', en: 'The booking page is available for 10 days after collection. Book a new appointment, or call us: {telefon}.' },
  { kulcs: 'ugyfel.ismeretlen.cim', csoport: 'ugyfel', cimke: 'Ismeretlen link: cím', alap: 'Ezt a foglalást nem találjuk', en: 'We can’t find this booking' },
  { kulcs: 'ugyfel.ismeretlen.szoveg', csoport: 'ugyfel', cimke: 'Ismeretlen link: szöveg', sor: true, alap: 'Ellenőrizd, hogy a teljes linket nyitottad-e meg, vagy hívj minket: {telefon}.', en: 'Please check that you opened the full link, or call us: {telefon}.' },
  { kulcs: 'ugyfel.lepes.keres', csoport: 'ugyfel', cimke: 'Lépés: kérés', alap: 'Kérés', en: 'Request' },
  { kulcs: 'ugyfel.lepes.visszaigazolva', csoport: 'ugyfel', cimke: 'Lépés: visszaigazolva', alap: 'Visszaigazolva', en: 'Confirmed' },
  { kulcs: 'ugyfel.lepes.kesz', csoport: 'ugyfel', cimke: 'Lépés: kész', alap: 'Kész', en: 'Ready' },
  { kulcs: 'ugyfel.lepes.atveve', csoport: 'ugyfel', cimke: 'Lépés: átvéve', alap: 'Átvéve', en: 'Collected' },
  { kulcs: 'ugyfel.kesz.doboz', csoport: 'ugyfel', cimke: 'Elkészült doboz címe', alap: 'Átvehető', en: 'Ready for collection' },
  { kulcs: 'ugyfel.kesz.legkesobb', csoport: 'ugyfel', cimke: 'Elkészült doboz: határidő felirata', alap: 'Legkésőbb', en: 'At the latest' },
  { kulcs: 'ugyfel.felar', csoport: 'ugyfel', cimke: 'A felár oka (a végösszeg alatt)', alap: 'A felár oka: {mit}', valtozok: ['mit'], en: 'Why it costs more: {mit}' },
  { kulcs: 'ugyfel.kimaradt', csoport: 'ugyfel', cimke: 'Kimaradt munka (a végösszeg alatt)', alap: 'Kimaradt: {mit}, ezért kevesebb az ár.', valtozok: ['mit'], en: 'Left out: {mit}, so the price is lower.' },
  { kulcs: 'ugyfel.adatok', csoport: 'ugyfel', cimke: 'Az adatok címe', alap: 'A foglalásod', en: 'Your booking' },
  { kulcs: 'ugyfel.modositva', csoport: 'ugyfel', cimke: 'Módosított sor jelölése', alap: 'módosítva', en: 'changed' },
  { kulcs: 'ugyfel.modositva_magyarazat', csoport: 'ugyfel', cimke: 'Magyarázat, ha volt módosítás', alap: 'Az áthúzott, halvány érték az eredeti foglalás, mellette a mostani.', en: 'The faded, struck-through value is the original booking; next to it is the current one.' },
  { kulcs: 'ugyfel.sor.nap', csoport: 'ugyfel', cimke: 'Sor: nap', alap: 'Nap', en: 'Day' },
  { kulcs: 'ugyfel.sor.kezdes', csoport: 'ugyfel', cimke: 'Sor: kezdés (megvárja)', alap: 'Kezdés', en: 'Start' },
  { kulcs: 'ugyfel.sor.hozas', csoport: 'ugyfel', cimke: 'Sor: hozás (itt hagyja)', alap: 'Hozod', en: 'Drop-off' },
  { kulcs: 'ugyfel.sor.erte', csoport: 'ugyfel', cimke: 'Sor: érte megyünk (hozom-viszem)', alap: 'Érte megyünk', en: 'We collect it' },
  { kulcs: 'ugyfel.sor.kesz', csoport: 'ugyfel', cimke: 'Sor: várható vége (megvárja)', alap: 'Várhatóan kész', en: 'Expected to be ready' },
  { kulcs: 'ugyfel.sor.elvitel', csoport: 'ugyfel', cimke: 'Sor: elvitel (itt hagyja)', alap: 'Elviheted', en: 'Collection' },
  { kulcs: 'ugyfel.sor.vissza', csoport: 'ugyfel', cimke: 'Sor: visszaszállítás (hozom-viszem)', alap: 'Visszavisszük', en: 'We bring it back' },
  { kulcs: 'ugyfel.sor.zarasig', csoport: 'ugyfel', cimke: 'Ha nincs megbeszélt elviteli idő', alap: 'aznap, zárásig', en: 'the same day, by closing time' },
  { kulcs: 'ugyfel.sor.auto', csoport: 'ugyfel', cimke: 'Sor: autó', alap: 'Autó', en: 'Car' },
  { kulcs: 'ugyfel.sor.szolgaltatas', csoport: 'ugyfel', cimke: 'Sor: szolgáltatás', alap: 'Szolgáltatás', en: 'Service' },
  { kulcs: 'ugyfel.sor.extrak', csoport: 'ugyfel', cimke: 'Sor: extrák', alap: 'Extrák', en: 'Extras' },
  { kulcs: 'ugyfel.sor.ar', csoport: 'ugyfel', cimke: 'Sor: becsült ár', alap: 'Becsült ár', en: 'Estimated price' },
  { kulcs: 'ugyfel.berletbol', csoport: 'ugyfel', cimke: 'Bérletesnél az ár mellett', alap: 'a csomag a bérletedből megy', en: 'the package is covered by your pass' },
  { kulcs: 'ugyfel.sor.vegosszeg', csoport: 'ugyfel', cimke: 'Végösszeg felirata', alap: 'Végösszeg', en: 'Total' },
  { kulcs: 'ugyfel.modositas.cim', csoport: 'ugyfel', cimke: 'Módosítás: cím', alap: 'Valamin változtatnál?', en: 'Need to change something?' },
  { kulcs: 'ugyfel.modositas.szoveg', csoport: 'ugyfel', cimke: 'Módosítás: magyarázat', sor: true, alap: 'Ha csak apróság, például egy órával korábban hoznád az autót, írd meg itt, és nem kell telefonálnod. Ha sürgős, hívj minket: {telefon}.', en: 'If it’s only something small, for example you’d bring the car an hour earlier, write it here and there’s no need to call. If it’s urgent, call us: {telefon}.' },
  { kulcs: 'ugyfel.modositas.minta', csoport: 'ugyfel', cimke: 'Módosítás: halvány minta a mezőben', alap: 'pl. 8:00 helyett inkább 7:00 körül hoznám', en: 'e.g. I’d rather bring it around 7:00 instead of 8:00' },
  { kulcs: 'ugyfel.modositas.gomb', csoport: 'ugyfel', cimke: 'Módosítás: küldés gomb', alap: 'Módosítás kérése', en: 'Request the change' },
  { kulcs: 'ugyfel.modositas.kuldes', csoport: 'ugyfel', cimke: 'Módosítás: küldés közben', alap: 'Küldés…', en: 'Sending…' },
  { kulcs: 'ugyfel.modositas.uzenetek', csoport: 'ugyfel', cimke: 'Módosítás: elküldött üzenetek címe', alap: 'Az üzeneteid', en: 'Your messages' },
  { kulcs: 'ugyfel.modositas.elkuldve', csoport: 'ugyfel', cimke: 'Módosítás: még nincs elintézve', alap: 'Elküldve, hamarosan intézzük.', en: 'Sent, we’ll handle it shortly.' },
  { kulcs: 'ugyfel.modositas.elintezve', csoport: 'ugyfel', cimke: 'Módosítás: elintézve', alap: 'Elintéztük.', en: 'Done.' },
  { kulcs: 'ugyfel.lemondas.cim', csoport: 'ugyfel', cimke: 'Lemondás: cím', alap: 'Mégsem jó az időpont?', en: 'Can’t make it?' },
  { kulcs: 'ugyfel.lemondas.szoveg', csoport: 'ugyfel', cimke: 'Lemondás: szöveg', sor: true, alap: 'Lemondási határidő: {hatarido}. Addig itt lemondhatod, utána már csak telefonon: {telefon}.', valtozok: ['hatarido'], en: 'Cancellation deadline: {hatarido}. Until then you can cancel here; after that only by phone: {telefon}.' },
  { kulcs: 'ugyfel.lemondas.gomb', csoport: 'ugyfel', cimke: 'Lemondás gomb', alap: 'Foglalás lemondása', en: 'Cancel the booking' },
  { kulcs: 'ugyfel.lemondas.kerdes', csoport: 'ugyfel', cimke: 'Lemondás: megerősítő kérdés', alap: 'Biztosan lemondod a foglalást?', en: 'Are you sure you want to cancel the booking?' },
  { kulcs: 'ugyfel.lemondas.igen', csoport: 'ugyfel', cimke: 'Lemondás: igen gomb', alap: 'Igen, lemondom', en: 'Yes, cancel it' },
  { kulcs: 'ugyfel.lemondas.nem', csoport: 'ugyfel', cimke: 'Lemondás: mégse gomb', alap: 'Mégsem', en: 'Keep it' },
  { kulcs: 'ugyfel.ertekeles.cim', csoport: 'ugyfel', cimke: 'Értékelés: cím', alap: 'Mesélj másoknak is!', en: 'Tell others about us!' },
  { kulcs: 'ugyfel.ertekeles.szoveg', csoport: 'ugyfel', cimke: 'Értékelés: szöveg', sor: true, alap: 'Ha elégedett voltál, sokat segítesz egy rövid Google-értékeléssel.', en: 'If you were happy with us, a short Google review helps us a lot.' },
  { kulcs: 'ugyfel.ertekeles.gomb', csoport: 'ugyfel', cimke: 'Értékelés gomb', alap: 'Értékelés írása', en: 'Write a review' },
  { kulcs: 'ugyfel.fooldal', csoport: 'ugyfel', cimke: 'Gomb: vissza a főoldalra', alap: 'Vissza a főoldalra', en: 'Back to the home page' },
  { kulcs: 'ugyfel.uj', csoport: 'ugyfel', cimke: 'Gomb: új időpont', alap: 'Új időpont foglalása', en: 'Book a new appointment' },
  { kulcs: 'ugyfel.kapcsolat', csoport: 'ugyfel', cimke: 'Elérhetőség címe', alap: 'Elérhetőség', en: 'Contact' },
] as const satisfies readonly SzovegDef[]

export type SzovegKulcs = (typeof SZOVEGEK)[number]['kulcs']

const SZOVEG_ALAP = Object.fromEntries(SZOVEGEK.map((s) => [s.kulcs, s.alap])) as Record<SzovegKulcs, string>

const SZOVEG_ALAP_EN = Object.fromEntries(SZOVEGEK.map((s) => [s.kulcs, s.en])) as Record<SzovegKulcs, string>

export const szovegAlap = (nyelv: Nyelv) => (nyelv === 'en' ? SZOVEG_ALAP_EN : SZOVEG_ALAP)

export const KOZOS_VALTOZOK: { nev: string; leiras: string }[] = [
  { nev: 'nev', leiras: 'megjelenő név' },
  { nev: 'telefon', leiras: 'telefonszám' },
  { nev: 'email', leiras: 'e-mail cím' },
  { nev: 'irsz', leiras: 'irányítószám és város' },
  { nev: 'cim', leiras: 'utca, házszám' },
  { nev: 'haz', leiras: 'épület' },
  { nev: 'szint', leiras: 'szint' },
  { nev: 'bejarat', leiras: 'bejárat' },
  { nev: 'kerulet', leiras: 'kerület' },
  { nev: 'nyitvatartas', leiras: 'teljes nyitvatartás' },
  { nev: 'nyitas', leiras: 'nyitás' },
  { nev: 'zaras', leiras: 'zárás' },
  { nev: 'leadas', leiras: 'legkorábbi leadás' },
  { nev: 'lemondas_ora', leiras: 'online lemondás határideje órában' },
]

export type Valtozok = Record<string, string | number>

export function kitolt(sablon: string, v: Valtozok): string {
  return sablon.replace(/\{([a-z_]+)\}/g, (egesz, nev: string) => (nev in v ? String(v[nev]) : egesz))
}

export function uzletValtozok(u: Uzlet, lemondasOra?: number): Valtozok {
  return {
    nev: u.nev, telefon: u.telefon, email: u.email, irsz: u.irsz, cim: u.cim, haz: u.haz, szint: u.szint,
    bejarat: u.bejarat, kerulet: u.kerulet, nyitvatartas: u.nyitvatartas, nyitas: u.nyitas, zaras: u.zaras,
    leadas: u.leadas, ...(lemondasOra != null ? { lemondas_ora: lemondasOra } : {}),
  }
}

const KAT_KOD: Record<VehicleCategory, 'szemelyauto' | 'suv' | 'kisbusz'> = { SZEMELYAUTO: 'szemelyauto', SUV: 'suv', KISBUSZ: 'kisbusz' }

export const katKulcs = {
  alcim: (k: VehicleCategory) => `csomagok.alcim.${KAT_KOD[k]}` as const,
  tabla: (k: VehicleCategory) => `csomagok.kat.${KAT_KOD[k]}` as const,
  foglalas: (k: VehicleCategory) => `foglalas.kat.${KAT_KOD[k]}` as const,
}

const ULES_KOD: Record<SeatMaterial, 'karpit' | 'bor' | 'karpit_bor'> = { KARPIT: 'karpit', BOR: 'bor', KARPIT_BOR: 'karpit_bor' }
export const ulesKulcs = (u: SeatMaterial) => `foglalas.ules.${ULES_KOD[u]}` as const

const TERJ_KOD: Record<BookingScope, 'teljes' | 'kulso' | 'belso'> = { TELJES: 'teljes', KULSO: 'kulso', BELSO: 'belso' }
export const terjedelemKulcs = (s: BookingScope) => `foglalas.terjedelem.${TERJ_KOD[s]}` as const
