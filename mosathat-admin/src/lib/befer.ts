import { beferMeg, beoszt, PUFFER_PERC, type Eredmeny, type Munka, type Negyed } from './beosztas'
import { idotartam, percOra } from './format'

export interface Ellenorzes {
  befer: boolean
  kesz: number | null
  gondok: string[]
}

const percSzoveg = (p: number) => idotartam(Math.round(p))

export function ujMunkaEllenoriz(negyedek: Negyed[], munkak: Munka[], ujMunka: Munka,
                                 most: number | null = null, alap?: Eredmeny): Ellenorzes {
  const uj = most !== null && ujMunka.fajta !== 'FIX' && ujMunka.tol < most ? { ...ujMunka, tol: most } : ujMunka
  const elotte = alap ?? beoszt(negyedek, munkak, most)
  const utana = beoszt(negyedek, [...munkak, uj], most)
  const nev = new Map(munkak.map((m) => [m.id, m.cimke]))
  const gondok: string[] = []

  const rosszabb = (regi: number, uj2: number) =>
    (uj2 > PUFFER_PERC && regi <= PUFFER_PERC) || uj2 - regi > PUFFER_PERC

  const maradt = utana.maradt.get(uj.id)
  if (maradt && maradt > PUFFER_PERC) gondok.push(`Ezen a napon nem készülne el: ${percSzoveg(maradt)} munka nem fér bele.`)
  const keses = utana.keses.get(uj.id)
  if (keses && keses > PUFFER_PERC) gondok.push(`${percSzoveg(keses)}-cel később lenne kész, mint ${percOra(uj.hatarido)}.`)

  for (const [id, p] of utana.keses) {
    if (id === uj.id) continue
    const regi = elotte.keses.get(id) ?? 0
    if (rosszabb(regi, p)) gondok.push(`${nev.get(id) ?? 'Egy autó'} ${percSzoveg(p - regi)}-cel később lenne kész.`)
  }
  for (const [id, p] of utana.maradt) {
    if (id === uj.id) continue
    const regi = elotte.maradt.get(id) ?? 0
    if (rosszabb(regi, p)) gondok.push(`${nev.get(id) ?? 'Egy autó'}: ${percSzoveg(p - regi)} munka nem férne bele a napba.`)
  }

  const tele = uj.fajta !== 'FIX' ? []
    : negyedek.filter((n) => n.tol < uj.tol + uj.perc && uj.tol < n.ig && utana.tulfoglalt.includes(n.tol))
  if (tele.length > 0) {
    gondok.push(`${percOra(tele[0].tol)}–${percOra(tele[tele.length - 1].ig)} között nincs szabad hely.`)
  }

  return { befer: gondok.length === 0, kesz: utana.kesz.get(uj.id) ?? null, gondok }
}

export interface TiltottSav {
  tol: number
  ig: number
}

const tiltottE = (t: number, tiltott: TiltottSav[]) => tiltott.some((s) => t >= s.tol && t <= s.ig)

export interface Lehetoseg {
  tol: number
  kesz: number | null
}

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
