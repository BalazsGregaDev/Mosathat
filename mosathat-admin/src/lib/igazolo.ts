import { ft, honapCim } from './format'
import {
  KIND_LABEL, SIZE_LABEL,
  type ContractPrice, type SheetColumn, type SheetRow,
} from './types'

// ---------------------------------------------------------------------------
//  Az igazolólap közös számolásai
//
//  Ugyanazt mutatja a képernyőn a lap, és ugyanaz kerül a Word fájlba is.
//  Ezért van egy helyen: ha a lábléc szövege vagy egy cella alakja változik,
//  mindkettő együtt változik.
// ---------------------------------------------------------------------------

/** Az ÁFA szorzója. A szerződéses árak bruttók; a lapra nettó kerül. */
export const AFA_SZORZO = 1.27

/** Bruttóból nettó, egész forintra kerekítve (ugyanígy számol az adatbázis). */
export function nettoAr(brutto: number): number {
  return Math.round(brutto / AFA_SZORZO)
}

/** "2026-10-04" → "2026.10.04." */
export function datumPont(nap: string): string {
  return `${nap.slice(0, 4)}.${nap.slice(5, 7)}.${nap.slice(8, 10)}.`
}

/** 123456 → "123 456" (üresen üres). */
export function kmSzoveg(km: number | null): string {
  return km == null ? '' : km.toLocaleString('hu-HU')
}

/** Saját oszlop-e (a cég maga vette fel), vagy alap oszlop. */
export function sajatOszlop(o: SheetColumn): boolean {
  return o.key.startsWith('E_')
}

/**
 * Egy cella szövege. Az aláírás itt üres: az kép, azt a hívó rajzolja ki
 * (a képernyőn <img>, a Wordben beillesztett kép).
 */
export function cellaSzoveg(o: SheetColumn, r: SheetRow): string {
  switch (o.key) {
    case 'DATUM':    return datumPont(r.day)
    case 'RENDSZAM': return r.plate ?? ''
    case 'KM':       return kmSzoveg(r.km)
    case 'NETTO':    return r.net_huf == null ? '' : ft(r.net_huf)
    case 'NEV':      return r.name ?? ''
    case 'ALAIRAS':  return ''
    default:         return r.extra?.[o.key] ?? ''
  }
}

/**
 * A lábléc ársorai a szerződésből: méret – csomag – nettó ár.
 *
 *   Normál méret – Premium – 11 417 Ft + ÁFA
 *   Nagy méret – Premium – 14 173 Ft + ÁFA
 *
 * Ha a szerződésben a cég autóira és a dolgozók saját autóira külön ár van,
 * a kettő egy sorba kerül, hogy a lábléc ne legyen kétszer olyan hosszú:
 *
 *   Normál méret – Premium – Céges: 11 417 Ft, Magán: 13 780 Ft + ÁFA
 */
export function lablecArak(arak: ContractPrice[]): string[] {
  const ketFajta = new Set(arak.map((a) => a.kind)).size > 1

  // Csoportok méret + csomag szerint, az első előfordulás sorrendjében.
  const csoportok = new Map<string, ContractPrice[]>()
  for (const a of arak) {
    const kulcs = `${a.size}|${a.package_id}`
    csoportok.set(kulcs, [...(csoportok.get(kulcs) ?? []), a])
  }

  return [...csoportok.values()]
    // Előbb a normál méret, aztán a nagy; azon belül marad a csomagok sorrendje.
    .sort((x, y) => (x[0].size === y[0].size ? 0 : x[0].size === 'NORMAL' ? -1 : 1))
    .map((cs) => {
      const eleje = `${SIZE_LABEL[cs[0].size]} – ${cs[0].package_name} – `
      if (!ketFajta) return `${eleje}${ft(nettoAr(cs[0].price_huf))} + ÁFA`
      // Céges elöl, Magán utána.
      const sorban = [...cs].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'FLOTTA' ? -1 : 1))
      return eleje
        + sorban.map((a) => `${KIND_LABEL[a.kind]}: ${ft(nettoAr(a.price_huf))}`).join(', ')
        + ' + ÁFA'
    })
}

/** Új saját oszlop kulcsa: "E_" és pár véletlen kisbetű/szám. */
export function ujOszlopKulcs(): string {
  return `E_${Math.random().toString(36).slice(2, 8)}`
}

// --- az időszak neve -------------------------------------------------------------
//
//  Naptári hónapnál (fordulónap 1) a hónap neve: „2026. október".
//  Más fordulónapnál a két szélső nap: „2026. okt. 15. – nov. 14."
//  (évváltásnál mindkét oldalon az év: „2026. dec. 15. – 2027. jan. 14.").

const ROVID = new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const nap = (d: string) => ROVID.format(new Date(`${d.slice(0, 10)}T12:00:00Z`))

/** Naptári hónap-e az időszak (1-jétől indul). */
export function naptariHonap(kezdet: string): boolean {
  return kezdet.slice(8, 10) === '01'
}

/** „okt. 15. – nov. 14." — csak a napok, év nélkül. */
export function idoszakNapok(kezdet: string, veg: string): string {
  return `${nap(kezdet)} – ${nap(veg)}`
}

/** Az időszak teljes neve (lásd fent). */
export function idoszakCim(kezdet: string, veg: string): string {
  if (naptariHonap(kezdet)) return honapCim(kezdet.slice(0, 10))
  const ev1 = kezdet.slice(0, 4)
  const ev2 = veg.slice(0, 4)
  return ev1 === ev2
    ? `${ev1}. ${nap(kezdet)} – ${nap(veg)}`
    : `${ev1}. ${nap(kezdet)} – ${ev2}. ${nap(veg)}`
}
