import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg, maStr, napokRovid } from '../../lib/format'
import type { StaffRow, VacationRow } from '../../lib/types'
import KinekValaszto from './KinekValaszto'

interface Urlap {
  id: string | null
  staffId: string | null
  tol: string
  ig: string
  note: string
}

const URES = (): Urlap => ({ id: null, staffId: null, tol: '', ig: '', note: '' })

const urlapbol = (v: VacationRow): Urlap => ({
  id: v.id,
  staffId: v.sajat ? null : v.staff_id,
  tol: v.from_day.slice(0, 10),
  ig: v.to_day.slice(0, 10),
  note: v.note ?? '',
})

export default function SzabadsagPanel({ teljesJogu, dolgozok, szerk, onKesz }: {
  teljesJogu: boolean
  dolgozok: StaffRow[]
  szerk: VacationRow | null
  onKesz: () => void
}) {
  const { data, user, refresh } = useApp()
  const [f, setF] = useState<Urlap>(() => (szerk ? urlapbol(szerk) : URES()))
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  useEffect(() => {
    setF(szerk ? urlapbol(szerk) : URES())
    setHiba(null)
    if (szerk) document.getElementById('szabadsag-urlap')?.scrollIntoView({ block: 'nearest' })
  }, [szerk])

  const set = <K extends keyof Urlap>(k: K, v: Urlap[K]) => setF((x) => ({ ...x, [k]: v }))

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
      onKesz()
      refresh()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setMegy(false)
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
          <KinekValaszto id="sz-kinek" ertek={f.staffId} dolgozok={dolgozok} sajatId={user.id}
                         onValt={(v) => set('staffId', v)} />
        )}

        <div className="sor-2">
          <div className="mezo">
            <label htmlFor="sz-tol">Első nap</label>
            <input id="sz-tol" className="beviteli" type="date" min={f.id ? undefined : maStr()}
                   value={f.tol}
                   onChange={(e) => {
                     const uj = e.target.value
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
            <button className="btn" onClick={() => { setF(URES()); setHiba(null); onKesz() }} disabled={megy}>
              Mégse
            </button>
          )}
          <button className="btn btn-fo" onClick={() => void ment()} disabled={!menthetE || megy}>
            {megy ? 'Mentés…' : f.id ? 'Módosítás mentése' : 'Szabadság rögzítése'}
          </button>
        </div>

      </div>
    </section>
  )
}
