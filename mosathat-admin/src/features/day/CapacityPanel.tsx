import { idoRovid, idotartam } from '../../lib/format'
import type { DayCapacity } from '../../lib/types'

// A kapacitás nem slot-foglalás, hanem egyszerű mérleg:
// párhuzamosan mosható autók × tényleges munkaidő. Ebből látszik, mikor
// kezdünk a nap végére érni — és pont ennyi kell.

export default function CapacityPanel({ c }: { c: DayCapacity }) {
  const szazalek = Math.min(c.load_pct, 100)
  const allapot = c.load_pct >= 100 ? 'tulcsordul' : c.load_pct >= 85 ? 'true' : 'false'

  return (
    <div className="kapacitas">
      <div className="kapacitas-fej">
        <div>
          <div className="cimke">Kapacitás</div>
          <div className="ertek szam">
            {Math.round(c.load_pct)}
            <small>%</small>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="halk" style={{ fontSize: 'var(--m-xs)' }}>
            szabad
          </div>
          <div style={{ fontWeight: 600 }}>{idotartam(c.free_minutes)}</div>
        </div>
      </div>

      <div className="savtart" data-tele={allapot}>
        <div className="betelt" style={{ width: `${szazalek}%` }} />
      </div>

      <div className="kapacitas-lab">
        <span className="szam">
          {idoRovid(c.booked_minutes)} / {idoRovid(c.capacity_minutes)} óra
        </span>
        <span>{c.parallel_slots} autó egyszerre</span>
      </div>
    </div>
  )
}
