import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { maStr, napokRovid } from '../../lib/format'
import type { StaffRow, VacationRow } from '../../lib/types'
import { useKerdes } from '../common/Kerdes'

// ---------------------------------------------------------------------------
//  Profilom → Szabadság
//
//  Előre beírható, ki melyik napra / napokra megy szabadságra:
//
//      Első nap    [2026-11-10]
//      Utolsó nap  [2026-11-13]     (egy napnál ugyanaz, mint az első)
//      Megjegyzés  [            ]
//                              [Szabadság rögzítése]
//
//  Ahol megjelenik:
//    - a napi nézet kapacitás-kártyáján, a következő egy hónapra összesítve
//      („Szabadság — Gábor: nov. 10–13.")
//    - a havi naptárban rózsaszín sávként, mint a többnapos autók
//    - a kapacitásban: aki szabadságon van, aznap egész nap hiányzik
//
//  Az alkalmazott a sajátját írja be és látja; a tulajdonos és a fejlesztő
//  bárkinek beírhatja, és mindenkiét látja a listában.
// ---------------------------------------------------------------------------

interface Urlap {
  id: string | null
  staffId: string | null       // null = én magam
  tol: string
  ig: string
  note: string
}

const URES = (): Urlap => ({ id: null, staffId: null, tol: '', ig: '', note: '' })

export default function SzabadsagPanel({ teljesJogu, dolgozok }: {
  /** Tulajdonos vagy fejlesztő: másnak is beírhatja. */
  teljesJogu: boolean
  /** A „Kinek" választóhoz (csak a tulajdonosnak). */
  dolgozok: StaffRow[]
}) {
  const { data, user, refresh } = useApp()
  const [lista, setLista] = useState<VacationRow[] | null>(null)
  const [f, setF] = useState<Urlap>(URES)
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [kerdesAblak, kerdez] = useKerdes()

  const betolt = useCallback(async () => {
    try {
      setLista(await data.listVacations())
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }, [data])

  useEffect(() => { void betolt() }, [betolt])

  const set = <K extends keyof Urlap>(k: K, v: Urlap[K]) => setF((x) => ({ ...x, [k]: v }))

  // Az utolsó nap üresen hagyva = egy nap (ugyanaz, mint az első).
  const ig = f.ig || f.tol
  const rosszSorrend = Boolean(f.tol && ig && ig < f.tol)
  const menthetE = Boolean(f.tol) && !rosszSorrend

  async function ment() {
    if (!menthetE || megy) return
    setMegy(true)
    setHiba(null)
    try {
      await data.setVacation({
        id: f.id, staff_id: f.staffId, from_day: f.tol, to_day: ig, note: f.note.trim() || null,
      })
      setF(URES())
      await betolt()
      refresh()       // a napi kártya és a havi naptár is utánamegy
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMegy(false)
    }
  }

  function modosit(v: VacationRow) {
    setF({
      id: v.id,
      staffId: v.sajat ? null : v.staff_id,
      tol: v.from_day.slice(0, 10),
      ig: v.to_day.slice(0, 10),
      note: v.note ?? '',
    })
    setHiba(null)
    document.getElementById('szabadsag-urlap')?.scrollIntoView({ block: 'nearest' })
  }

  async function torol(v: VacationRow) {
    if (!(await kerdez({
      cim: 'Biztosan törlöd?',
      szoveg: `${v.sajat ? 'Szabadság' : `${v.staff_name} szabadsága`}: ${napokRovid(v.from_day, v.to_day)}`,
      igen: 'Törlés', nem: 'Mégse', veszelyes: true,
    }))) return
    try {
      await data.deleteVacation(v.id)
      if (f.id === v.id) setF(URES())
      await betolt()
      refresh()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  if (!user) return null

  return (
    <section className="panel" id="szabadsag-urlap">
      <h3>{f.id ? 'Szabadság módosítása' : 'Szabadság'}</h3>
      <div className="panel-torzs profil-urlap">
        <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>
          A napi nézet kártyáján és a havi naptárban is megjelenik, és a nap
          kapacitása is kevesebb lesz, amíg nem vagy bent.
        </p>

        {teljesJogu && dolgozok.length > 0 && (
          <div className="mezo">
            <label htmlFor="sz-kinek">Kinek</label>
            <select id="sz-kinek" className="beviteli" value={f.staffId ?? ''}
                    onChange={(e) => set('staffId', e.target.value || null)}>
              <option value="">Nekem</option>
              {dolgozok.filter((d) => d.id !== user.id).map((d) => (
                <option key={d.id!} value={d.id!}>{d.full_name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="sor-2">
          <div className="mezo">
            <label htmlFor="sz-tol">Első nap</label>
            <input id="sz-tol" className="beviteli" type="date" min={f.id ? undefined : maStr()}
                   value={f.tol}
                   onChange={(e) => {
                     const uj = e.target.value
                     // Ha az utolsó nap korábbra kerülne, vele megy.
                     setF((x) => ({ ...x, tol: uj, ig: x.ig && x.ig < uj ? uj : x.ig }))
                   }} />
          </div>
          <div className="mezo">
            <label htmlFor="sz-ig">Utolsó nap</label>
            <input id="sz-ig" className="beviteli" type="date" min={f.tol || maStr()}
                   value={f.ig} placeholder="ugyanaz"
                   onChange={(e) => set('ig', e.target.value)} />
          </div>
        </div>
        {f.tol && (
          <div className="halk" style={{ fontSize: 'var(--m-xs)' }}>
            {rosszSorrend ? 'Az utolsó nap nem lehet korábban, mint az első.' : napokRovid(f.tol, ig)}
          </div>
        )}

        <div className="mezo">
          <label htmlFor="sz-megj">Megjegyzés</label>
          <input id="sz-megj" className="beviteli" value={f.note} placeholder="nem kötelező"
                 onChange={(e) => set('note', e.target.value)} />
        </div>

        {hiba && <div className="hibauzenet">{hiba}</div>}

        <div className="sor-gombok">
          {f.id && (
            <button className="btn" onClick={() => { setF(URES()); setHiba(null) }} disabled={megy}>
              Mégse
            </button>
          )}
          <button className="btn btn-fo" onClick={() => void ment()} disabled={!menthetE || megy}>
            {megy ? 'Mentés…' : f.id ? 'Módosítás mentése' : 'Szabadság rögzítése'}
          </button>
        </div>

        {/* a beírt szabadságok, a mai naptól */}
        <div className="szabadsag-lista-cim">
          {teljesJogu ? 'Beírt szabadságok — mindenki' : 'Beírt szabadságaim'}
        </div>
        {lista === null && <div className="betolt">Betöltés…</div>}
        {lista?.length === 0 && <div className="ures">Nincs beírt szabadság a mai naptól.</div>}
        <ul className="valtozas-lista">
          {lista?.map((v) => (
            <li key={v.id} data-szerk={f.id === v.id || undefined}>
              <div className="valtozas-szoveg">
                <strong>{napokRovid(v.from_day, v.to_day)}</strong>
                <span>
                  {!v.sajat && <>{v.staff_name}</>}
                  {v.note && <span className="halk">{!v.sajat ? ' · ' : ''}{v.note}</span>}
                </span>
              </div>
              <div className="valtozas-gombok">
                <button className="btn btn-kicsi" onClick={() => modosit(v)}>Módosítás</button>
                <button className="btn btn-kicsi btn-veszelyes" onClick={() => void torol(v)}>Törlés</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {kerdesAblak}
    </section>
  )
}
