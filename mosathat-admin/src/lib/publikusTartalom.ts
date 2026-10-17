import { UZLET } from './arculat'
import { ADATFELDOLGOZOK, CEG, JOGI_HATALY, TERVEZET, type Kamera } from './ceg'
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
}

export type AdatMezo = keyof PublikusAdatokNyers

export interface NyitvaNap {
  weekday: number
  closed: boolean
  opens: string | null
  closes: string | null
}

export interface PublikusTartalomNyers {
  adatok: PublikusAdatokNyers
  szovegek: Record<string, string>
  kamerak: Kamera[]
  nyitvatartas: NyitvaNap[]
  leadas: string | null
}

export interface PublikusMentes {
  adatok?: PublikusAdatokNyers
  szovegek?: Record<string, string | null>
  kamerak?: Kamera[]
}

export const URES_TARTALOM: PublikusTartalomNyers = { adatok: {}, szovegek: {}, kamerak: [], nyitvatartas: [], leadas: null }

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

export const CEG_ALAP: Record<'ceg_nev' | 'ceg_rovid_nev' | 'ceg_szekhely' | 'ceg_cegjegyzekszam' | 'ceg_cegbirosag' | 'ceg_adoszam' | 'jogi_hataly', string> = {
  ceg_nev: CEG.nev,
  ceg_rovid_nev: CEG.rovidNev,
  ceg_szekhely: CEG.szekhely,
  ceg_cegjegyzekszam: CEG.cegjegyzekszam,
  ceg_cegbirosag: CEG.cegbirosag,
  ceg_adoszam: CEG.adoszam,
  jogi_hataly: JOGI_HATALY,
}

