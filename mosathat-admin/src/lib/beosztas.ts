// ---------------------------------------------------------------------------
//  Beosztás: melyik autón mikor dolgozunk, és befér-e még egy
//
//  A nap negyedórákból áll. Minden negyedórában annyi autón dolgozhatunk
//  egyszerre, ahány „hely" van (alap: 2 — de csak ha legalább ketten bent
//  vagyunk; ezt az adatbázis day_lanes() függvénye adja negyedóránként).
//
//  Háromféle munka van:
//
//    FIX        „Megvárja": az ügyfél ott ül. A kezdés ideje kötött, a
//               munka kezdéstől a munkaidő végéig egy helyet biztosan elfoglal.
//    RUGALMAS   „Itt hagyja" (és hozom-viszem): bármikor elkezdhető, amikor
//               az autó már itt van, csak a „viszi" időre legyen kész. Félbe
//               is hagyható (a külső és a belső külön pipálható) — ha
//               megvárós érkezik, félrerakjuk, és később folytatjuk.
//    TOBBNAPOS  a többnapos autó MAI része (napi_perc): a nap hézagait tölti.
//
//    KESZ       ami már kész (Kész van / Átvette): a munkaidejével, az
//               érkezés és a „Kész van" megnyomása között, mindenki más előtt.
//               Nem fix blokk az érkezéstől a Kész vanig: az az idő várakozást,
//               ebédet, telefont is tartalmaz, nem csak munkát (v59).
//
//  HOGYAN OSZTJUK BE
//
//    Negyedóráról negyedórára haladunk:
//      1. a FIX munkák elfoglalják a helyüket (ha több van, mint hely,
//         az „túlfoglalt" — a képen piros);
//      2. a maradék helyekre a rugalmas munkák kerülnek, mégpedig az
//         elsők között az, amelyiknek a legkorábbi a határideje (ahogy
//         fejben is csináljátok: ami előbb kell, azt csináljuk előbb).
//         A kérdőjeles autók („???") a sor végén: csak ha befér.
//    Egy munka nem mehet egyszerre két helyen, de negyedóránként
//    félbehagyható és máskor folytatható.
//
//  HÁNY AUTÓ FÉR MÉG BE
//
//    Hozzáadunk egy Start autót (rugalmas, mostantól zárásig), és újra
//    beosztunk. Ha kész lesz zárásig, befért — jöhet a következő. Ahányadik
//    már nem fér, annyi mínusz egy fér be. Az új autók a sor legvégére
//    kerülnek, így a meglévők beosztását nem rontják.
//
//  Ez a fájl nem tud a Reactról és az adatbázisról: csak számol. Ugyanezt
//  használhatja majd a publikus foglalás is (szerveroldalon).
// ---------------------------------------------------------------------------

export type MunkaFajta = 'FIX' | 'RUGALMAS' | 'TOBBNAPOS' | 'KESZ'

/**
 * Tűréshatár percben: ennyi csúszás még nem gond. A munka a valóságban nem
 * percre kiszámítható — egy 1 perces „csúszásért" nem szólunk.
 */
export const PUFFER_PERC = 10

export interface Munka {
  id: string
  /** Rendszám (vagy cég / név), a sávon ez látszik. */
  cimke: string
  fajta: MunkaFajta
  /** Percben éjféltől. FIX: a kezdés; a többinél: legkorábban ekkor kezdhető. */
  tol: number
  /** Percben éjféltől: eddigre legyen kész (FIX-nél nem használjuk). */
  hatarido: number
  /** Munkaidő percben (száradás nélkül). */
  perc: number
  /** Kérdőjeles: csak ha befér — a sor végén. */
  kerdojeles?: boolean
  /** Csak a „befér még" próbához: elképzelt autó. */
  probabeli?: boolean
  /** Online foglalási kérés (még nincs visszaigazolva) — a helyet már foglalja. */
  keres?: boolean
}

/** Egy negyedóra: mettől meddig (perc éjféltől), és hány hely van benne. */
export interface Negyed {
  tol: number
  ig: number
  helyek: number
}

/** Egy összefüggő darab egy munkából, egy helyen (soron). */
export interface Darab {
  id: string
  tol: number
  ig: number
  sor: number
}

