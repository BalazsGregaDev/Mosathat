import { useEffect, useMemo, useState } from 'react'

import {
  beferMeg, beoszt, munkakNapra, negyedekbol, percEjfeltol, PUFFER_PERC,
  type Munka, type MunkaFajta,
} from '../../lib/beosztas'
import { idotartam, maStr } from '../../lib/format'
import { HELYORZO } from '../../lib/flotta'
import type { DayBooking, DayLane } from '../../lib/types'

// ---------------------------------------------------------------------------
//  Idővonal a napi nézet tetején — negyedórás bontásban
//
//        08    09    10    11    12    13    14    15    16    17
//  1. hely ██ABC██░░░░██████LMN██████▒▒▒▒░░░░░███KER███          ┌──────┐
//  2. hely ████PQR████░░░░░░░░░░░░░░░▒▒▒▒███████TOB██████          │  +3  │
//                       │ most                                       │ Start│
//                                                                    └──────┘
//    sárga: megvárja (fix idő)   türkiz: itt hagyja (rugalmas)
//    lila: többnapos (a mai része)   szürke: kész   ▒ ebédszünet
//
//  A beosztást a lib/beosztas.ts számolja (a részletek ott). Itt csak
//  rajzolunk: minden hely egy sor, a munkák darabjai a soron, időarányosan.
//  Egy rugalmas munka több darabban is lehet — ha megvárós érkezett,
//  félrerakjuk, és később folytatjuk.
//
//  A sor végén: hány alap Start autó fér még be a napba (mostantól, ha ma
//  van). Alatta, ha valami nem fér: ki csúszik, mennyi munka marad ki.
// ---------------------------------------------------------------------------

const FAJTA_NEV: Record<MunkaFajta, string> = {
  FIX: 'Megvárja',
  RUGALMAS: 'Itt hagyja',
  TOBBNAPOS: 'Többnapos (mai része)',
  KESZ: 'Kész',
}

/** 495 → "8:15" */
function ido(perc: number): string {
  const o = Math.floor(perc / 60)
  const p = Math.round(perc % 60)
  return `${o}:${String(p).padStart(2, '0')}`
}

/** A sávon látszó felirat: a rendszám; flottás autónál (rendszám nélkül) a cég és a sorszám. */
function cimke(b: DayBooking): string {
  const r = (b.plate_raw ?? '').trim().toUpperCase()
  if (r && r !== HELYORZO) return r
  if (b.fleet_index) return `${b.company_name ?? 'Flotta'} ${b.fleet_index}.`
  return b.company_name || b.customer_name || 'névtelen'
}

