import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, napRovidCim, oraSzam } from '../../lib/format'
import type { DashboardSummary, WeekDay } from '../../lib/types'

// ---------------------------------------------------------------------------
//  Áttekintés
//
//  Egy szabály visz mindent: EGY nagy szám van a képernyőn. Ha három is
//  nagy, akkor egy sem nagy, és a tíz másodpercből fél perc lesz.
//
//  A nagy szám a mai várható bevétel. Minden más — hány autó, mennyi munka,
//  mennyi kész — támogató adat, kisebb betűvel, ugyanabban a panelben.
//
//  Amit a képernyő NEM tesz: nem számol. Az összesítés a dashboard_summary()
//  és a week_capacity() dolga, ugyanazokból a függvényekből, amiket a napi
//  nézet is hív. Így nincs két igazság ugyanarról a napról.
// ---------------------------------------------------------------------------

/** 70% alatt bőven van hely, 90% fölött már nem lehet mit bevállalni. */
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

// A hét napjai a week_capacity hetfotol mezője szerint. Nem formázzuk a
// dátumból: az index már az adatban benne van, és mindig stimmel.
const NAPOK = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']

export default function DashboardPage({ nap, onNapra }: {
  nap: string
  onNapra: (nap: string) => void
}) {
  const { data } = useApp()
  const [ossz, setOssz] = useState<DashboardSummary | null>(null)
  const [het, setHet] = useState<WeekDay[]>([])
  const [hiba, setHiba] = useState<string | null>(null)
  const [tolt, setTolt] = useState(true)

  const betolt = useCallback(async () => {
    try {
      const [d, w] = await Promise.all([data.getDashboard(nap), data.getWeekCapacity(nap)])
      setOssz(d)
      setHet(w)
      setHiba(null)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setTolt(false)
    }
  }, [data, nap])

  useEffect(() => { void betolt() }, [betolt])

  // Élő frissítés. Nincs csontváz-villogás: a régi adat halványodik el, amíg
  // az új megjön. Villogó képernyőt senki nem néz tíz másodpercig.
  useEffect(() => data.subscribe(() => void betolt()), [data, betolt])

  if (hiba) return <div className="oldal"><div className="hibauzenet">{hiba}</div></div>
  if (!ossz) return <div className="oldal"><div className="betolt">Betöltés…</div></div>

  const ma = ossz.ma
  const csucs = Math.max(1, ...ossz.nepszeru.map((n) => n.db))

  return (
    <div className="oldal" style={tolt ? { opacity: 0.55 } : undefined}>
      <div className="attekintes">

        {/* ---------- MA: egy nagy szám, körülötte a támogató adatok ---------- */}
        <section className="panel kiemelt">
          <h3>Ma</h3>
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

        {/* ---------- FIGYELMET IGÉNYEL ---------- */}
        <section className="panel">
          <h3>Figyelmet igényel</h3>
          <div className="panel-torzs">
            {ossz.gondok.length === 0 ? (
              <p className="halk" style={{ fontSize: 'var(--m-sm)' }}>
                Most nincs semmi, ami közbeszólna.
              </p>
            ) : (
              <ul className="gondok">
                {ossz.gondok.map((g, i) => (
                  <li key={i} data-suly={g.suly}>
                    <span className="jel" aria-hidden="true">{g.suly >= 3 ? '!' : '•'}</span>
                    <span className="cimke">{g.cimke}</span>
                    <span className="szoveg">{g.szoveg}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ---------- A HÉT KAPACITÁSA ---------- */}
      <section className="panel panelek-szeles" style={{ marginTop: 'var(--t4)' }}>
        <h3>A hét kapacitása</h3>
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

      {/* ---------- LEGGYAKORIBB ---------- */}
      <section className="panel panelek-szeles" style={{ marginTop: 'var(--t4)' }}>
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
    </div>
  )
}

/** Támogató szám a nagy szám mellé. Félkövér érték, halk címke. */
function Csempe({ cimke, ertek }: { cimke: string; ertek: string }) {
  return (
    <div className="csempe">
      <div className="csempe-cimke">{cimke}</div>
      <div className="csempe-ertek">{ertek}</div>
    </div>
  )
}

/**
 * Egy nap kapacitása. A sáv kitöltése a terhelést mutatja, a sáv háttere
 * ugyanannak a színnek a világos változata — így a sáv egésze is olvasható,
 * nem csak a kitöltött rész.
 *
 * A szám nem csak a felugró ablakban van meg: kint van a sor végén. Amit
 * csak hover mutat, azt telefonon senki nem látja.
 */
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
  // 100% fölött is van élet: a sáv nem nyúlik tovább, a szám igen.
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
      {/* A nap neve az elsődleges: "szerdán tele vagyunk" — a dátum csak
          azért kell, hogy tudd, melyik szerdáról van szó. */}
      <button className="meter-nap" onClick={() => onNapra(datum)}>
        <span className="nev">{NAPOK[d.hetfotol] ?? ''}</span>
        <span className="datum">{napRovidCim(datum)}</span>
      </button>

      {/* A sáv csak megmutatja a százalékot, ami mellette szövegben is ott van.
          Felolvasónak nincs mit hozzátennie, ezért nem is szólal meg. */}
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
