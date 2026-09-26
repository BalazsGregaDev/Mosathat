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
