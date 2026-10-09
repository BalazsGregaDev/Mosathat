import { beferMeg, beoszt, PUFFER_PERC, type Eredmeny, type Munka, type Negyed } from './beosztas'

// ---------------------------------------------------------------------------
//  Befér-e egy új autó — a beosztásra építve (lib/beosztas.ts)
//
//  Ugyanaz a számítás szolgálja ki:
//    - az Új időpont űrlap „Befér-e" sorát (fejlesztői fiók, próba),
//    - az Időpontfoglalás modult (a leendő publikus oldal): a naptár színeit
//      és a választható időpontokat.
//
//  Az elv: kiszámoljuk a nap beosztását az új autó NÉLKÜL és VELE. Ha vele
//  senki nem csúszik többet, semmi nem marad ki, és nincs túlfoglalt
//  negyedóra (megvárósnál), akkor befér.
//
//  Az új autó ugyanúgy sorra kerül, mint a többi (aminek előbb kell
//  elkészülnie, az előbb) — ezért nézzük meg, rontja-e a többiekét.
// ---------------------------------------------------------------------------

export interface Ellenorzes {
  befer: boolean
  /** Mikorra lesz kész az új autó (perc éjféltől), ha ma elkészül. */
  kesz: number | null
  /** Mi romlana el, ha befogadnánk — emberi mondatokban. */
  gondok: string[]
}

/** 495 → "8:15" */
export function ora(perc: number): string {
  return `${Math.floor(perc / 60)}:${String(Math.round(perc % 60)).padStart(2, '0')}`
}

function percSzoveg(p: number): string {
  const r = Math.round(p)
  if (r < 60) return `${r} perc`
  return r % 60 === 0 ? `${r / 60} óra` : `${Math.floor(r / 60)} óra ${r % 60} perc`
}

/** Az új autó hatása a napra. */
export function ujMunkaEllenoriz(negyedek: Negyed[], munkak: Munka[], uj: Munka,
                                 most: number | null = null, alap?: Eredmeny): Ellenorzes {
  const elotte = alap ?? beoszt(negyedek, munkak, most)
  const utana = beoszt(negyedek, [...munkak, uj], most)
  const nev = new Map(munkak.map((m) => [m.id, m.cimke]))
  const gondok: string[] = []

  // Tűréshatár (PUFFER_PERC, 10 perc): ennyi csúszás még nem gond. Gond az,
  // ami a határon túlra kerül, vagy ami már túl volt, és még ennél is többet romlik.
  const rosszabb = (elotte_: number, utana_: number) =>
    (utana_ > PUFFER_PERC && elotte_ <= PUFFER_PERC) || utana_ - elotte_ > PUFFER_PERC

  // az új autó maga
  const maradt = utana.maradt.get(uj.id)
  if (maradt && maradt > PUFFER_PERC) gondok.push(`Ezen a napon nem készülne el: ${percSzoveg(maradt)} munka nem fér bele.`)
  const keses = utana.keses.get(uj.id)
  if (keses && keses > PUFFER_PERC && uj.fajta !== 'FIX') gondok.push(`${percSzoveg(keses)}-cel később lenne kész, mint ${ora(uj.hatarido)}.`)

  // a meglévők: ki csúszna miatta többet
  for (const [id, p] of utana.keses) {
    if (id === uj.id) continue
    const elotte_ = elotte.keses.get(id) ?? 0
    if (rosszabb(elotte_, p)) gondok.push(`${nev.get(id) ?? 'Egy autó'} ${percSzoveg(p - elotte_)}-cel később lenne kész.`)
  }
  for (const [id, p] of utana.maradt) {
    if (id === uj.id) continue
    const elotte_ = elotte.maradt.get(id) ?? 0
    if (rosszabb(elotte_, p)) gondok.push(`${nev.get(id) ?? 'Egy autó'}: ${percSzoveg(p - elotte_)} munka nem férne bele a napba.`)
  }

  // megvárós: nincs szabad hely az idejére
  const ujTul = utana.tulfoglalt.filter((t) => !elotte.tulfoglalt.includes(t))
  if (ujTul.length > 0) {
    gondok.push(`${ora(ujTul[0])}–${ora(ujTul[ujTul.length - 1] + 15)} között nincs szabad hely.`)
  }

  return { befer: gondok.length === 0, kesz: utana.kesz.get(uj.id) ?? null, gondok }
}