export interface Eredmeny {
  darabok: Darab[]
  /** Mikor lesz kész (perc éjféltől) — ami nem lesz kész, az nincs benne. */
  kesz: Map<string, number>
  /** Ennyi perccel csúszik a határidejéhez képest (csak a csúszók). */
  keses: Map<string, number>
  /** Ennyi perc munka nem fér már bele a napba (csak akiké nem fér). */
  maradt: Map<string, number>
  /** Azok a negyedórák (kezdete), ahol több a fix munka, mint a hely. */
  tulfoglalt: number[]
  /** Hány sor kell a rajzhoz (a helyek, plusz ha túlfoglalt). */
  sorok: number
}

// A rugalmas munkák sorrendje azonos határidőnél: a mai egynaposak, a
// többnaposak, a kérdőjelesek, végül az elképzelt („befér még") autók.
function rang(m: Munka): number {
  if (m.probabeli) return 4
  if (m.kerdojeles) return 3
  if (m.fajta === 'TOBBNAPOS') return 2
  return 1
}

/**
 * Beosztás egy napra.
 *
 * @param negyedek  a nap negyedórái időrendben (szünet: helyek = 0)
 * @param munkak    a nap munkái
 * @param most      ha a mai napot nézzük: perc éjféltől — ami még nem
 *                  kezdődött el, az nem kerülhet a múltba
 */
export function beoszt(negyedek: Negyed[], munkak: Munka[], most: number | null = null): Eredmeny {
  const maradek = new Map<string, number>()
  for (const m of munkak) maradek.set(m.id, Math.max(0, m.perc))

  const kesz = new Map<string, number>()
  const keses = new Map<string, number>()
  const tulfoglalt: number[] = []
  const elozoSor = new Map<string, number>()       // ki melyik soron volt az előző negyedben
  const darabok: Darab[] = []
  const nyitott = new Map<string, Darab>()          // a most épülő darab munkánként
  let sorok = Math.max(0, ...negyedek.map((n) => n.helyek))

  // A kész (Kész van / Átvette) munkák NEM fix blokkok: az érkezéstől a
  // „Kész van" megnyomásáig eltelt idő nem munkaidő (várakozás, ebéd,
  // telefon is benne van). Ezért úgy osztjuk be őket, mint a rugalmasakat —
  // a munkaidejükkel, legkorábban az érkezésüktől —, de csak a „Kész van"
  // idejéig (utána már nem foglalnak helyet), és mindenki más előtt (velük
  // tényleg dolgoztunk). Figyelmeztetést nem adnak.
  const fixek = munkak.filter((m) => m.fajta === 'FIX')
  const rugalmasak = munkak.filter((m) => m.fajta !== 'FIX')

  for (const n of negyedek) {
    const hossz = n.ig - n.tol

    // 1. a fix munkák, amik ebben a negyedben zajlanak
    const fixMost = fixek.filter((m) => m.perc > 0 && m.tol < n.ig && n.tol < m.tol + m.perc)
    if (fixMost.length > n.helyek && fixMost.length > 0) tulfoglalt.push(n.tol)

    // 2. a rugalmasak: akik már itt vannak, és van még munkájuk
    const szabad = Math.max(0, n.helyek - fixMost.length)
    const jeloltek = rugalmasak
      .filter((m) => (maradek.get(m.id) ?? 0) > 0 && m.tol <= n.tol
        // a kész munka csak a „Kész van" idejéig foglal helyet
        && (m.fajta !== 'KESZ' || n.tol < m.hatarido)
        // a mai napon a még el nem kezdett munka nem kerülhet a múltba
        && (most === null || !m.probabeli || n.tol >= most))
      .sort((a, b) => (a.fajta === 'KESZ' ? 0 : 1) - (b.fajta === 'KESZ' ? 0 : 1)
        || (rang(a) >= 3 ? 1 : 0) - (rang(b) >= 3 ? 1 : 0)
        || a.hatarido - b.hatarido || rang(a) - rang(b) || a.tol - b.tol)
      .slice(0, szabad)

    // 3. kiosztás sorokra: aki az előző negyedben is dolgozott, maradjon a
    //    saját során (a rajz így összefüggő)
    const itt = [...fixMost, ...jeloltek]
    const foglalt = new Set<number>()
    const sorKi = new Map<string, number>()
    for (const m of itt) {
      const s = elozoSor.get(m.id)
      if (s !== undefined && !foglalt.has(s)) { sorKi.set(m.id, s); foglalt.add(s) }
    }
    for (const m of itt) {
      if (sorKi.has(m.id)) continue
      let s = 0
      while (foglalt.has(s)) s++
      sorKi.set(m.id, s)
      foglalt.add(s)
      sorok = Math.max(sorok, s + 1)
    }

    // 4. a munka halad; a darabok összefűzése
    elozoSor.clear()
    for (const m of itt) {
      const s = sorKi.get(m.id)!
      elozoSor.set(m.id, s)
      let ig = n.ig
      if (m.fajta !== 'FIX') {
        const r = maradek.get(m.id) ?? 0
        const dolgozik = Math.min(hossz, r)
        maradek.set(m.id, r - dolgozik)
        ig = n.tol + dolgozik
        if (r - dolgozik <= 0) kesz.set(m.id, ig)
      } else {
        ig = Math.min(n.ig, m.tol + m.perc)
        if (m.tol + m.perc <= n.ig) kesz.set(m.id, m.tol + m.perc)
      }
      const tol = Math.max(n.tol, m.fajta === 'FIX' ? m.tol : n.tol)
      const d = nyitott.get(m.id)
      if (d && d.sor === s && d.ig === n.tol) {
        d.ig = ig
      } else {
        const uj = { id: m.id, tol, ig, sor: s }
        darabok.push(uj)
        nyitott.set(m.id, uj)
      }
    }
    // akik most nem dolgoztak, azoknak a darabja lezárul
    for (const id of [...nyitott.keys()]) if (!sorKi.has(id)) nyitott.delete(id)
  }

  const maradt = new Map<string, number>()
  for (const m of rugalmasak) {
    if (m.fajta === 'KESZ') continue      // ami kész, az kész: nincs csúszás, nincs maradék
    const r = maradek.get(m.id) ?? 0
    if (r > 0) maradt.set(m.id, r)
    const k = kesz.get(m.id)
    if (k !== undefined && k > m.hatarido) keses.set(m.id, k - m.hatarido)
  }

  return { darabok, kesz, keses, maradt, tulfoglalt, sorok }
}

