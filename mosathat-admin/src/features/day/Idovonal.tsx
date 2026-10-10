import { useEffect, useMemo, useState } from 'react'

import {
  beferMeg, beoszt, munkakNapra, negyedekbol, PUFFER_PERC,
  type Munka, type MunkaFajta,
} from '../../lib/beosztas'
import { idotartam, maStr, mostPerc, percOra } from '../../lib/format'
import { munkaCimke } from '../../state/napBeosztas'
import type { DayBooking, DayLane } from '../../lib/types'

const FAJTA_NEV: Record<MunkaFajta, string> = {
  FIX: 'Megvárja',
  RUGALMAS: 'Itt hagyja',
  TOBBNAPOS: 'Többnapos (mai része)',
  KESZ: 'Kész',
}

export default function Idovonal({ nap, foglalasok, savok, startPerc, onMegnyit }: {
  nap: string
  foglalasok: DayBooking[]
  savok: DayLane[]
  startPerc: number | null
  onMegnyit: (id: string) => void
}) {
  const ma = maStr()
  const maiNap = nap === ma
  const multbeli = nap < ma
  const [most, setMost] = useState(mostPerc)
  useEffect(() => {
    if (!maiNap) return
    const t = setInterval(() => setMost(mostPerc()), 60_000)
    return () => clearInterval(t)
  }, [maiNap])

  const negyedek = useMemo(() => negyedekbol(savok), [savok])
  const nyit = negyedek[0]?.tol ?? 0
  const zar = negyedek[negyedek.length - 1]?.ig ?? 0
  const mostEkkor = maiNap ? most : null

  const { munkak, idoNelkul } = useMemo(
    () => munkakNapra(foglalasok, nap, nyit, zar, (b) => munkaCimke(b as DayBooking), mostEkkor),
    [foglalasok, nap, nyit, zar, mostEkkor],
  )
  const e = useMemo(() => beoszt(negyedek, munkak, mostEkkor), [negyedek, munkak, mostEkkor])
  const befer = useMemo(
    () => (multbeli || !startPerc ? null : beferMeg(negyedek, munkak, startPerc, mostEkkor)),
    [negyedek, munkak, startPerc, mostEkkor, multbeli],
  )

  if (negyedek.length === 0) return null

  const hossz = zar - nyit
  const hely = (p: number) => `${((p - nyit) / hossz) * 100}%`
  const szel = (a: number, b: number) => `${((b - a) / hossz) * 100}%`
  const munka = new Map<string, Munka>(munkak.map((m) => [m.id, m]))
  const orak: number[] = []
  for (let t = Math.ceil(nyit / 60) * 60; t <= zar; t += 60) orak.push(t)
  const sorok = Array.from({ length: Math.max(1, e.sorok) }, (_, i) => i)

  const gondok: string[] = []
  for (const [id, p] of e.keses) {
    const m = munka.get(id)
    if (m && p > PUFFER_PERC) gondok.push(`${m.cimke}: ${idotartam(Math.round(p))}-cel később lesz kész, mint ahogy viszik`)
  }
  const zarasUtan = maiNap && most >= zar
  const nemKesz: string[] = []
  for (const [id, p] of e.maradt) {
    const m = munka.get(id)
    if (p <= PUFFER_PERC) continue
    if (zarasUtan) { if (m) nemKesz.push(m.cimke); continue }
    if (m && !m.kerdojeles) gondok.push(`${m.cimke}: ${idotartam(Math.round(p))} munka ma már nem fér bele`)
    if (m && m.kerdojeles) gondok.push(`${m.cimke} (???): nem fér be — ${idotartam(Math.round(p))} hiányzik`)
  }
  if (nemKesz.length > 0) {
    gondok.push(`A mai munkaidő véget ért. Még nincs Kész-nek jelölve: ${nemKesz.join(', ')}`)
  }
  if (e.tulfoglalt.length > 0) {
    gondok.push(`${percOra(e.tulfoglalt[0])}–${percOra(e.tulfoglalt[e.tulfoglalt.length - 1] + 15)} között több `
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
                    {negyedek.map((n) => (
                      <span key={n.tol} className="iv-negyed"
                            data-ora={n.tol % 60 === 0 || undefined}
                            data-allapot={n.helyek === 0 ? 'szunet' : s >= n.helyek ? 'zarva' : undefined}
                            style={{ left: hely(n.tol), width: szel(n.tol, n.ig) }} />
                    ))}
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
                                title={`${m.cimke} · ${m.keres ? 'Online kérés · ' : ''}${FAJTA_NEV[m.fajta]} · ${percOra(d.tol)}–${percOra(d.ig)}`
                                  + (m.fajta === 'RUGALMAS' || m.fajta === 'TOBBNAPOS'
                                    ? ` · kész: ${e.kesz.has(d.id) ? percOra(e.kesz.get(d.id)!) : 'ma nem'}` : '')}
                                onClick={() => onMegnyit(d.id)}>
                          <span>{m.cimke}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {maiNap && most > nyit && most < zar && (
                <span className="iv-most" style={{ left: `calc(var(--iv-nev) + (100% - var(--iv-nev)) * ${(most - nyit) / hossz})` }}
                      title={`Most: ${percOra(most)}`} />
              )}
            </div>
          </div>
        </div>

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
          {gondok.map((g, i) => <li key={i}>{g}</li>)}
        </ul>
      )}
    </section>
  )
}
