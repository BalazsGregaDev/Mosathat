import { useMemo } from 'react'

import { useDay } from '../../state/useDay'
import { ft, idotartam, ora } from '../../lib/format'
import type { DayBooking, WorkWindow } from '../../lib/types'
import BookingCard from './BookingCard'
import CapacityPanel from './CapacityPanel'
import StandingCars from './StandingCars'

// ---------------------------------------------------------------------------
//  A nap.
//
//  Óránkénti sávok, mert a műhelyben így gondolkodnak: "nyolcra jön a BMW".
//  A sávok határát nem beégetett 8–17 adja, hanem a work_windows() — így a
//  ledolgozós szombat és az ünnep körüli rendkívüli nyitvatartás magától
//  helyes, és az ebédszünet is ott van, ahol aznap tényleg van.
// ---------------------------------------------------------------------------

/** Egy foglalás melyik órasávba kerül. A kezdés, vagy ha nincs, a leadás. */
function oraja(b: DayBooking): number | null {
  const iso = b.start_at ?? b.drop_off_at
  if (!iso) return null
  const d = new Date(iso)
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', hour12: false, timeZone: 'Europe/Budapest',
    }).format(d),
  )
}

function oraSzam(t: string): number {
  return Number(t.slice(0, 2))
}

export default function DayView({
  nap,
  onMegnyit,
}: {
  nap: string
  onMegnyit: (id: string) => void
}) {
  const { bookings, capacity, windows, standing, loading, error } = useDay(nap)

  // --- órasávok felépítése --------------------------------------------------
  const sorok = useMemo(() => {
    if (windows.length === 0) return []
    const elso = Math.min(...windows.map((w) => oraSzam(w.starts)))
    const utolso = Math.max(...windows.map((w) => oraSzam(w.ends)))
    const szunetben = (h: number) => !windows.some((w: WorkWindow) => h >= oraSzam(w.starts) && h < oraSzam(w.ends))

    const ki: { ora: number; szunet: boolean; elemek: DayBooking[] }[] = []
    for (let h = elso; h < utolso; h++) {
      ki.push({ ora: h, szunet: szunetben(h), elemek: [] })
    }
    // Ami a nyitás előtt vagy zárás után van (korai leadás), az első sávba kerül.
    for (const b of bookings) {
      const h = oraja(b)
      const cel = ki.find((s) => s.ora === h) ?? ki[0]
      if (cel) cel.elemek.push(b)
    }
    return ki
  }, [windows, bookings])

  // --- napi összegek --------------------------------------------------------
  const osszeg = useMemo(() => {
    const elo = bookings.filter(
      (b) => !['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW', 'REJECTED'].includes(b.status),
    )
    return {
      db: elo.length,
      bevetel: elo.reduce((s, b) => s + (b.final_price_huf ?? b.estimated_price_huf), 0),
      perc: elo.reduce((s, b) => s + b.planned_duration_minutes, 0),
      kesz: elo.filter((b) => b.status === 'COMPLETED').length,
    }
  }, [bookings])

  // --- nyitvatartáson kívül végzett munka ------------------------------------
  //  Nem kell hozzá külön adatrögzítés: a munkalépések kipipálásának
  //  időpontja megmondja, mikor készült a munka. Ha az első vagy az utolsó
  //  pipa a munkaidő-sávokon kívülre esik, az kereskedős / hajnali munka.
  const idonKivul = useMemo(() => {
    if (windows.length === 0) return []
    const nyit = Math.min(...windows.map((w) => oraSzam(w.starts)))
    const zar = Math.max(...windows.map((w) => oraSzam(w.ends)))
    // Külön név kell: fent már van egy oraja(), ami foglalásból dolgozik.
    // Ez időbélyegből.
    const oraIsobol = (iso: string) =>
      Number(
        new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit', hour12: false, timeZone: 'Europe/Budapest',
        }).format(new Date(iso)),
      )
    return bookings.filter((b) => {
      if (!b.first_done_at || !b.last_done_at) return false
      return oraIsobol(b.first_done_at) < nyit || oraIsobol(b.last_done_at) >= zar
    })
  }, [bookings, windows])

  // --- figyelmet igényel ----------------------------------------------------
  const gondok = useMemo(() => {
    const ki: { szoveg: string; sulyos: boolean }[] = []

    // Ha a calc_service nem tudta az időt (csak kívül / csak belül), nulla
    // kerül be — és a nulla azt jelentené, hogy a munka nem foglal helyet.
    // Ezt látni kell, nem elhallgatni.
    const nincsIdo = bookings.filter(
      (b) => b.planned_duration_minutes === 0 && b.status !== 'COMPLETED',
    )
    if (nincsIdo.length) {
      ki.push({
        szoveg: `${nincsIdo.length} foglalásnak nincs időtartama (${nincsIdo
          .map((b) => b.plate_raw)
          .join(', ')}) — a kapacitásba nem számít bele`,
        sulyos: true,
      })
    }

    const nincsTel = bookings.filter((b) => !b.customer_phone || b.customer_phone === '—')
    if (nincsTel.length) {
      ki.push({ szoveg: `${nincsTel.length} foglaláshoz nincs telefonszám`, sulyos: false })
    }

    if (capacity && capacity.load_pct >= 90) {
      ki.push({
        szoveg: `A nap ${Math.round(capacity.load_pct)}%-on áll — alig van hely`,
        sulyos: capacity.load_pct >= 100,
      })
    }

    const surgos = standing.filter((s) => s.urgent)
    for (const s of surgos) {
      ki.push({
        szoveg:
          s.days_left < 0
            ? `${s.plate_raw} határideje lejárt (${Math.abs(s.days_left)} napja)`
            : `${s.plate_raw} határideje ${s.days_left === 0 ? 'ma' : 'holnap'} jár le`,
        sulyos: s.days_left < 0,
      })
    }

    return ki
  }, [bookings, capacity, standing])

  if (error) return <div className="hibauzenet">{error}</div>
  if (loading) return <div className="betolt">Betöltés…</div>

  return (
    <div className="nap-racs">
      <div>
        {sorok.length === 0 ? (
          <div className="panel">
            <div className="ures">
              Ezen a napon zárva vagyunk.
              <br />
              <span className="halvany">
                Ha mégis dolgoztok, a Beállítások → Kivételnapok alatt lehet nyitva tenni.
              </span>
            </div>
          </div>
        ) : (
          <div className="oralista">
            {sorok.map((s) => (
              <div className="ora-sor" key={s.ora} data-szunet={s.szunet && s.elemek.length === 0}>
                <div className="ora-cimke">{String(s.ora).padStart(2, '0')}:00</div>
                <div className="ora-tartalom">
                  {s.szunet && s.elemek.length === 0 ? (
                    <span className="szunet-felirat">Ebédszünet</span>
                  ) : (
                    s.elemek.map((b) => (
                      <BookingCard key={b.id} b={b} onMegnyit={() => onMegnyit(b.id)} />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="oszlop">
        {capacity && <CapacityPanel c={capacity} />}

        <div className="panel">
          <h3>A nap</h3>
          <div className="panel-torzs">
            <div className="adatsor">
              <span>Autó</span>
              <span className="ertek">
                {osszeg.db}
                {osszeg.kesz > 0 && <span className="halk"> ({osszeg.kesz} kész)</span>}
              </span>
            </div>
            <div className="adatsor">
              <span>Várható bevétel</span>
              <span className="ertek">{ft(osszeg.bevetel)}</span>
            </div>
            <div className="adatsor">
              <span>Lekötött munka</span>
              <span className="ertek">{idotartam(osszeg.perc)}</span>
            </div>
            {windows.length > 0 && (
              <div className="adatsor">
                <span>Munkaidő</span>
                <span className="ertek">
                  {windows[0].starts.slice(0, 5)}–{windows[windows.length - 1].ends.slice(0, 5)}
                </span>
              </div>
            )}
          </div>
        </div>

        {gondok.length > 0 && (
          <div className="panel">
            <h3>Figyelmet igényel</h3>
            <div className="panel-torzs">
              <ul className="figyelem" style={{ margin: 0, padding: 0 }}>
                {gondok.map((g, i) => (
                  <li key={i} data-sulyos={g.sulyos}>
                    {g.szoveg}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <StandingCars lista={standing} onMegnyit={onMegnyit} />

        {idonKivul.length > 0 && (
          <div className="panel">
            <h3>Nyitvatartáson kívül</h3>
            <div className="panel-torzs">
              {idonKivul.map((b) => (
                <div className="adatsor" key={b.id}>
                  <span className="szam">{b.plate_raw}</span>
                  <span className="ertek">
                    {ora(b.first_done_at)}–{ora(b.last_done_at)}
                  </span>
                </div>
              ))}
              <p className="halk" style={{ fontSize: 'var(--m-xs)', marginTop: 8 }}>
                A munkalépések kipipálásának időpontjából. Külön adatrögzítés nélkül.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
