import { ft, idoRovid, idotartam } from '../../lib/format'
import type { DayAbsence, DayCapacity, WorkWindow } from '../../lib/types'
import { valtozasSzoveg } from '../../lib/munkaido'

// ---------------------------------------------------------------------------
//  A nap kártyája: kapacitás + a nap számai + ki mikor van bent
//
//  Eddig két külön kártya volt (Kapacitás és A nap), és a kettő mást
//  számolt: az egyik csak a mosóba beálló munkát, a másik minden foglalást.
//  Így a „7 autó" mellett 40% állt, ami nem stimmelt. Most mindkét szám
//  ugyanabból a day_capacity()-ből jön, és egy kártyán van.
//
//  A kapacitás egyszerű mérleg:
//
//      munkaidő × párhuzamosan mosható autók × 1,2
//      × a jelenlét szorzója (ha valaki hiányzik: 1 fő → 80%, 2 fő → 40%)
//
//  Ki mit lát:
//    - mindenki: a százalék, a szabad idő, a munkaidő, az autók száma, és
//      kinek változik aznap a munkaideje („Gábor: 16:00-ig")
//    - csak a tulajdonos és a fejlesztő: a várható bevétel és a lekötött
//      munka órában — ezek üzleti számok, az Áttekintésben is ott vannak
// ---------------------------------------------------------------------------

export default function CapacityPanel({
  c,
  windows,
  valtozasok,
  kesz,
  teljesJogu,
  ma,
}: {
  c: DayCapacity
  windows: WorkWindow[]
  valtozasok: DayAbsence[]
  /** Hány autó készült el aznap (a lista állapotaiból). */
  kesz: number
  /** Tulajdonos vagy fejlesztő: látja a bevételt és a lekötött órákat. */
  teljesJogu: boolean
  /** A mai napot nézzük-e („Gábor ma: 16:00-ig"). */
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

        {/* Ha valaki hiányzik, a kapacitás kisebb a szokásosnál — ki kell
            mondani, mennyivel, különben a százalék „magától" ugrik. */}
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

      {/* Ki mikor van bent. Az alkalmazottak a Profilom alatt írják be;
          itt mindenki látja, és a kapacitás is ebből számol. */}
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

      <div className="kapacitas-lab">
        <span>{c.parallel_slots} autó egyszerre</span>
        {c.staff_total > 0 && <span>{c.staff_total} alkalmazott</span>}
      </div>
    </div>
  )
}