/**
 * Hány autó fér még be ma egy `perc` hosszú munkával (az alap Start).
 * Az elképzelt autók mostantól (vagy nyitástól) zárásig bármikor
 * készülhetnek, és a sor végére kerülnek.
 */
export function beferMeg(negyedek: Negyed[], munkak: Munka[], perc: number,
                         most: number | null = null, legfeljebb = 30): number {
  if (!perc || perc <= 0 || negyedek.length === 0) return 0
  const nyit = negyedek[0].tol
  const zar = negyedek[negyedek.length - 1].ig
  const tol = most === null ? nyit : Math.max(nyit, most)
  let db = 0
  while (db < legfeljebb) {
    const proba: Munka[] = Array.from({ length: db + 1 }, (_, i) => ({
      id: `__proba${i}`, cimke: 'Start', fajta: 'RUGALMAS', tol, hatarido: zar, perc, probabeli: true,
    }))
    const e = beoszt(negyedek, [...munkak, ...proba], most)
    const mindKesz = proba.every((p) => !e.maradt.has(p.id) && !e.keses.has(p.id))
    if (!mindKesz) break
    db++
  }
  return db
}

// ---------------------------------------------------------------------------
//  Átalakítás: a nap foglalásaiból munkák
// ---------------------------------------------------------------------------

const TZ = 'Europe/Budapest'
const oraPerc = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
const napFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ })

/** Időbélyeg → perc éjféltől (budapesti idő). */
export function percEjfeltol(iso: string): number {
  const [o, p] = oraPerc.format(new Date(iso)).split(':').map(Number)
  return (o % 24) * 60 + p
}
/** Időbélyeg → "2026-10-08" (budapesti nap). */
export function budapestiNap(iso: string): string {
  return napFmt.format(new Date(iso))
}
/** "08:15" vagy "08:15:00" → 495 */
export function idoPercbe(t: string): number {
  const [o, p] = t.split(':').map(Number)
  return o * 60 + p
}

/** A day_lanes() negyedórái, a szünetekkel kitöltve (helyek = 0). */
export function negyedekbol(sorok: { starts: string; ends: string; lanes: number }[]): Negyed[] {
  const ki: Negyed[] = []
  for (const s of sorok) {
    const tol = idoPercbe(s.starts)
    const ig = idoPercbe(s.ends)
    const elozo = ki[ki.length - 1]
    // szünet (ebéd): üres negyedórák a résben
    if (elozo && tol > elozo.ig) {
      for (let t = elozo.ig; t < tol; t += 15) ki.push({ tol: t, ig: Math.min(t + 15, tol), helyek: 0 })
    }
    ki.push({ tol, ig, helyek: s.lanes })
  }
  return ki
}

