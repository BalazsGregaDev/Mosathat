import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg } from '../../lib/format'
import type { CegCel, CegTagok, CompanySummary } from '../../lib/types'
import Ablak from '../common/Ablak'

type Hol = { ugyfel?: string; ceg?: string }

function CegAtnevezesAblak({ tagok, kezdoNev, onKesz, onMegse }: {
  tagok: CegTagok
  kezdoNev: string
  onKesz: () => void
  onMegse: () => void
}) {
  const { data } = useApp()
  const [nev, setNev] = useState(kezdoNev)
  const [kijelolt, setKijelolt] = useState<Set<string>>(() => new Set(tagok.tagok.map((t) => t.id)))
  const [cel, setCel] = useState<CegCel | null>(null)
  const [javaslatok, setJavaslatok] = useState<CompanySummary[]>([])
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const nevMezo = useRef<HTMLInputElement>(null)

  useEffect(() => { nevMezo.current?.focus() }, [])

  useEffect(() => {
    const k = nev.trim()
    let el = true
    const t = window.setTimeout(() => {
      if (!k) { setCel(null); setJavaslatok([]); return }
      data.cegCel(tagok.ceg_id, k).then((x) => { if (el) setCel(x) }).catch(() => { if (el) setCel(null) })
      data.listCompanies(k)
        .then((l) => { if (el) setJavaslatok(l.filter((c) => c.id !== tagok.ceg_id).slice(0, 5)) })
        .catch(() => { if (el) setJavaslatok([]) })
    }, 200)
    return () => { el = false; window.clearTimeout(t) }
  }, [data, nev, tagok.ceg_id])

  const mind = kijelolt.size === tagok.tagok.length
  const ures = nev.trim() === ''
  const valtozatlan = nev.trim() === tagok.nev && mind
  const tiltott = Boolean(cel?.letezo && mind && tagok.szerzodes)
  const kesz = !ures && !valtozatlan && kijelolt.size > 0 && !tiltott && !megy

  const valt = (id: string) => setKijelolt((s) => {
    const uj = new Set(s)
    if (uj.has(id)) uj.delete(id)
    else uj.add(id)
    return uj
  })

  async function ment() {
    if (!kesz) return
    setMegy(true)
    setHiba(null)
    try {
      await data.cegAtnevez(tagok.ceg_id, nev.trim(), [...kijelolt])
      onKesz()
    } catch (e) {
      setHiba(hibaSzoveg(e))
      setMegy(false)
    }
  }

  let allapot: ReactNode
  if (ures) {
    allapot = 'Írd be az új cégnevet, vagy válassz egy meglévő céget.'
  } else if (cel?.letezo) {
    allapot = (
      <>
        Már van ilyen cég: <strong>{cel.nev}</strong> ({cel.ugyfelek} ügyfél, {cel.jarmuvek} jármű{cel.szerzodes ? ', szerződéses' : ''}).
        A kijelöltek autóikkal együtt ehhez a céghez kerülnek{cel.szerzodes ? ', és a szerződése rájuk is vonatkozik' : ''}.
        {mind && !tagok.szerzodes && <> A(z) {tagok.nev} cég ezután megszűnik.</>}
      </>
    )
  } else if (mind) {
    allapot = <>A cég neve minden ügyfelénél és autójánál erre íródik át: <strong>{nev.trim()}</strong></>
  } else {
    allapot = (
      <>
        Új cég jön létre <strong>{nev.trim()}</strong> néven, a kijelöltek autóikkal együtt átkerülnek.
        A többiek a(z) {tagok.nev} cégnél maradnak.
      </>
    )
  }

  return (
    <Ablak cimke="Cégnév módosítása" onEsc={() => { if (!megy) onMegse() }}>
      <div className="lap ceg-atnev">
        <div className="lap-fej">
          <h2>Cégnév módosítása</h2>
          <button className="bezar" onClick={onMegse} aria-label="Bezárás" disabled={megy}>×</button>
        </div>
        <div className="lap-torzs">
          {hiba && <div className="hibauzenet">{hiba}</div>}
          <div className="adatsor">
            <span>Most</span>
            <span className="ertek">{tagok.nev}{tagok.szerzodes && <span className="cimke-pill szerzodes-pill">szerződés</span>}</span>
          </div>
          <label className="mezo">
            <span>Új cégnév</span>
            <input ref={nevMezo} className="beviteli" value={nev} disabled={megy} data-mezo="ceg-uj-nev"
                   onChange={(e) => setNev(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') void ment() }} />
          </label>
          {javaslatok.length > 0 && !(cel?.letezo && javaslatok.length === 1 && javaslatok[0].id === cel.id && nev.trim() === cel.nev) && (
            <div className="ceg-javaslatok">
              <span className="halk">Meglévő cégek:</span>
              {javaslatok.map((c) => (
                <button key={c.id} type="button" className="btn btn-kicsi" disabled={megy} data-ceg-javaslat={c.id}
                        onClick={() => setNev(c.name)}>
                  {c.name}
                  <small> · {c.jarmuvek} autó{c.szerzodes ? ' · szerződés' : ''}</small>
                </button>
              ))}
            </div>
          )}
          <p className="ceg-atnev-allapot" data-tiltott={tiltott || undefined}>
            {tiltott
              ? <>A(z) {tagok.nev} cégnek szerződése van, ezért nem vonható össze a(z) {cel?.nev} céggel. Adj meg más nevet, vagy hagyd ki valamelyik ügyfelet.</>
              : allapot}
          </p>

          <div className="szakasz-cim">Ügyfelek és járművek a cégnél ({tagok.tagok.length})</div>
          <label className="jelolo ceg-atnev-mind">
            <input type="checkbox" checked={mind} disabled={megy}
                   onChange={() => setKijelolt(mind ? new Set() : new Set(tagok.tagok.map((t) => t.id)))} />
            <span>Mind átkerül az új névre</span>
          </label>
          <ul className="ceg-atnev-lista">
            {tagok.tagok.map((t) => (
              <li key={t.id}>
                <label className="jelolo" data-ugyfel={t.id} data-aktiv={kijelolt.has(t.id)}>
                  <input type="checkbox" checked={kijelolt.has(t.id)} disabled={megy} onChange={() => valt(t.id)} />
                  <span className="ceg-atnev-ugyfel">
                    <strong>{t.name}</strong>
                    {t.type === 'CEG' && <span className="cimke-pill">cég</span>}
                    {t.phone && <span className="halk">{t.phone}</span>}
                  </span>
                  <span className="ceg-atnev-autok">
                    {t.rendszamok.length > 0
                      ? t.rendszamok.map((r) => <span key={r} className="rendszam">{r}</span>)
                      : <span className="halvany">nincs autója</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {!mind && tagok.szerzodes && kijelolt.size > 0 && !cel?.letezo && (
            <p className="halk">A szerződés a(z) {tagok.nev} cégnél marad, az átvitt ügyfelekre nem vonatkozik.</p>
          )}

          <div className="lap-lab">
            <div className="gombok">
              <button className="btn" onClick={onMegse} disabled={megy}>Mégse</button>
              <button className="btn btn-fo" disabled={!kesz} onClick={() => void ment()}>
                {megy ? 'Mentés…' : cel?.letezo ? 'Áthelyezés' : 'Mentés'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Ablak>
  )
}

export function useCegNev(onValtozas: () => void) {
  const { data } = useApp()
  const [ablak, setAblak] = useState<{ tagok: CegTagok; nev: string } | null>(null)

  const ment = useCallback(async (hol: Hol, regi: string | null | undefined, uj: string, sima?: (x: string) => Promise<void>) => {
    const u = uj.trim()
    const r = (regi ?? '').trim()
    if ((!r || !u) && sima) { await sima(u); return }
    if (u === r) return
    const t = await data.cegTagjai(hol)
    if (!t) {
      if (sima) await sima(u)
      return
    }
    if (t.tagok.length <= 1 && u) {
      await data.cegAtnevez(t.ceg_id, u, t.tagok.map((x) => x.id))
      onValtozas()
      return
    }
    setAblak({ tagok: t, nev: u })
  }, [data, onValtozas])

  const athelyez = useCallback(async (ceg: string) => {
    const t = await data.cegTagjai({ ceg })
    if (t) setAblak({ tagok: t, nev: '' })
  }, [data])

  const elem = ablak && (
    <CegAtnevezesAblak tagok={ablak.tagok} kezdoNev={ablak.nev}
                       onKesz={() => { setAblak(null); onValtozas() }}
                       onMegse={() => setAblak(null)} />
  )
  return { ment, athelyez, elem }
}
