// ---------------------------------------------------------------------------
//  Megjelenítés
//
//  Az adatbázisban minden időbélyeg timestamptz, tehát UTC-ben tárolódik.
//  A felületen viszont a műhely mindig budapesti időt lát — ezt itt, egy
//  helyen fordítjuk le. Sehol máshol nem szabad időzónával foglalkozni.
// ---------------------------------------------------------------------------

export const TZ = 'Europe/Budapest'

const hhmm = new Intl.DateTimeFormat('hu-HU', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
})

const napHosszu = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: TZ,
})

const napRovid = new Intl.DateTimeFormat('hu-HU', {
  month: 'short', day: 'numeric', timeZone: TZ,
})

/** "2026-09-23T06:00:00Z" → "08:00" */
export function ora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return hhmm.format(new Date(iso))
}

/** Kezdés + várható vég egy sorban: "08:00 – 11:30" */
export function idosav(kezdes: string | null, percek: number): string {
  if (!kezdes) return '—'
  const a = new Date(kezdes)
  if (!percek) return ora(kezdes)
  const b = new Date(a.getTime() + percek * 60_000)
  return `${hhmm.format(a)} – ${hhmm.format(b)}`
}

/** "2026-09-23" → "2026. szeptember 23., szerda" */
export function napCim(datum: string): string {
  return napHosszu.format(new Date(`${datum}T12:00:00Z`))
}

export function napRovidCim(datum: string): string {
  return napRovid.format(new Date(`${datum}T12:00:00Z`))
}

/** 34990 → "34 990 Ft". Az adatbázisban minden ár egész forint, bruttó. */
export function ft(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${v.toLocaleString('hu-HU')} Ft`
}

/** 195 → "3 óra 15 perc", 45 → "45 perc", 120 → "2 óra" */
export function idotartam(percek: number | null | undefined): string {
  if (percek === null || percek === undefined) return '—'
  if (percek < 60) return `${percek} perc`
  const o = Math.floor(percek / 60)
  const p = percek % 60
  return p === 0 ? `${o} óra` : `${o} óra ${p} perc`
}

/** Rövid alak a kártyára: "3:15" */
export function idoRovid(percek: number | null | undefined): string {
  if (percek === null || percek === undefined) return '—'
  const o = Math.floor(percek / 60)
  const p = percek % 60
  return o === 0 ? `${p}p` : `${o}:${String(p).padStart(2, '0')}`
}

/** A rendszám összehasonlításhoz: "abc 123" → "ABC123" */
export function rendszamNorm(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// --- dátumkezelés -----------------------------------------------------------
// Szándékosan string alapú (YYYY-MM-DD), hogy ne keveredjen bele az időzóna.

export function maStr(): string {
  const d = new Date()
  const p = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ,
  })
  return p.format(d)
}

export function napLep(datum: string, delta: number): string {
  const d = new Date(`${datum}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export function maE(datum: string): boolean {
  return datum === maStr()
}

/** "09:00" alakú perc → szám, és vissza. A modal időmezőihez kell. */
export function idoPerc(hhmmStr: string): number {
  const [h, m] = hhmmStr.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function percIdo(percek: number): string {
  const h = Math.floor(percek / 60)
  const m = percek % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * A Postgres time típusa "09:00:00" alakban érkezik, az <input type="time">
 * viszont "09:00"-at akar. Ha nem vágjuk le a másodperceket, a mező üresen
 * marad, és a mentés kinullázza a nyitvatartást.
 */
export function idoMezo(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

/** 480 → "8 ó", 510 → "8,5 ó". A kapacitássávok mellé, nem a kártyára. */
export function oraSzam(percek: number | null | undefined): string {
  if (percek === null || percek === undefined) return '—'
  const o = percek / 60
  return `${(Math.round(o * 10) / 10).toLocaleString('hu-HU')} ó`
}

// --- heti és havi nézet -------------------------------------------------------

/**
 * A hét hétfője. A getDay() vasárnapra 0-t ad, ami a magyar naptárban a hét
 * VÉGE — ezt kell visszaforgatni, különben minden vasárnap egy héttel arrébb
 * csúszna.
 */
export function hetHetfoje(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`)
  const nap = d.getUTCDay()            // 0 = vasárnap
  d.setUTCDate(d.getUTCDate() - (nap === 0 ? 6 : nap - 1))
  return d.toISOString().slice(0, 10)
}

/** Napok hozzáadása egy dátumhoz, hónap- és évfordulóval együtt. */
export function napPlusz(datum: string, n: number): string {
  const d = new Date(`${datum}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** A hónap első napja. */
export function honapElseje(datum: string): string {
  return `${datum.slice(0, 7)}-01`
}

/** Hónapok hozzáadása. A napot mindig 1-re állítja, így nincs 31-e gond. */
export function honapPlusz(datum: string, n: number): string {
  const [ev, ho] = datum.split('-').map(Number)
  const d = new Date(Date.UTC(ev, ho - 1 + n, 1, 12))
  return d.toISOString().slice(0, 10)
}

const honapNev = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric', month: 'long', timeZone: TZ,
})

/** "2026. szeptember" */
export function honapCim(datum: string): string {
  return honapNev.format(new Date(`${datum}T12:00:00Z`))
}

/**
 * "szept. 21. – 27." — ha hónapot vált, mindkét oldalon kiírja a hónapot.
 *
 * Bármelyik napot megkapja a hétből, a hétfőt magától számolja ki. Enélkül
 * szombaton megnyitva a fejléc a KÖVETKEZŐ hetet írta, miközben a rács az
 * aktuálisat mutatta — ugyanabból a dátumból két különböző hét.
 */
export function hetCim(datum: string): string {
  const hetfo = hetHetfoje(datum)
  const vasarnap = napPlusz(hetfo, 6)
  const a = napRovidCim(hetfo)
  const b = napRovidCim(vasarnap)
  // Azonos hónapon belül a második hónapnevet elhagyjuk: "szept. 21. – 27."
  if (hetfo.slice(0, 7) === vasarnap.slice(0, 7)) {
    return `${a} – ${b.replace(/^\S+\s/, '')}`
  }
  return `${a} – ${b}`
}

/** Melyik hónaphoz tartozik: a naptárban a szomszéd hónap napjai halványak. */
export function azonosHonap(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/**
 * ISO hétszám. Nem egyszerű osztás: a szabály szerint egy hét ahhoz az évhez
 * tartozik, amelyikbe a CSÜTÖRTÖKJE esik. Ezért december 29. lehet a
 * következő év 1. hete, január 1. pedig az előző év 52. vagy 53. hete.
 *
 * Ellenőrizve: 2026-01-01 → 1., 2026-09-21 → 39., 2026-12-28 → 53.,
 * 2024-12-30 → 1. hét.
 */
export function hetSzam(datum: string): number {
  const d = new Date(`${datum}T12:00:00Z`)
  const nap = (d.getUTCDay() + 6) % 7          // 0 = hétfő
  d.setUTCDate(d.getUTCDate() - nap + 3)       // az adott hét csütörtökje

  const csutortok = new Date(Date.UTC(d.getUTCFullYear(), 0, 4, 12))
  const n2 = (csutortok.getUTCDay() + 6) % 7
  csutortok.setUTCDate(csutortok.getUTCDate() - n2 + 3)

  return 1 + Math.round((d.getTime() - csutortok.getTime()) / (7 * 86_400_000))
}
