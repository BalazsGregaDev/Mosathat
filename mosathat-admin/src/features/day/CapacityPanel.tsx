import { ft, idoRovid, idotartam, napokRovid } from '../../lib/format'
import type { DayAbsence, DayCapacity, VacationRow, WorkWindow } from '../../lib/types'
import { valtozasSzoveg } from '../../lib/munkaido'

export default function CapacityPanel({
  c,
  windows,
  valtozasok,
  szabadsagok = [],
  kesz,
  teljesJogu,
  ma,
}: {
  c: DayCapacity
  windows: WorkWindow[]
  valtozasok: DayAbsence[]
  szabadsagok?: VacationRow[]
  kesz: number
  teljesJogu: boolean
  ma: boolean
}) {
  const zarva = c.capacity_minutes === 0 && windows.length === 0
  const pct = c.load_pct ?? 0
  const szazalek = Math.min(pct, 100)
  const allapot = pct >= 100 ? 'tulcsordul' : pct >= 85 ? 'true' : 'false'
  const letszamCsokken = c.staff_pct != null && c.staff_pct < 100

  return (
    <div className="kapacitas">
      <div className="kapacitas-fej">
        <div>
          <div className="cimke">Kapacitás</div>
          <div className="ertek szam">
            {zarva ? '—' : Math.round(pct)}
            {!zarva && <small>%</small>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="halk" style={{ fontSize: 'var(--m-xs)' }}>szabad</div>
          <div style={{ fontWeight: 600 }}>{idotartam(c.free_minutes)}</div>
        </div>
      </div>

      <div className="savtart" data-tele={allapot}>
        <div className="betelt" style={{ width: `${szazalek}%` }} />
      </div>

      <div className="kapacitas-adatok">
        <div className="adatsor">
          <span>Munkaidő</span>
          <span className="ertek">
            {windows.length > 0
              ? `${windows[0].starts.slice(0, 5)}–${windows[windows.length - 1].ends.slice(0, 5)}`
              : 'zárva'}
          </span>
        </div>
        <div className="adatsor">
          <span>Autó</span>
          <span className="ertek">
            {c.cars}
            {kesz > 0 && <span className="halk"> ({kesz} kész)</span>}
          </span>
        </div>

        {teljesJogu && (
          <>
            <div className="adatsor">
              <span>Várható bevétel</span>
              <span className="ertek">{ft(c.revenue_huf)}</span>
            </div>
            <div className="adatsor">
              <span>Lekötött munka</span>
              <span className="ertek">
                {idoRovid(c.booked_minutes)} / {idoRovid(c.capacity_minutes)} óra
              </span>
            </div>
          </>
        )}

        {letszamCsokken && (
          <div className="adatsor">
            <span>Létszám</span>
            <span className="ertek">
              {Math.round(c.staff_pct ?? 100)}%
              <span className="halk"> · a teljes nap {idoRovid(c.base_capacity_minutes)} óra lenne</span>
            </span>
          </div>
        )}
      </div>

      {valtozasok.length > 0 && (
        <ul className="munkaido-valtozasok">
          {valtozasok.map((a) => (
            <li key={a.id} data-szamit={a.szamit}>
              <strong>{a.staff_name}{ma ? ' ma' : ''}:</strong> {valtozasSzoveg(a)}
              {a.note && <span className="halk"> · {a.note}</span>}
            </li>
          ))}
        </ul>
      )}

      {szabadsagok.length > 0 && (
        <div className="szabadsag-blokk">
          <div className="cimke">Szabadság</div>
          <ul>
            {szabadsagSorok(szabadsagok).map((s) => (
              <li key={s.id}>
                <strong>{s.nev}:</strong> {s.idoszakok.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="kapacitas-lab">
        <span>{c.parallel_slots} autó egyszerre</span>
        {c.staff_total > 0 && <span>{c.staff_total} alkalmazott</span>}
      </div>
    </div>
  )
}

function szabadsagSorok(lista: VacationRow[]): { id: string; nev: string; idoszakok: string[] }[] {
  const m = new Map<string, { id: string; nev: string; idoszakok: string[] }>()
  for (const v of lista) {
    const sor = m.get(v.staff_id) ?? { id: v.staff_id, nev: v.staff_name, idoszakok: [] }
    sor.idoszakok.push(napokRovid(v.from_day, v.to_day))
    m.set(v.staff_id, sor)
  }
  return [...m.values()]
}
