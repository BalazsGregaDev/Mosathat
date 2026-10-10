import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg, maStr, napCim } from '../../lib/format'
import { VALTOZAS_FAJTAK, valtozasSzoveg } from '../../lib/munkaido'
import {
  ROLE_LABEL,
  type AbsenceKind, type AbsenceRow, type StaffRow,
} from '../../lib/types'
import { useKerdes } from '../common/Kerdes'
import IdoMezo from '../common/IdoMezo'
import SzabadsagPanel from './SzabadsagPanel'
import KinekValaszto from './KinekValaszto'

interface Urlap {
  id: string | null
  staffId: string | null
  day: string
  kind: AbsenceKind
  starts: string
  ends: string
  note: string
}

const URES = (): Urlap => ({
  id: null, staffId: null, day: maStr(), kind: 'KESOBB_ERKEZIK', starts: '', ends: '', note: '',
})

export default function ProfilPage({ onJelszo }: {
  onJelszo: () => void
}) {
  const { data, user, signOut, refresh } = useApp()
  const teljesJogu = user?.role === 'SUPERADMIN' || user?.role === 'TULAJDONOS'
  const [lista, setLista] = useState<AbsenceRow[] | null>(null)
  const [dolgozok, setDolgozok] = useState<StaffRow[]>([])
  const [f, setF] = useState<Urlap>(URES)
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [kerdesAblak, kerdez] = useKerdes()

  const betolt = useCallback(async () => {
    try {
      setLista(await data.listAbsences())
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
  }, [data])

  useEffect(() => { void betolt() }, [betolt])

  useEffect(() => {
    if (!teljesJogu) return
    data.listStaff()
      .then((l) => setDolgozok(l.filter((d) => d.active && d.id && !d.kozos)))
      .catch(() => setDolgozok([]))
  }, [data, teljesJogu])

  const set = <K extends keyof Urlap>(k: K, v: Urlap[K]) => setF((x) => ({ ...x, [k]: v }))

  const kellTol = f.kind === 'KORABBAN_TAVOZIK' || f.kind === 'TAVOL'
  const kellIg = f.kind === 'KESOBB_ERKEZIK' || f.kind === 'TAVOL'
  const menthetE = Boolean(f.day)
    && (!kellTol || Boolean(f.starts))
    && (!kellIg || Boolean(f.ends))

  async function ment() {
    if (!menthetE || megy) return
    setMegy(true)
    setHiba(null)
    try {
      await data.setAbsence({
        id: f.id,
        staff_id: f.staffId,
        day: f.day,
        kind: f.kind,
        starts: kellTol ? f.starts : null,
        ends: kellIg ? f.ends : null,
        note: f.note.trim() || null,
      })
      setF(URES())
      await betolt()
      refresh()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setMegy(false)
    }
  }

  function modosit(a: AbsenceRow) {
    setF({
      id: a.id,
      staffId: a.sajat ? null : a.staff_id,
      day: a.day.slice(0, 10),
      kind: a.kind,
      starts: a.starts ?? '',
      ends: a.ends ?? '',
      note: a.note ?? '',
    })
    setHiba(null)
    document.getElementById('munkaido-urlap')?.scrollIntoView({ block: 'nearest' })
  }

  async function torol(a: AbsenceRow) {
    if (!(await kerdez({
      cim: 'Biztosan törlöd?',
      szoveg: `${napCim(a.day.slice(0, 10))}: ${valtozasSzoveg(a)}`,
      igen: 'Törlés', nem: 'Mégse', veszelyes: true,
    }))) return
    try {
      await data.deleteAbsence(a.id)
      if (f.id === a.id) setF(URES())
      await betolt()
      refresh()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
  }

  if (!user) return null

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Profilom</h2>
      </div>

      <div className="profil-racs">
        <section className="panel">
          <h3>Fiók</h3>
          <div className="panel-torzs">
            <div className="adatsor"><span>Név</span><span className="ertek">{user.name}</span></div>
            <div className="adatsor"><span>Szerepkör</span><span className="ertek">{ROLE_LABEL[user.role]}</span></div>
            {user.email && (
              <div className="adatsor"><span>E-mail</span><span className="ertek">{user.email}</span></div>
            )}
            <div className="sor-gombok" style={{ marginTop: 'var(--t3)' }}>
              <button className="btn" onClick={onJelszo}>Jelszó módosítása</button>
              <button className="btn" onClick={() => void signOut()}>Kilépés</button>
            </div>
          </div>
        </section>

        <section className="panel" id="munkaido-urlap">
          <h3>{f.id ? 'Munkaidő-változás módosítása' : 'Munkaidő-változás'}</h3>
          <div className="panel-torzs profil-urlap">
            <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>
              Megjelenik a napi nézet kártyáján, és a nap kapacitása is ennyivel
              kevesebb lesz arra az időre, amíg nem vagy bent.
            </p>

            {teljesJogu && dolgozok.length > 0 && (
              <KinekValaszto id="mv-kinek" ertek={f.staffId} dolgozok={dolgozok} sajatId={user.id}
                             onValt={(v) => set('staffId', v)} />
            )}

            <div className="mezo">
              <label htmlFor="mv-nap">Nap</label>
              <input id="mv-nap" className="beviteli" type="date" min={maStr()} value={f.day}
                     onChange={(e) => set('day', e.target.value)} />
            </div>

            <div className="mezo">
              <span className="cimke">Mi változik?</span>
              <div className="valaszto">
                {VALTOZAS_FAJTAK.map((v) => (
                  <button key={v.kind} type="button" aria-pressed={f.kind === v.kind}
                          onClick={() => set('kind', v.kind)}>
                    {v.cimke}
                  </button>
                ))}
              </div>
            </div>

            {(kellTol || kellIg) && (
              <div className="sor-2 profil-idok">
                {kellTol && (
                  <div className="mezo">
                    <label htmlFor="mv-tol">
                      {f.kind === 'KORABBAN_TAVOZIK' ? 'Mikor megy el?' : 'Mettől'}
                    </label>
                    <IdoMezo id="mv-tol" value={f.starts} cim="Mettől"
                             onChange={(v) => set('starts', v)} />
                  </div>
                )}
                {kellIg && (
                  <div className="mezo">
                    <label htmlFor="mv-ig">
                      {f.kind === 'KESOBB_ERKEZIK' ? 'Mikor érkezik?' : 'Meddig'}
                    </label>
                    <IdoMezo id="mv-ig" value={f.ends} cim="Meddig"
                             onChange={(v) => set('ends', v)} />
                  </div>
                )}
              </div>
            )}

            <div className="mezo">
              <label htmlFor="mv-megj">Megjegyzés</label>
              <input id="mv-megj" className="beviteli" value={f.note}
                     placeholder="nem kötelező"
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
                {megy ? 'Mentés…' : f.id ? 'Módosítás mentése' : 'Bejelentés'}
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <h3>{teljesJogu ? 'Bejelentett változások — mindenki' : 'Bejelentett változásaim'}</h3>
          <div className="panel-torzs">
            {lista === null && <div className="betolt">Betöltés…</div>}
            {lista?.length === 0 && (
              <div className="ures">Nincs bejelentett változás a mai naptól.</div>
            )}
            <ul className="valtozas-lista">
              {lista?.map((a) => (
                <li key={a.id} data-szerk={f.id === a.id || undefined}>
                  <div className="valtozas-szoveg">
                    <strong>{napCim(a.day.slice(0, 10))}</strong>
                    <span>
                      {!a.sajat && <>{a.staff_name}: </>}
                      {valtozasSzoveg(a)}
                      {a.note && <span className="halk"> · {a.note}</span>}
                    </span>
                  </div>
                  <div className="valtozas-gombok">
                    <button className="btn btn-kicsi" onClick={() => modosit(a)}>Módosítás</button>
                    <button className="btn btn-kicsi btn-veszelyes" onClick={() => void torol(a)}>Törlés</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <SzabadsagPanel teljesJogu={teljesJogu} dolgozok={dolgozok} />
      </div>
      {kerdesAblak}
    </div>
  )
}