/**
 * Időszak, amikor nem kínálunk kezdést / hozást (pl. ebédszünet: 11:15–12:45,
 * a két végével együtt). Perc éjféltől.
 */
export interface TiltottSav {
  tol: number
  ig: number
}

const tiltottE = (t: number, tiltott: TiltottSav[]) => tiltott.some((s) => t >= s.tol && t <= s.ig)

/** Egy választható időpont: kezdés (megvárja) vagy hozás (itt hagyja), és mikorra kész. */
export interface Lehetoseg {
  tol: number
  kesz: number | null
}

/**
 * Megvárja: mely kezdési időpontokban fér be egy `perc` hosszú munka.
 * A kezdés nem lehet a múltban (ma), és a munkának zárásig végeznie kell.
 */
export function varosKezdesek(negyedek: Negyed[], munkak: Munka[], perc: number,
                              most: number | null = null, lepes = 30,
                              tiltott: TiltottSav[] = []): Lehetoseg[] {
  if (!perc || negyedek.length === 0) return []
  const nyit = negyedek[0].tol
  const zar = negyedek[negyedek.length - 1].ig
  const alap = beoszt(negyedek, munkak, most)
  const ki: Lehetoseg[] = []
  for (let t = nyit; t + perc <= zar; t += lepes) {
    if (most !== null && t < most) continue
    if (tiltottE(t, tiltott)) continue
    const uj: Munka = { id: '__uj', cimke: 'Új', fajta: 'FIX', tol: t, hatarido: t + perc, perc }
    const e = ujMunkaEllenoriz(negyedek, munkak, uj, most, alap)
    if (e.befer) ki.push({ tol: t, kesz: t + perc })
  }
  return ki
}

/**
 * Itt hagyja: mely hozási időpontokban fér be (zárásig elkészül), és
 * mikorra várható, hogy kész.
 */
export function leadosHozasok(negyedek: Negyed[], munkak: Munka[], perc: number,
                              most: number | null = null, lepes = 30,
                              tiltott: TiltottSav[] = []): Lehetoseg[] {
  if (!perc || negyedek.length === 0) return []
  const nyit = negyedek[0].tol
  const zar = negyedek[negyedek.length - 1].ig
  const alap = beoszt(negyedek, munkak, most)
  const ki: Lehetoseg[] = []
  for (let t = nyit; t + perc <= zar; t += lepes) {
    if (most !== null && t < most) continue
    if (tiltottE(t, tiltott)) continue
    const uj: Munka = { id: '__uj', cimke: 'Új', fajta: 'RUGALMAS', tol: t, hatarido: zar, perc }
    const e = ujMunkaEllenoriz(negyedek, munkak, uj, most, alap)
    if (e.befer) ki.push({ tol: t, kesz: e.kesz })
  }
  return ki
}

export type NapAllapot = 'szabad' | 'keves' | 'tele' | 'zarva'

/**
 * A naptár egy napjának színe az adott kérésre.
 *   zárva    nincs munkaidő
 *   tele     egy időpont sem fér be
 *   kevés    egy-két lehetőség, vagy már csak egy ilyen autó fér be
 *   szabad   egyébként
 */
export function napAllapot(negyedek: Negyed[], munkak: Munka[], perc: number,
                           tipus: 'VAROS' | 'LEADOS', most: number | null = null,
                           tiltott: TiltottSav[] = []): {
  allapot: NapAllapot
  lehetosegek: Lehetoseg[]
  meg: number
} {
  if (negyedek.length === 0) return { allapot: 'zarva', lehetosegek: [], meg: 0 }
  const lehetosegek = tipus === 'VAROS'
    ? varosKezdesek(negyedek, munkak, perc, most, 30, tiltott)
    : leadosHozasok(negyedek, munkak, perc, most, 30, tiltott)
  const meg = beferMeg(negyedek, munkak, perc, most, 10)
  const allapot: NapAllapot = lehetosegek.length === 0 ? 'tele'
    : lehetosegek.length <= 2 || meg <= 1 ? 'keves' : 'szabad'
  return { allapot, lehetosegek, meg }
}
