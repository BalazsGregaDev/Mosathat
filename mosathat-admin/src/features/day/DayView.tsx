import { useMemo } from 'react'

import { useApp } from '../../state/AppContext'
import { useDay } from '../../state/useDay'
import { helyiNap, idoPercbe, maE, ora, percEjfeltol } from '../../lib/format'
import { billentyuzetElore } from '../../lib/billentyuzet'
import { eloE, type DayBooking, type MunkalapFokusz } from '../../lib/types'
import { munkaCimke } from '../../state/napBeosztas'
import CapacityPanel from './CapacityPanel'
import NapiLista from './NapiLista'
import { flottaCsoportosit } from '../../lib/flotta'
import StandingCars from './StandingCars'
import Idovonal from './Idovonal'

interface NapiGond {
  szoveg: string
  sulyos: boolean
  foglalasok?: DayBooking[]
  fokusz?: MunkalapFokusz
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

  const idonKivul = useMemo(() => {
    if (windows.length === 0) return []
    const nyit = Math.min(...windows.map((w) => idoPercbe(w.starts)))
    const zar = Math.max(...windows.map((w) => idoPercbe(w.ends)))
    return bookings.filter((b) => {
      if (!b.first_done_at || !b.last_done_at) return false
      if (helyiNap(b.last_done_at) !== nap) return false
      return percEjfeltol(b.first_done_at) < nyit || percEjfeltol(b.last_done_at) >= zar
    })
  }, [bookings, windows, nap])

  const csoportositott = useMemo(() => flottaCsoportosit(bookings), [bookings])

  const gondok = useMemo(() => {
    const ki: NapiGond[] = []
    const elo = bookings.filter((b) => eloE(b.status))

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
        foglalasok: [{ id: s.id, plate_raw: s.plate_raw } as DayBooking],
      })
    }

    return ki
  }, [bookings, capacity, standing])

  function gondMegnyit(id: string, fokusz?: MunkalapFokusz) {
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
              <strong>Ez a nap hivatalosan zárva van</strong>, de {bookings.length} foglalás
              van rá. A kapacitás ezért nulla — a foglalások lent ott vannak.
            </span>
          </div>
        )}

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
          <NapiLista nap={nap} bookings={csoportositott}
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
                              {munkaCimke(b)}
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
                  <span className="szam">{munkaCimke(b)}</span>
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