export default function Idovonal({ nap, foglalasok, savok, startPerc, onMegnyit }: {
  nap: string
  /** A nap foglalásai (a flottás autók egyenként). */
  foglalasok: DayBooking[]
  /** Negyedóránként hány hely (day_lanes). */
  savok: DayLane[]
  /** Az alap Start munkaideje; null, ha nincs megadva. */
  startPerc: number | null
  onMegnyit: (id: string) => void
}) {
  // A mai napon a „most" vonal percenként halad.
  const ma = maStr()
  const maiNap = nap === ma
  const multbeli = nap < ma
  const [most, setMost] = useState(() => percEjfeltol(new Date().toISOString()))
  useEffect(() => {
    if (!maiNap) return
    const t = setInterval(() => setMost(percEjfeltol(new Date().toISOString())), 60_000)
    return () => clearInterval(t)
  }, [maiNap])

  const negyedek = useMemo(() => negyedekbol(savok), [savok])
  const nyit = negyedek[0]?.tol ?? 0
  const zar = negyedek[negyedek.length - 1]?.ig ?? 0
  const mostEkkor = maiNap ? most : null

  const { munkak, idoNelkul } = useMemo(
    () => munkakNapra(foglalasok, nap, nyit, zar, (b) => cimke(b as DayBooking), mostEkkor),
    [foglalasok, nap, nyit, zar, mostEkkor],
  )
  const e = useMemo(() => beoszt(negyedek, munkak, mostEkkor), [negyedek, munkak, mostEkkor])
  const befer = useMemo(
    () => (multbeli || !startPerc ? null : beferMeg(negyedek, munkak, startPerc, mostEkkor)),
    [negyedek, munkak, startPerc, mostEkkor, multbeli],
  )

  if (negyedek.length === 0) return null      // zárt nap: nincs idővonal

  const hossz = zar - nyit
  const hely = (p: number) => `${((p - nyit) / hossz) * 100}%`
  const szel = (a: number, b: number) => `${((b - a) / hossz) * 100}%`
  const munka = new Map<string, Munka>(munkak.map((m) => [m.id, m]))
  const orak: number[] = []
  for (let t = Math.ceil(nyit / 60) * 60; t <= zar; t += 60) orak.push(t)
  const sorok = Array.from({ length: Math.max(1, e.sorok) }, (_, i) => i)

  // Figyelmeztetések: ki csúszik, mi nem fér bele, hol túlfoglalt. Csak ha
  // a csúszás több mint 10 perc (PUFFER_PERC) — a munka nem percre pontos.
  const gondok: string[] = []
  for (const [id, p] of e.keses) {
    const m = munka.get(id)
    if (m && p > PUFFER_PERC) gondok.push(`${m.cimke}: ${idotartam(Math.round(p))}-cel később lesz kész, mint ahogy viszik`)
  }
  for (const [id, p] of e.maradt) {
    const m = munka.get(id)
    if (p <= PUFFER_PERC) continue
    if (m && !m.kerdojeles) gondok.push(`${m.cimke}: ${idotartam(Math.round(p))} munka ma már nem fér bele`)
    if (m && m.kerdojeles) gondok.push(`${m.cimke} (???): nem fér be — ${idotartam(Math.round(p))} hiányzik`)
  }
  if (e.tulfoglalt.length > 0) {
    gondok.push(`${ido(e.tulfoglalt[0])}–${ido(e.tulfoglalt[e.tulfoglalt.length - 1] + 15)} között több `
      + 'megvárós autó van, mint ahány helyen dolgozni tudunk')
  }
  if (idoNelkul.length > 0) gondok.push(`Idő hiányzik, nem tudjuk beosztani: ${idoNelkul.join(', ')}`)

  return (
    <section className="idovonal" aria-label="Beosztás negyedórás bontásban">
      <div className="iv-fej">
        <span className="iv-cim">Beosztás</span>
        <span className="iv-jelmagyarazat">
          <span data-fajta="FIX">Megvárja</span>
          <span data-fajta="RUGALMAS">Itt hagyja</span>
          <span data-fajta="TOBBNAPOS">Többnapos</span>
          <span data-fajta="KESZ">Kész</span>
        </span>
      </div>

      <div className="iv-test">
        <div className="iv-gorget">
          <div className="iv-tabla">
            {/* órák */}
            <div className="iv-orak">
              {orak.map((t) => (
                <span key={t} style={{ left: hely(t) }}>{Math.floor(t / 60)}</span>
              ))}
            </div>

            <div className="iv-sorok">
              {sorok.map((s) => (
                <div className="iv-sor" key={s}>
                  <span className="iv-sornev">{s + 1}. hely</span>
                  <div className="iv-savtart">
                    {/* háttér: negyedórák — szünet és „nincs ember erre a helyre" sraffozva */}
                    {negyedek.map((n) => (
                      <span key={n.tol} className="iv-negyed"
                            data-ora={n.tol % 60 === 0 || undefined}
                            data-allapot={n.helyek === 0 ? 'szunet' : s >= n.helyek ? 'zarva' : undefined}
                            style={{ left: hely(n.tol), width: szel(n.tol, n.ig) }} />
                    ))}
                    {/* a munkák darabjai */}
                    {e.darabok.filter((d) => d.sor === s).map((d, i) => {
                      const m = munka.get(d.id)
                      if (!m) return null
                      const gond = (e.keses.get(d.id) ?? 0) > PUFFER_PERC || (e.maradt.get(d.id) ?? 0) > PUFFER_PERC
                      return (
                        <button key={`${d.id}-${i}`} type="button" className="iv-darab"
                                data-fajta={m.fajta} data-kerdojeles={m.kerdojeles || undefined}
                                data-keres={m.keres || undefined}
                                data-gond={gond || undefined}
                                style={{ left: hely(d.tol), width: szel(d.tol, d.ig) }}
                                title={`${m.cimke} · ${m.keres ? 'Online kérés · ' : ''}${FAJTA_NEV[m.fajta]} · ${ido(d.tol)}–${ido(d.ig)}`
                                  + (m.fajta === 'RUGALMAS' || m.fajta === 'TOBBNAPOS'
                                    ? ` · kész: ${e.kesz.has(d.id) ? ido(e.kesz.get(d.id)!) : 'ma nem'}` : '')}
                                onClick={() => onMegnyit(d.id)}>
                          <span>{m.cimke}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {/* most */}
              {maiNap && most > nyit && most < zar && (
                <span className="iv-most" style={{ left: `calc(var(--iv-nev) + (100% - var(--iv-nev)) * ${(most - nyit) / hossz})` }}
                      title={`Most: ${ido(most)}`} />
              )}
            </div>
          </div>
        </div>

        {/* a sor végén: hány Start autó fér még be */}
        {!multbeli && (
          <div className="iv-befer" data-tele={befer === 0 || undefined}>
            {startPerc ? (
              <>
                <span className="szam">{befer ? `+${befer}` : '0'}</span>
                <span className="szo">Start autó<br />fér még be</span>
                <span className="halk">{idotartam(startPerc)} / autó</span>
              </>
            ) : (
              <span className="halk">A Start munkaideje nincs megadva</span>
            )}
          </div>
        )}
      </div>

      {gondok.length > 0 && (
        <ul className="iv-gondok">
          {gondok.map((g) => <li key={g}>{g}</li>)}
        </ul>
      )}
    </section>
  )
}
