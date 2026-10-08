import { useMemo } from 'react'

import { useApp } from '../../state/AppContext'
import { useDay } from '../../state/useDay'
import { helyiNap, maE, ora } from '../../lib/format'
import { billentyuzetElore } from '../../lib/billentyuzet'
import type { DayBooking, MunkalapFokusz } from '../../lib/types'
import CapacityPanel from './CapacityPanel'
import NapiLista from './NapiLista'
import { flottaCsoportosit } from '../../lib/flotta'
import StandingCars from './StandingCars'
import Idovonal from './Idovonal'

// ---------------------------------------------------------------------------
//  A nap.
//
//  Bal oldalt a nap EGY listája, abban a sorrendben, ahogy dolgozunk —
//  kézzel átrendezhető (NapiLista). A többnapos munkák a nap minden napján
//  ott vannak, nem csak az elsőn.
//
//  Jobb oldalt (telefonon alatta) a nap kártyája: kapacitás, autók, ki
//  mikor van bent; alatta ami figyelmet igényel, és a nálunk álló autók.
// ---------------------------------------------------------------------------

/** Ami nem él: lemondott, nem jött el. Ezek nem számítanak sehova. */
const NEM_EL = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW', 'REJECTED']

/** Egy figyelmeztetés a napi listán, és mire lehet kattintani benne. */
interface NapiGond {
  szoveg: string
  sulyos: boolean
  /** Az érintett foglalások — mindegyik egy gomb a rendszámával. */
  foglalasok?: DayBooking[]
  /** Mit nyisson meg a munkalap rögtön (pl. a telefonszám mezőt). */
  fokusz?: MunkalapFokusz
}

function oraSzam(t: string): number {
  return Number(t.slice(0, 2))
}