/** A foglalás mezői, amik a beosztáshoz kellenek (a DayBooking része). */
export interface FoglalasBeosztashoz {
  id: string
  status: string
  booking_type: string
  service_date: string
  last_day: string
  start_at: string | null
  drop_off_at: string | null
  pick_up_at: string | null
  deadline_at: string | null
  planned_duration_minutes: number
  napi_perc?: number | null
  kezdve?: string | null
  befejezve?: string | null
  tentative?: boolean
  not_fitted?: boolean
}

// A függő kérés (REQUESTED) számít: a helyet már foglalja, hogy két ügyfél
// ne kérhesse ugyanazt az egyetlen szabad időpontot.
const NEM_SZAMIT = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW', 'REJECTED']

/**
 * A nap foglalásaiból a beosztás munkái.
 *
 * @param nap     a nézett nap ("2026-10-08")
 * @param nyit    nyitás, zár: perc éjféltől (ha nincs megadva idő)
 * @param cimke   a sávon látszó felirat (rendszám / cég)
 * @param most    ha a mai napot nézzük: perc éjféltől (a meg nem érkezett
 *                autó nem kerülhet a múltba)
 */
export function munkakNapra(foglalasok: FoglalasBeosztashoz[], nap: string, nyit: number, zar: number,
                            cimke: (b: FoglalasBeosztashoz) => string,
                            most: number | null = null): { munkak: Munka[]; idoNelkul: string[] } {
  const munkak: Munka[] = []
  const idoNelkul: string[] = []

  for (const b of foglalasok) {
    if (NEM_SZAMIT.includes(b.status) || b.not_fitted) continue
    const tobbnapos = b.last_day.slice(0, 10) > b.service_date.slice(0, 10)
    const perc = tobbnapos ? Math.round(b.napi_perc ?? 0) : b.planned_duration_minutes
    const keszE = b.status === 'READY' || b.status === 'COMPLETED'

    // Kész (Kész van / Átvette): a munkaidejével, az érkezés és a „Kész van"
    // között (lásd beoszt: KESZ). Ha egy korábbi napon lett kész, ma már
    // nem foglal helyet.
    if (keszE) {
      if (b.befejezve && budapestiNap(b.befejezve) < nap) continue
      if (!perc || perc <= 0) continue
      const hozza = b.drop_off_at ?? b.start_at
      const tol = b.kezdve && budapestiNap(b.kezdve) === nap ? percEjfeltol(b.kezdve)
        : hozza && budapestiNap(hozza) === nap ? percEjfeltol(hozza) : nyit
      const ig = b.befejezve && budapestiNap(b.befejezve) === nap ? percEjfeltol(b.befejezve) : zar
      munkak.push({ id: b.id, cimke: cimke(b), fajta: 'KESZ', tol: Math.min(tol, ig), hatarido: ig, perc })
      continue
    }

    if (!perc || perc <= 0) {
      // többnapos autóra ma nem jut munka (pl. ma nem munkanap): nem hiba
      if (!tobbnapos) idoNelkul.push(cimke(b))
      continue
    }

    // Megvárja, megadott kezdéssel: fix
    if (b.booking_type === 'VAROS' && b.start_at && budapestiNap(b.start_at) === nap) {
      munkak.push({ id: b.id, cimke: cimke(b), fajta: 'FIX', tol: percEjfeltol(b.start_at),
                    hatarido: percEjfeltol(b.start_at) + perc, perc, kerdojeles: b.tentative,
                    keres: b.status === 'REQUESTED' })
      continue
    }

    // Rugalmas: mikortól (ha ma hozzák: a hozza ideje), meddig (ha ma viszik: a viszi ideje)
    const hozza = b.drop_off_at ?? b.start_at
    const viszi = b.pick_up_at ?? b.deadline_at
    let tol = hozza && budapestiNap(hozza) === nap ? percEjfeltol(hozza) : nyit
    // Ma: ami még meg sem érkezett, azon a múltban nem dolgozhattunk.
    if (most !== null && (b.status === 'CONFIRMED' || b.status === 'REQUESTED')) tol = Math.max(tol, most)
    const hatarido = viszi && budapestiNap(viszi) === nap ? percEjfeltol(viszi) : zar
    munkak.push({ id: b.id, cimke: cimke(b), fajta: tobbnapos ? 'TOBBNAPOS' : 'RUGALMAS',
                  tol, hatarido: Math.max(hatarido, tol), perc, kerdojeles: b.tentative,
                  keres: b.status === 'REQUESTED' })
  }
  return { munkak, idoNelkul }
}
