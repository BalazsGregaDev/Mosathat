const TZ = 'Europe/Budapest'

const hhmm = new Intl.DateTimeFormat('hu-HU', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
})

const oraPerc = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
})

const napFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ,
})

const napHosszu = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: TZ,
})

const napRovid = new Intl.DateTimeFormat('hu-HU', {
  month: 'short', day: 'numeric', timeZone: TZ,
})

const honapNev = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric', month: 'long', timeZone: TZ,
})

export function ora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return hhmm.format(new Date(iso))
}

export function helyiOra(iso: string | null | undefined): string {
  if (!iso) return ''
  return oraPerc.format(new Date(iso))
}

export function helyiNap(iso: string | null | undefined): string {
  if (!iso) return ''
  return napFmt.format(new Date(iso))
}

export function percEjfeltol(iso: string): number {
  const [o, p] = oraPerc.format(new Date(iso)).split(':').map(Number)
  return (o % 24) * 60 + p
}

export function mostPerc(): number {
  return percEjfeltol(new Date().toISOString())
}

export function idoPercbe(t: string): number {
  const [o, p] = t.split(':').map(Number)
  return o * 60 + (p || 0)
}

export function percIdo(percek: number): string {
  const t = Math.round(percek)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export function percOra(perc: number): string {
  const t = Math.round(perc)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

export function idosav(kezdes: string | null, percek: number): string {
  if (!kezdes) return '—'
  const a = new Date(kezdes)
  if (!percek) return ora(kezdes)
  const b = new Date(a.getTime() + percek * 60_000)
  return `${hhmm.format(a)} – ${hhmm.format(b)}`
}

export function vegOra(kezdes: string | null, percek: number): string {
  if (!kezdes) return '—'
  return hhmm.format(new Date(new Date(kezdes).getTime() + percek * 60_000))
}

export function napCim(datum: string): string {
  return napHosszu.format(new Date(`${datum}T12:00:00Z`))
}

export function napRovidCim(datum: string): string {
  return napRovid.format(new Date(`${datum}T12:00:00Z`))
}

export function ft(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${v.toLocaleString('hu-HU')} Ft`
}

const AFA = 0.27

export const nettobol = (brutto: number) => Math.round(brutto / (1 + AFA))

export const bruttobol = (netto: number) => Math.round(netto * (1 + AFA))

export function felarasAr(alap: number, pct: number, fix: number): number {
  return Math.round((alap * (100 + pct)) / 100) + Math.round(fix)
}

export function idotartam(percek: number | null | undefined): string {
  if (percek === null || percek === undefined) return '—'
  if (percek < 60) return `${percek} perc`
  const o = Math.floor(percek / 60)
  const p = percek % 60
  return p === 0 ? `${o} óra` : `${o} óra ${p} perc`
}

export function idoRovid(percek: number | null | undefined): string {
  if (percek === null || percek === undefined) return '—'
  const o = Math.floor(percek / 60)
  const p = percek % 60
  return `${o}:${String(p).padStart(2, '0')}`
}

export function maStr(): string {
  return napFmt.format(new Date())
}

export function maE(datum: string): boolean {
  return datum === maStr()
}

export function idoMezo(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

export function oraSzam(percek: number | null | undefined): string {
  if (percek === null || percek === undefined) return '—'
  const o = percek / 60
  return `${(Math.round(o * 10) / 10).toLocaleString('hu-HU')} ó`
}

export function napKulonbseg(tol: string, ig: string): number {
  return Math.round(
    (Date.parse(`${ig.slice(0, 10)}T12:00:00Z`) - Date.parse(`${tol.slice(0, 10)}T12:00:00Z`)) / 86_400_000)
}

export function hetHetfoje(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`)
  const nap = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (nap === 0 ? 6 : nap - 1))
  return d.toISOString().slice(0, 10)
}

export function napPlusz(datum: string, n: number): string {
  const d = new Date(`${datum}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function honapElseje(datum: string): string {
  return `${datum.slice(0, 7)}-01`
}

export function honapPlusz(datum: string, n: number): string {
  const [ev, ho] = datum.split('-').map(Number)
  const d = new Date(Date.UTC(ev, ho - 1 + n, 1, 12))
  return d.toISOString().slice(0, 10)
}

export function honapCim(datum: string): string {
  return honapNev.format(new Date(`${datum}T12:00:00Z`))
}

export function hetCim(datum: string): string {
  const hetfo = hetHetfoje(datum)
  const vasarnap = napPlusz(hetfo, 6)
  const a = napRovidCim(hetfo)
  const b = napRovidCim(vasarnap)
  if (hetfo.slice(0, 7) === vasarnap.slice(0, 7)) {
    return `${a} – ${b.replace(/^\S+\s/, '')}`
  }
  return `${a} – ${b}`
}

export function azonosHonap(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function hetSzam(datum: string): number {
  const d = new Date(`${datum}T12:00:00Z`)
  const nap = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - nap + 3)

  const csutortok = new Date(Date.UTC(d.getUTCFullYear(), 0, 4, 12))
  const n2 = (csutortok.getUTCDay() + 6) % 7
  csutortok.setUTCDate(csutortok.getUTCDate() - n2 + 3)

  return 1 + Math.round((d.getTime() - csutortok.getTime()) / (7 * 86_400_000))
}

const HONAP_ROVID = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.',
  'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.']

export function napokRovid(tol: string, ig: string): string {
  const [ev1, ho1, nap1] = tol.slice(0, 10).split('-').map(Number)
  const [ev2, ho2, nap2] = ig.slice(0, 10).split('-').map(Number)
  const ev = ev1 !== Number(maStr().slice(0, 4)) ? `${ev1}. ` : ''
  if (tol.slice(0, 10) === ig.slice(0, 10)) return `${ev}${HONAP_ROVID[ho1 - 1]} ${nap1}.`
  if (ev1 === ev2 && ho1 === ho2) return `${ev}${HONAP_ROVID[ho1 - 1]} ${nap1}–${nap2}.`
  const ev2s = ev2 !== ev1 ? `${ev2}. ` : ''
  return `${ev}${HONAP_ROVID[ho1 - 1]} ${nap1}. – ${ev2s}${HONAP_ROVID[ho2 - 1]} ${nap2}.`
}

const NAPNEVEK = ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat']

export function relativNap(datum: string, ma: string = maStr()): string {
  const kulonbseg = napKulonbseg(ma, datum)
  if (kulonbseg === 0) return 'Ma'
  if (kulonbseg === -1) return 'Tegnap'
  if (kulonbseg === 1) return 'Holnap'
  if (Math.abs(kulonbseg) <= 6) return NAPNEVEK[new Date(`${datum.slice(0, 10)}T12:00:00Z`).getUTCDay()]
  return napokRovid(datum, datum)
}

export function hibaSzoveg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
