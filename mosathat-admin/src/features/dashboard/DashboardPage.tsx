import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, hetCim, hibaSzoveg, maStr, napCim, napRovidCim, oraSzam } from '../../lib/format'
import { billentyuzetElore } from '../../lib/billentyuzet'
import type { DashboardSummary, Gond, MunkalapFokusz, WeekDay } from '../../lib/types'

function terheles(pct: number): 'jo' | 'szoros' | 'tele' {
  if (pct >= 90) return 'tele'
  if (pct >= 70) return 'szoros'
  return 'jo'
}

const TERHELES_SZO: Record<'jo' | 'szoros' | 'tele', string> = {
  jo: 'van hely',
  szoros: 'szoros',
  tele: 'tele',
}

const NAPOK = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']

export default function DashboardPage({ onNapra, onMegnyit, onOldal }: {
  onNapra: (nap: string) => void
  onMegnyit: (id: string, fokusz?: MunkalapFokusz) => void
  onOldal: (oldal: 'szolgaltatasok' | 'partnerek') => void
}) {
  const { data } = useApp()
  const nap = maStr()
  const [ossz, setOssz] = useState<DashboardSummary | null>(null)
  const [het, setHet] = useState<WeekDay[]>([])
  const [hiba, setHiba] = useState<string | null>(null)
  const kerSzam = useRef(0)

  const betolt = useCallback(async () => {
    const n = ++kerSzam.current
    try {
      const [d, w] = await Promise.all([data.getDashboard(nap), data.getWeekCapacity(nap)])
      if (n !== kerSzam.current) return
      setOssz(d)
      setHet(w)
      setHiba(null)
    } catch (e) {
      if (n === kerSzam.current) setHiba(hibaSzoveg(e))
    }
  }, [data, nap])

  useEffect(() => { void betolt() }, [betolt])

  useEffect(() => data.subscribe(() => void betolt()), [data, betolt])

  if (hiba && !ossz) return <div className="oldal"><div className="hibauzenet">{hiba}</div></div>
  if (!ossz) return <div className="oldal"><div className="betolt">Betöltés…</div></div>

  const ma = ossz.ma
  const csucs = Math.max(1, ...ossz.nepszeru.map((n) => n.db))
  const gondokVannak = ossz.gondok.length > 0

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Áttekintés</h2>
        <span className="oldal-datum">{napCim(nap)}</span>
      </div>
      {hiba && <div className="hibauzenet">{hiba}</div>}

      <div className="attekintes">

        <section className="panel">
          <h3>
            Ma
            <span className="fej-datum">{napRovidCim(nap)}</span>
          </h3>
          <div className="panel-torzs">
            <div className="hos">
              <div className="hos-cimke">Várható bevétel</div>
              <div className="hos-szam">{ft(ma.bevetel)}</div>
              <div className="hos-alatt">
                {ma.db === 0
                  ? 'Ma nincs foglalás.'
                  : `${ma.db} autó · ebből ${ma.kesz} kész`}
              </div>
            </div>

            <div className="csempek">
              <Csempe cimke="Autók" ertek={String(ma.db)} />
              <Csempe cimke="Foglalt munka" ertek={oraSzam(ma.percek)} />
              <Csempe cimke="Kész" ertek={`${ma.kesz} / ${ma.db}`} />
            </div>

            <div className="het-osszeg">
              Ezen a héten <strong>{ossz.het.db} autó</strong>, {ft(ossz.het.bevetel)}
            </div>
          </div>
        </section>

        <section className="panel">
          <h3>
            A hét kapacitása
            <span className="fej-datum">{hetCim(nap)}</span>
          </h3>
          <div className="panel-torzs">
            <p className="halk" style={{ fontSize: 'var(--m-xs)', marginBottom: 'var(--t3)' }}>
              A lefoglalt munka a napi kapacitás arányában. A kapacitás a munkaidőből
              és a párhuzamosan mosott autók számából jön, nem a nyitvatartásból.
            </p>
            <div className="meterek">
              {het.map((d) => <MeterSor key={d.nap} d={d} ma={ossz.nap.slice(0, 10)} onNapra={onNapra} />)}
            </div>
          </div>
        </section>

        <section className={`panel${gondokVannak ? '' : ' teljes-sor'}`}>
          <h3>Leggyakoribb az elmúlt 90 napban</h3>
          <div className="panel-torzs">
            {ossz.nepszeru.length === 0 ? (
              <p className="halk" style={{ fontSize: 'var(--m-sm)' }}>
                Még nincs elég lezárt munka.
              </p>
            ) : (
              <div className="rangsor">
                {ossz.nepszeru.map((n) => (
                  <div className="rangsor-sor" key={n.nev}>
                    <div className="rangsor-nev">{n.nev}</div>
                    <div className="rangsor-sav">
                      <div className="rud" style={{ width: `${(n.db / csucs) * 100}%` }} />
                    </div>
                    <div className="rangsor-szam">{n.db}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {gondokVannak && (
          <section className="panel">
            <h3>Figyelmet igényel</h3>
            <div className="panel-torzs">
              <ul className="gondok">
                {ossz.gondok.map((g, i) => (
                  <GondSor key={i} g={g} onMegnyit={onMegnyit} onOldal={onOldal} />
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function GondSor({ g, onMegnyit, onOldal }: {
  g: Gond
  onMegnyit: (id: string, fokusz?: MunkalapFokusz) => void
  onOldal: (oldal: 'szolgaltatasok' | 'partnerek') => void
}) {
  const fokusz: MunkalapFokusz | undefined = g.cel === 'telefon' ? 'telefon' : undefined
  const foglalasok = g.foglalasok ?? []

  function nyit(id: string) {
    if (fokusz === 'telefon') billentyuzetElore('tel')
    onMegnyit(id, fokusz)
  }

  const tartalom = (
    <>
      <span className="jel" aria-hidden="true">{g.suly >= 3 ? '!' : '•'}</span>
      <span className="cimke">{g.cimke}</span>
      <span className="szoveg">{g.szoveg}</span>
    </>
  )

  const egyCel = foglalasok.length === 1
    ? () => nyit(foglalasok[0].id)
    : g.cel === 'szolgaltatasok' || g.cel === 'partnerek'
      ? () => onOldal(g.cel as 'szolgaltatasok' | 'partnerek')
      : null

  if (egyCel) {
    return (
      <li data-suly={g.suly} className="kattinthato">
        <button type="button" className="gond-sor" onClick={egyCel}>{tartalom}</button>
      </li>
    )
  }

  return (
    <li data-suly={g.suly}>
      {tartalom}
      {foglalasok.length > 1 && (
        <span className="gond-rendszamok">
          {foglalasok.map((f) => (
            <button key={f.id} type="button" className="gond-rendszam" onClick={() => nyit(f.id)}
                    title={`${napRovidCim(f.service_date.slice(0, 10))} — megnyitás`}>
              {f.plate_raw}
            </button>
          ))}
        </span>
      )}
    </li>
  )
}

function Csempe({ cimke, ertek }: { cimke: string; ertek: string }) {
  return (
    <div>
      <div className="csempe-cimke">{cimke}</div>
      <div className="csempe-ertek">{ertek}</div>
    </div>
  )
}

function MeterSor({ d, ma, onNapra }: {
  d: WeekDay
  ma: string
  onNapra: (nap: string) => void
}) {
  const [nyitva, setNyitva] = useState(false)
  const idozito = useRef<number | undefined>(undefined)

  const datum = d.nap.slice(0, 10)
  const zarva = d.capacity_minutes === 0
  const pct = d.load_pct ?? 0
  const allapot = terheles(pct)
  const kitoltes = Math.min(100, pct)

  function mutat(be: boolean) {
    window.clearTimeout(idozito.current)
    if (be) setNyitva(true)
    else idozito.current = window.setTimeout(() => setNyitva(false), 80)
  }

  return (
    <div
      className="meter-sor"
      data-allapot={zarva ? 'zarva' : allapot}
      data-ma={datum === ma || undefined}
      onMouseEnter={() => mutat(true)}
      onMouseLeave={() => mutat(false)}
      onFocus={() => mutat(true)}
      onBlur={() => mutat(false)}
    >
      <button className="meter-nap" onClick={() => onNapra(datum)}>
        <span className="nev">{NAPOK[d.hetfotol] ?? ''}</span>
        <span className="datum">{napRovidCim(datum)}</span>
      </button>

      <div className="meter-sav" aria-hidden="true">
        {!zarva && <div className="meter-toltes" style={{ width: `${kitoltes}%` }} />}
      </div>

      <div className="meter-ertek">
        {zarva
          ? <span className="halvany">Zárva</span>
          : <>{Math.round(pct)}%<span className="csak-felolvaso">, {TERHELES_SZO[allapot]}</span></>}
      </div>

      {nyitva && (
        <output className="meter-sugo">
          {zarva ? (
            d.booked_minutes > 0
              ? <>Zárva, mégis van rá <strong>{oraSzam(d.booked_minutes)}</strong> munka
                  felvéve. Ha ledolgozós nap, vedd fel kivételnapként a Beállításokban.</>
              : <>Ezen a napon zárva vagyunk.</>
          ) : (
            <>
              <strong>{oraSzam(d.booked_minutes)}</strong> munka {oraSzam(d.capacity_minutes)}-ból
              {' · '}{d.parallel_slots} autó egyszerre
              <br />
              Szabad: <strong>{oraSzam(d.free_minutes)}</strong> · {TERHELES_SZO[allapot]}
            </>
          )}
        </output>
      )}
    </div>
  )
}