const NAP_NEV = ['', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']
const NAP_ROVID = ['', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V']

export function ora(hhmm: string | null | undefined): string {
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

export function nyitvaSzakaszok(napok: NyitvaNap[]): NyitvaSzakasz[] {
  return szakaszok(napok).map((s) => ({
    napok: s.tol === s.ig ? NAP_NEV[s.tol] : `${NAP_NEV[s.tol]}–${NAP_NEV[s.ig]}`,
    napokRovid: s.tol === s.ig ? NAP_ROVID[s.tol] : `${NAP_ROVID[s.tol]}–${NAP_ROVID[s.ig]}`,
    nyitas: s.nyitas,
    zaras: s.zaras,
    hossz: s.ig - s.tol + 1,
  }))
}

const ertek = (v: string | null | undefined, alap: string) => (v && v.trim() ? v.trim() : alap)

export function uzletbol(t: PublikusTartalomNyers): Uzlet {
  const a = t.adatok
  const szakaszok = nyitvaSzakaszok(t.nyitvatartas)
  const fo = [...szakaszok].sort((x, y) => y.hossz - x.hossz)[0]
  return {
    nev: ertek(a.nev, ELERHETOSEG_ALAP.nev),
    telefon: ertek(a.telefon, ELERHETOSEG_ALAP.telefon),
    email: ertek(a.email, ELERHETOSEG_ALAP.email),
    irsz: ertek(a.irsz, ELERHETOSEG_ALAP.irsz),
    cim: ertek(a.cim, ELERHETOSEG_ALAP.cim),
    haz: ertek(a.haz, ELERHETOSEG_ALAP.haz),
    szint: ertek(a.szint, ELERHETOSEG_ALAP.szint),
    bejarat: ertek(a.bejarat, ELERHETOSEG_ALAP.bejarat),
    kerulet: ertek(a.kerulet, ELERHETOSEG_ALAP.kerulet),
    napok: fo?.napok ?? UZLET.napok,
    napokRovid: fo?.napokRovid ?? UZLET.napokRovid,
    nyitas: fo?.nyitas ?? UZLET.nyitas,
    zaras: fo?.zaras ?? UZLET.zaras,
    nyitvatartas: szakaszok.length > 0
      ? szakaszok.map((s) => `${s.napok} ${s.nyitas}–${s.zaras}`).join(', ')
      : `${UZLET.napok} ${UZLET.nyitas}–${UZLET.zaras}`,
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

export function jogibol(t: PublikusTartalomNyers, u: Uzlet): JogiAdatok {
  const a = t.adatok
  const konyvelo = a.konyvelo_nev?.trim()
  return {
    hataly: ertek(a.jogi_hataly, CEG_ALAP.jogi_hataly),
    tervezet: a.jogi_tervezet ?? TERVEZET,
    adatfeldolgozok: ADATFELDOLGOZOK.map((x) => {
      if (x.nev.startsWith('Könyvelő') && konyvelo) {
        return { nev: konyvelo, cim: a.konyvelo_cim?.trim() ?? '', feladat: x.feladat }
      }
      if (x.feladat.includes('e-mail fiók')) return { ...x, feladat: `az ${u.email} e-mail fiók tárhelye` }
      return x
    }),
    kamera: { megorzes: a.kamera_megorzes?.trim() || null, kamerak: t.kamerak },
  }
}

export interface SzovegDef {
  kulcs: string
  csoport: SzovegCsoport
  cimke: string
  alap: string
  sor?: boolean
  valtozok?: string[]
}

export type SzovegCsoport = 'menu' | 'hero' | 'csomagok' | 'foglalas' | 'adatok' | 'hely' | 'lab' | 'cimkek' | 'oldal'

export const CSOPORT_NEV: Record<SzovegCsoport, string> = {
  menu: 'Menü és gombok',
  hero: 'Nyitó rész',
  csomagok: 'Csomagok táblázat',
  foglalas: 'Időpontfoglalás',
  adatok: 'Időpontfoglalás: adatok és beküldés',
  hely: 'Hol vagyunk',
  lab: 'Lábléc',
  cimkek: 'Adatcímkék (Hol vagyunk, lábléc)',
  oldal: 'Böngésző',
}

export const SZOVEGEK = [
  { kulcs: 'menu.csomagok', csoport: 'menu', cimke: 'Menü: csomagok', alap: 'Csomagok' },
  { kulcs: 'menu.foglalas', csoport: 'menu', cimke: 'Menü: foglalás', alap: 'Foglalás' },
  { kulcs: 'menu.kapcsolat', csoport: 'menu', cimke: 'Menü: kapcsolat', alap: 'Kapcsolat' },
  { kulcs: 'gomb.idopont', csoport: 'menu', cimke: 'Időpontkérő gomb és link', alap: 'Időpontot kérek' },

  { kulcs: 'hero.felcim', csoport: 'hero', cimke: 'Felcím (a nagy cím fölött)', alap: 'Kézi autókozmetika — {kerulet}' },
  { kulcs: 'hero.cim', csoport: 'hero', cimke: 'Nagy cím', alap: 'Az autó nem tárgy.\n*Évekig* veled van.', sor: true },
  { kulcs: 'hero.bevezeto', csoport: 'hero', cimke: 'Bevezető (bal hasáb)', sor: true,
    alap: 'Kézi mosás és kézi takarítás a Váci úti {haz} mélygarázsában. Bogároldótól a hosszantartó vaxig, három csomagban — és pontosan leírva, melyik mit tud.' },
  { kulcs: 'hero.mellek', csoport: 'hero', cimke: 'Kiegészítő szöveg (jobb hasáb)', sor: true,
    alap: 'Hétfőtől péntekig {nyitas}–{zaras}, de autót már reggel {leadas} után le lehet adni. A bejárat a {bejarat} nyílik, a mélygarázs −1. szintjén.' },
  { kulcs: 'hero.borito_alt', csoport: 'hero', cimke: 'Borítókép leírása (képernyőolvasónak)', alap: '{nev} — kézi autókozmetika a {haz} mélygarázsában' },
  { kulcs: 'hero.borito_helye', csoport: 'hero', cimke: 'Felirat, amíg nincs borítókép', alap: 'Fotó helye — garázs, munka közben' },

  { kulcs: 'csomagok.cim', csoport: 'csomagok', cimke: 'Cím', alap: 'Csomagok' },
  { kulcs: 'csomagok.alcim.szemelyauto', csoport: 'csomagok', cimke: 'Alcím: személyautónál', alap: 'Személygépjármű — sedan, kombi, ferdehátú' },
  { kulcs: 'csomagok.alcim.suv', csoport: 'csomagok', cimke: 'Alcím: SUV-nál', alap: 'SUV, egyterű' },
  { kulcs: 'csomagok.alcim.kisbusz', csoport: 'csomagok', cimke: 'Alcím: kisbusznál', alap: 'Kisbusz, furgon' },
  { kulcs: 'csomagok.kategoria', csoport: 'csomagok', cimke: 'A kategóriaválasztó címe', alap: 'Járműkategória' },
  { kulcs: 'csomagok.kat.szemelyauto', csoport: 'csomagok', cimke: 'Kategória gomb: személyautó', alap: 'Személygépjármű' },
  { kulcs: 'csomagok.kat.suv', csoport: 'csomagok', cimke: 'Kategória gomb: SUV', alap: 'SUV, Egyterű' },
  { kulcs: 'csomagok.kat.kisbusz', csoport: 'csomagok', cimke: 'Kategória gomb: kisbusz', alap: 'Kisbusz, Furgon' },
  { kulcs: 'csomagok.csoport.kulso', csoport: 'csomagok', cimke: 'Sorcsoport: külső munkák', alap: 'Mosás' },
  { kulcs: 'csomagok.csoport.belso', csoport: 'csomagok', cimke: 'Sorcsoport: belső munkák', alap: 'Takarítás' },

  { kulcs: 'foglalas.cim', csoport: 'foglalas', cimke: 'Cím', alap: 'Időpontfoglalás' },
  { kulcs: 'foglalas.bevezeto', csoport: 'foglalas', cimke: 'Bevezető', sor: true,
    alap: 'Válaszd ki, mit szeretnél, és mutatjuk a szabad időpontokat. A kérésedet munkatársunk igazolja vissza.' },
  { kulcs: 'foglalas.auto', csoport: 'foglalas', cimke: '1. lépés címe', alap: 'Milyen autóval jössz?' },
  { kulcs: 'foglalas.kat.szemelyauto', csoport: 'foglalas', cimke: 'Autó: személyautó', alap: 'Személyautó' },
  { kulcs: 'foglalas.kat.suv', csoport: 'foglalas', cimke: 'Autó: SUV', alap: 'SUV / Egyterű' },
  { kulcs: 'foglalas.kat.kisbusz', csoport: 'foglalas', cimke: 'Autó: kisbusz', alap: 'Kisbusz / Furgon' },
  { kulcs: 'foglalas.csomag', csoport: 'foglalas', cimke: '2. lépés címe', alap: 'Csomag' },
  { kulcs: 'foglalas.arajanlat', csoport: 'foglalas', cimke: 'Ha nincs fix ár', alap: 'árajánlat alapján' },
  { kulcs: 'foglalas.fs', csoport: 'foglalas', cimke: 'Full Service neve', alap: 'Full Service' },
  { kulcs: 'foglalas.fs_leiras', csoport: 'foglalas', cimke: 'Full Service leírása', sor: true,
    alap: 'A csomag mellé az ülések mélytisztítása: kárpitnál vizes kárpittisztítás, bőrnél bőrtisztítás és ápolás. A vizes kárpit aznap is elvihető, de ajánlott egy éjszakára nálunk hagyni, hogy megszáradjon.' },
  { kulcs: 'foglalas.fs_csomaggal', csoport: 'foglalas', cimke: 'Full Service ár alatt', alap: '{csomag} csomaggal együtt', valtozok: ['csomag'] },
  { kulcs: 'foglalas.ules', csoport: 'foglalas', cimke: 'Ülés kérdése', alap: 'Milyen az ülés?' },
  { kulcs: 'foglalas.ules.karpit', csoport: 'foglalas', cimke: 'Ülés: kárpit', alap: 'Kárpit' },
  { kulcs: 'foglalas.ules.bor', csoport: 'foglalas', cimke: 'Ülés: bőr', alap: 'Bőr' },
  { kulcs: 'foglalas.ules.karpit_bor', csoport: 'foglalas', cimke: 'Ülés: kárpit-bőr', alap: 'Kárpit-bőr' },
  { kulcs: 'foglalas.mit', csoport: 'foglalas', cimke: '3. lépés címe', alap: 'Mit csináljunk?' },
  { kulcs: 'foglalas.terjedelem.teljes', csoport: 'foglalas', cimke: 'Terjedelem: teljes', alap: 'Teljes' },
  { kulcs: 'foglalas.terjedelem.kulso', csoport: 'foglalas', cimke: 'Terjedelem: csak kívül', alap: 'Csak kívül' },
  { kulcs: 'foglalas.terjedelem.belso', csoport: 'foglalas', cimke: 'Terjedelem: csak belül', alap: 'Csak belül' },
  { kulcs: 'foglalas.telefonon', csoport: 'foglalas', cimke: 'Ha csak telefonon kérhető', alap: 'telefonon' },
  { kulcs: 'foglalas.fs_teljes', csoport: 'foglalas', cimke: 'Full Service-nél (3. lépés)', alap: 'Full Service-nél a teljes csomag jár, kívül és belül.' },
  { kulcs: 'foglalas.extrak', csoport: 'foglalas', cimke: '4. lépés címe', alap: 'Kérsz még valamit?' },
  { kulcs: 'foglalas.nem_kotelezo', csoport: 'foglalas', cimke: '4. lépés kiegészítése', alap: 'nem kötelező' },
  { kulcs: 'foglalas.extrak_benne', csoport: 'foglalas', cimke: 'Megjegyzés az extrákhoz', alap: 'Ami a {csomag} csomagban már benne van, azt itt nem kínáljuk külön.', valtozok: ['csomag'] },
  { kulcs: 'foglalas.ar_egyeztetes', csoport: 'foglalas', cimke: 'Extra egyeztetendő árral', alap: 'ár egyeztetés után' },
  { kulcs: 'foglalas.var_vagy_hagy', csoport: 'foglalas', cimke: '5. lépés címe', alap: 'Megvárod, vagy itt hagyod?' },
  { kulcs: 'foglalas.varom', csoport: 'foglalas', cimke: 'Megvárom', alap: 'Megvárom' },
  { kulcs: 'foglalas.varom_leiras', csoport: 'foglalas', cimke: 'Megvárom: leírás', alap: 'Pontos kezdési időpontot választasz, és amíg kész, nálunk várhatsz.' },
  { kulcs: 'foglalas.hagyom', csoport: 'foglalas', cimke: 'Itt hagyom', alap: 'Itt hagyom' },
  { kulcs: 'foglalas.hagyom_leiras', csoport: 'foglalas', cimke: 'Itt hagyom: leírás', alap: 'Behozod amikor tudod, kész vagyunk mire viszed.' },
  { kulcs: 'foglalas.elvitel', csoport: 'foglalas', cimke: '5. lépés címe Full Service-nél', alap: 'Mikor viszed el?' },
  { kulcs: 'foglalas.elvitel_fs', csoport: 'foglalas', cimke: '5. lépés magyarázata Full Service-nél', alap: 'Full Service-nél az autót nálunk hagyod.' },
  { kulcs: 'foglalas.aznap', csoport: 'foglalas', cimke: 'Aznap', alap: 'Aznap' },
  { kulcs: 'foglalas.aznap_vizes', csoport: 'foglalas', cimke: 'Aznap: kárpitos ülésnél', alap: 'Amint elkészül, vizesen elviheted.' },
  { kulcs: 'foglalas.aznap_bor', csoport: 'foglalas', cimke: 'Aznap: bőr ülésnél', alap: 'Amint elkészül, elviheted.' },
  { kulcs: 'foglalas.masnap', csoport: 'foglalas', cimke: 'Másnap', alap: 'Másnap' },
  { kulcs: 'foglalas.masnap_szarad', csoport: 'foglalas', cimke: 'Másnap: ajánlás kárpitos ülésnél', alap: 'Ajánlott: egy éjszakát nálunk szárad.' },
  { kulcs: 'foglalas.masnap_leiras', csoport: 'foglalas', cimke: 'Másnap: leírás', alap: 'Másnap reggel 8-tól zárásig bármikor elviheted.' },
  { kulcs: 'foglalas.nap', csoport: 'foglalas', cimke: '6. lépés címe', alap: 'Melyik nap?' },
  { kulcs: 'foglalas.nincs_munkaido', csoport: 'foglalas', cimke: 'Ha nincs munkaidő megadva', sor: true,
    alap: 'Ehhez a választáshoz nincs megadva munkaidő, ezért nem tudunk szabad időpontot számolni. Kérjük, hívj minket.' },
  { kulcs: 'foglalas.allapot.szabad', csoport: 'foglalas', cimke: 'Nap állapota: szabad', alap: 'Szabad' },
  { kulcs: 'foglalas.allapot.keves', csoport: 'foglalas', cimke: 'Nap állapota: kevés hely', alap: 'Kevés hely' },
  { kulcs: 'foglalas.allapot.tele', csoport: 'foglalas', cimke: 'Nap állapota: tele', alap: 'Tele' },
  { kulcs: 'foglalas.allapot.zarva', csoport: 'foglalas', cimke: 'Nap állapota: zárva', alap: 'Zárva' },
  { kulcs: 'foglalas.kezdes', csoport: 'foglalas', cimke: '7. lépés címe, ha megvárja', alap: 'Mikor kezdjük?' },
  { kulcs: 'foglalas.hozas', csoport: 'foglalas', cimke: '7. lépés címe, ha itt hagyja', alap: 'Mikor hozod?' },
  { kulcs: 'foglalas.nincs_ido', csoport: 'foglalas', cimke: 'Ha a napon nincs szabad időpont', alap: 'Erre a napra már nincs szabad időpont.' },
  { kulcs: 'foglalas.kesz_kb', csoport: 'foglalas', cimke: 'Időpont alatt: várható elkészülés', alap: 'kész kb.' },
  { kulcs: 'foglalas.hatarido', csoport: 'foglalas', cimke: 'Határidő kérdése', alap: 'Mikorra legyen kész?' },
  { kulcs: 'foglalas.hatarido_nincs', csoport: 'foglalas', cimke: 'Ha nem vállalható határidő', alap: 'Erre a hozási időre nem tudunk határidőt vállalni, válassz korábbit.' },
  { kulcs: 'foglalas.hatarido_savos', csoport: 'foglalas', cimke: 'Határidő tartománya', alap: 'Legkorábban {tol}, legkésőbb {ig}.', valtozok: ['tol', 'ig'] },
  { kulcs: 'foglalas.elvitel_mikor', csoport: 'foglalas', cimke: 'Másnapi elvitel ideje', alap: 'Elviheted: *{mikor}*, bármikor.', valtozok: ['mikor'] },
  { kulcs: 'foglalas.elvitel_szamol', csoport: 'foglalas', cimke: 'Amíg az elvitel napja számolódik', alap: 'Az elvitel napját számoljuk…' },
  { kulcs: 'foglalas.erkezes', csoport: 'foglalas', cimke: 'Tájékoztató az időpont alatt', sor: true,
    alap: 'Kérjük, ha lehet, a választott időpont előtt *5–10 perccel* érkezz. Ha késel, kérjük, telefonálj: {telefon}\nA végleges ár az autó állapotától függően eltérhet, erősen szennyezett autón 50% felárat számíthatunk fel.' },

  { kulcs: 'foglalas.adatok', csoport: 'adatok', cimke: '8. lépés címe', alap: 'Az adataid' },
  { kulcs: 'foglalas.mezo.nev', csoport: 'adatok', cimke: 'Mező: név', alap: 'Név' },
  { kulcs: 'foglalas.mezo.telefon', csoport: 'adatok', cimke: 'Mező: telefonszám', alap: 'Telefonszám' },
  { kulcs: 'foglalas.mezo.email', csoport: 'adatok', cimke: 'Mező: e-mail', alap: 'E-mail' },
  { kulcs: 'foglalas.minta.email', csoport: 'adatok', cimke: 'E-mail mező halvány szövege', alap: 'a visszaigazoláshoz' },
  { kulcs: 'foglalas.mezo.rendszam', csoport: 'adatok', cimke: 'Mező: rendszám', alap: 'Rendszám' },
  { kulcs: 'foglalas.mezo.marka', csoport: 'adatok', cimke: 'Mező: márka', alap: 'Márka' },
  { kulcs: 'foglalas.mezo.modell', csoport: 'adatok', cimke: 'Mező: modell', alap: 'Modell' },
  { kulcs: 'foglalas.mezo.megjegyzes', csoport: 'adatok', cimke: 'Mező: megjegyzés', alap: 'Megjegyzés' },
  { kulcs: 'foglalas.minta.megjegyzes', csoport: 'adatok', cimke: 'Megjegyzés mező halvány szövege', alap: 'pl. kutyaszőr a hátsó ülésen' },
  { kulcs: 'foglalas.feltetel', csoport: 'adatok', cimke: 'Elfogadandó feltétel', sor: true,
    alap: 'Tudomásul veszem, hogy ez foglalási kérés: az időpont akkor végleges, amikor visszaigazoljuk. Ha megadom az e-mail címem, a visszaigazolásban kapok egy lemondó linket, amellyel az időpont előtt legalább {lemondas_ora} órával lemondhatom a foglalást. Ha ez a határidő már lejárt, telefonon tudom jelezni.' },
  { kulcs: 'foglalas.adatvedelem', csoport: 'adatok', cimke: 'Adatvédelmi mondat (utána jön a link)', alap: 'A megadott adatokat a foglalás teljesítéséhez kezeljük. Részletek:' },
  { kulcs: 'foglalas.kezdes_cimke', csoport: 'adatok', cimke: 'Összegzés: kezdés', alap: 'kezdés' },
  { kulcs: 'foglalas.hozas_cimke', csoport: 'adatok', cimke: 'Összegzés: hozás', alap: 'hozás' },
  { kulcs: 'foglalas.hatarido_cimke', csoport: 'adatok', cimke: 'Összegzés: határidő', alap: 'határidő' },
  { kulcs: 'foglalas.elvitel_cimke', csoport: 'adatok', cimke: 'Összegzés: elvitel', alap: 'elvitel' },
  { kulcs: 'foglalas.egyeztetendo', csoport: 'adatok', cimke: 'Összegzés: egyeztetendő extrák', alap: 'Ára egyeztetés után:' },
  { kulcs: 'foglalas.egyeztetendo_tetel', csoport: 'adatok', cimke: 'Összegzés: ár alatt', alap: '+ egyeztetendő tétel' },
  { kulcs: 'foglalas.kuldes', csoport: 'adatok', cimke: 'Küldés gomb', alap: 'Foglalási kérés küldése' },
  { kulcs: 'foglalas.kuldes_folyamatban', csoport: 'adatok', cimke: 'Küldés gomb küldés közben', alap: 'Küldés…' },
  { kulcs: 'foglalas.siker', csoport: 'adatok', cimke: 'Köszönő üzenet címe', alap: 'Köszönjük, megkaptuk a foglalási kérésed!' },
  { kulcs: 'foglalas.siker_elvitel', csoport: 'adatok', cimke: 'Köszönő üzenet: elvitel', alap: 'Elviheted: {mikor}.', valtozok: ['mikor'] },
  { kulcs: 'foglalas.siker_email', csoport: 'adatok', cimke: 'Köszönő üzenet, ha adott meg e-mailt', sor: true, alap: 'Amint visszaigazoltuk, e-mailt küldünk róla, benne a lemondó linkkel.' },
  { kulcs: 'foglalas.siker_telefon', csoport: 'adatok', cimke: 'Köszönő üzenet e-mail nélkül', alap: 'Hamarosan visszaigazoljuk telefonon.' },
  { kulcs: 'foglalas.uj', csoport: 'adatok', cimke: 'Új foglalás gomb', alap: 'Új foglalás' },

  { kulcs: 'hely.cim', csoport: 'hely', cimke: 'Cím', alap: 'Hol vagyunk' },
  { kulcs: 'hely.bevezeto', csoport: 'hely', cimke: 'Bevezető', sor: true, alap: 'A {haz} mélygarázsában, a −1. szinten. A bejárat a {bejarat} nyílik.' },
  { kulcs: 'hely.utvonal', csoport: 'hely', cimke: 'Útvonaltervező link', alap: 'Útvonaltervezés a Google Térképpel' },
  { kulcs: 'hely.terkep_szoveg', csoport: 'hely', cimke: 'A térkép betöltése előtti tájékoztatás', sor: true,
    alap: 'A térképet a Google szolgáltatja. Betöltéskor a Google megkapja az IP-címedet, és sütiket helyezhet el a böngésződben.' },
  { kulcs: 'hely.terkep_gomb', csoport: 'hely', cimke: 'Térkép gomb', alap: 'Térkép betöltése' },

  { kulcs: 'cimke.cim', csoport: 'cimkek', cimke: 'Cím', alap: 'Cím' },
  { kulcs: 'cimke.nyitvatartas', csoport: 'cimkek', cimke: 'Nyitvatartás', alap: 'Nyitvatartás' },
  { kulcs: 'cimke.leadas', csoport: 'cimkek', cimke: 'Leadás', alap: 'Leadás legkorábban' },
  { kulcs: 'cimke.telefon', csoport: 'cimkek', cimke: 'Telefon', alap: 'Telefon' },
  { kulcs: 'cimke.kapcsolat', csoport: 'cimkek', cimke: 'Kapcsolat', alap: 'Kapcsolat' },

  { kulcs: 'lab.leiras', csoport: 'lab', cimke: 'Rövid leírás a név alatt', sor: true, alap: 'Kézi autókozmetika a Váci úti {haz} mélygarázsában.' },
  { kulcs: 'lab.leadas', csoport: 'lab', cimke: 'Leadás sor a nyitvatartás alatt', alap: 'Leadás legkorábban {leadas}' },

  { kulcs: 'oldal.cim', csoport: 'oldal', cimke: 'Az oldal címe a böngészőfülön és a keresőben', alap: '{nev} — kézi autókozmetika, {irsz}, {cim}' },
] as const satisfies readonly SzovegDef[]

export type SzovegKulcs = (typeof SZOVEGEK)[number]['kulcs']

export const SZOVEG_ALAP = Object.fromEntries(SZOVEGEK.map((s) => [s.kulcs, s.alap])) as Record<SzovegKulcs, string>

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