export default function DayView({
  nap,
  onMegnyit,
}: {
  nap: string
  onMegnyit: (id: string, fokusz?: MunkalapFokusz) => void
}) {
  const { user } = useApp()
  const {
    bookings, capacity, windows, standing, absences, vacations, lanes, startPerc,
    loading, error, modosit, atrendez,
  } = useDay(nap)

  const teljesJogu = user?.role === 'SUPERADMIN' || user?.role === 'TULAJDONOS'

  const kesz = useMemo(
    () => bookings.filter((b) => b.status === 'COMPLETED').length,
    [bookings],
  )

  // --- nyitvatartáson kívül végzett munka ------------------------------------
  //  Nem kell hozzá külön adatrögzítés: a munkalépések kipipálásának
  //  időpontja megmondja, mikor készült a munka. Ha az első vagy az utolsó
  //  pipa a munkaidő-sávokon kívülre esik, az kereskedős / hajnali munka.
  const idonKivul = useMemo(() => {
    if (windows.length === 0) return []
    const nyit = Math.min(...windows.map((w) => oraSzam(w.starts)))
    const zar = Math.max(...windows.map((w) => oraSzam(w.ends)))
    const oraIsobol = (iso: string) =>
      Number(
        new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit', hour12: false, timeZone: 'Europe/Budapest',
        }).format(new Date(iso)),
      )
    return bookings.filter((b) => {
      if (!b.first_done_at || !b.last_done_at) return false
      // Csak az aznapi pipák számítanak: a többnapos munka tegnapi pipái
      // nem mondanak semmit a mai napról.
      if (helyiNap(b.last_done_at) !== nap) return false
      return oraIsobol(b.first_done_at) < nyit || oraIsobol(b.last_done_at) >= zar
    })
  }, [bookings, windows, nap])

  // --- figyelmet igényel ----------------------------------------------------
  //  Minden sor, ami foglaláshoz kötődik, kattintható: a rendszámra bökve
  //  megnyílik a munkalap. A telefonszám nélkülinél rögtön a telefon mezővel.
  const gondok = useMemo(() => {
    const ki: NapiGond[] = []
    const elo = bookings.filter((b) => !NEM_EL.includes(b.status))

    // Ha a calc_service nem tudta az időt (csak kívül / csak belül), nulla
    // kerül be — és a nulla azt jelentené, hogy a munka nem foglal helyet.
    const nincsIdo = elo.filter((b) => b.planned_duration_minutes === 0 && b.status !== 'COMPLETED')
    if (nincsIdo.length) {
      ki.push({
        szoveg: `${nincsIdo.length} foglalásnak nincs időtartama — a kapacitásba nem számít bele`,
        sulyos: true,
        foglalasok: nincsIdo,
      })
    }

    const nincsTel = elo.filter((b) => !b.customer_phone || b.customer_phone.trim() === '—')
    if (nincsTel.length) {
      ki.push({
        szoveg: `${nincsTel.length} foglaláshoz nincs telefonszám`,
        sulyos: false,
        foglalasok: nincsTel,
        fokusz: 'telefon',
      })
    }

    if (capacity && capacity.load_pct >= 90) {
      ki.push({
        szoveg: `A nap ${Math.round(capacity.load_pct)}%-on áll — alig van hely`,
        sulyos: capacity.load_pct >= 100,
      })
    }

    for (const s of standing.filter((x) => x.urgent)) {
      ki.push({
        szoveg:
          s.days_left < 0
            ? `${s.plate_raw} határideje lejárt (${Math.abs(s.days_left)} napja)`
            : `${s.plate_raw} határideje ${s.days_left === 0 ? 'ma' : 'holnap'} jár le`,
        sulyos: s.days_left < 0,
        // A nálunk álló autó listájából elég az azonosító a megnyitáshoz.
        foglalasok: [{ id: s.id, plate_raw: s.plate_raw } as DayBooking],
      })
    }

    return ki
  }, [bookings, capacity, standing])

  /** Kattintás egy figyelmeztetés rendszámára. */
  function gondMegnyit(id: string, fokusz?: MunkalapFokusz) {
    // A telefon billentyűzetét MOST kell előhívni, a kattintáson belül —
    // a munkalap csak egy pillanat múlva jelenik meg.
    if (fokusz === 'telefon') billentyuzetElore('tel')
    onMegnyit(id, fokusz)
  }

  if (error) return <div className="hibauzenet">{error}</div>
  if (loading) return <div className="betolt">Betöltés…</div>

  const zarva = windows.length === 0

  return (
    <div className="nap-racs">
      <div>
        {zarva && bookings.length > 0 && (
          <div className="figyelmeztet" style={{ marginBottom: 'var(--t3)' }}>
            <span>
              <strong>Ez a nap hivatalosan zárva van</strong>.
            </span>
          </div>
        )}

        {/* Az első kártya helyén: a nap beosztása negyedórás bontásban, és
            hogy hány Start autó fér még be (lásd Idovonal.tsx). */}
        <Idovonal nap={nap} foglalasok={bookings} savok={lanes} startPerc={startPerc}
                  onMegnyit={(id) => onMegnyit(id)} />

        {bookings.length === 0 ? (
          <div className="panel">
            <div className="ures">
              {zarva ? (
                <>
                  Ezen a napon zárva vagyunk, és nincs foglalás.
                  <br />
                  <span className="halvany">
                    Ha mégis dolgoztok, a Beállítások → Kivételnapok alatt lehet nyitva tenni.
                  </span>
                </>
              ) : 'Erre a napra még nincs foglalás.'}
            </div>
          </div>
        ) : (
          <NapiLista nap={nap} bookings={flottaCsoportosit(bookings)}
                     onMegnyit={(id) => onMegnyit(id)}
                     onModosit={modosit} onAtrendez={atrendez} />
        )}
      </div>

      <div className="oszlop">
        {capacity && (
          <CapacityPanel c={capacity} windows={windows} valtozasok={absences}
                         szabadsagok={vacations}
                         kesz={kesz} teljesJogu={teljesJogu} ma={maE(nap)} />
        )}

        {gondok.length > 0 && (
          <div className="panel">
            <h3>Figyelmet igényel</h3>
            <div className="panel-torzs">
              <ul className="figyelem" style={{ margin: 0, padding: 0 }}>
                {gondok.map((g, i) => (
                  <li key={i} data-sulyos={g.sulyos}>
                    <span className="figyelem-szoveg">
                      {g.szoveg}
                      {g.foglalasok && g.foglalasok.length > 0 && (
                        <span className="gond-rendszamok">
                          {g.foglalasok.map((b) => (
                            <button key={b.id} type="button" className="gond-rendszam"
                                    onClick={() => gondMegnyit(b.id, g.fokusz)}
                                    title={g.fokusz === 'telefon'
                                      ? 'Megnyitás, a telefonszám rögtön beírható'
                                      : 'A munkalap megnyitása'}>
                              {b.plate_raw?.toUpperCase()}
                            </button>
                          ))}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <StandingCars lista={standing} onMegnyit={(id) => onMegnyit(id)} />

        {idonKivul.length > 0 && (
          <div className="panel">
            <h3>Nyitvatartáson kívül</h3>
            <div className="panel-torzs">
              {idonKivul.map((b) => (
                <div className="adatsor" key={b.id}>
                  <span className="szam">{b.plate_raw?.toUpperCase()}</span>
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
