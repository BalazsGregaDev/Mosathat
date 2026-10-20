import { useEffect, useRef, useState } from 'react'

import './ceglink.css'
import { useApp } from '../../state/AppContext'
import { useMentetlen } from '../../state/useMentetlen'
import { useKerdes } from '../common/Kerdes'
import { hibaSzoveg, napRovidCim } from '../../lib/format'
import { cegLinkCim, cegLinkCsereLevel, cegLinkLevel, vagolapra } from '../../lib/cegLink'
import type { CegLink } from '../../lib/types'

function MasolasIkon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13 4.5V4a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 3 4v7a1.5 1.5 0 0 0 1.5 1.5H5"
            fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

type Jelzes = { cegId: string; hol: 'link' | 'uzenet'; szoveg: string; hiba?: boolean }

export default function CegLinkekOldal({ onSzerzodes }: { onSzerzodes?: () => void }) {
  const { data } = useApp()
  const [lista, setLista] = useState<CegLink[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [megy, setMegy] = useState<string | null>(null)
  const [jelzes, setJelzes] = useState<Jelzes | null>(null)
  const [uzenetek, setUzenetek] = useState<Record<string, string>>({})
  const [kerdesAblak, kerdez] = useKerdes()
  const idozito = useRef<number | undefined>(undefined)

  useEffect(() => {
    let el = true
    data.cegLinkek()
      .then((l) => {
        if (!el) return
        setLista(l)
        setUzenetek(Object.fromEntries(l.map((c) => [c.company_id, c.message ?? ''])))
        setHiba(null)
      })
      .catch((e) => { if (el) setHiba(hibaSzoveg(e)) })
    return () => { el = false }
  }, [data])
  useEffect(() => () => window.clearTimeout(idozito.current), [])

  const valtozott = (lista ?? []).some((c) => (uzenetek[c.company_id] ?? '') !== (c.message ?? ''))
  useMentetlen(valtozott)

  function jelez(j: Jelzes) {
    window.clearTimeout(idozito.current)
    setJelzes(j)
    idozito.current = window.setTimeout(() => setJelzes(null), 4000)
  }

  async function masol(c: CegLink, token: string, csere: boolean) {
    const szoveg = (csere ? cegLinkCsereLevel : cegLinkLevel)(c.name, cegLinkCim(token))
    const ok = await vagolapra(szoveg)
    jelez(ok
      ? { cegId: c.company_id, hol: 'link', szoveg: csere ? 'Új link kész, a levél a vágólapon' : 'A levél a vágólapon' }
      : { cegId: c.company_id, hol: 'link', szoveg: 'Nem sikerült a vágólapra másolni', hiba: true })
  }

  async function general(c: CegLink) {
    if (megy) return
    const csere = Boolean(c.token)
    if (csere && !(await kerdez({
      cim: `Új link: ${c.name}`,
      szoveg: 'A mostani link azonnal megszűnik, aki azt használja, már nem tud vele foglalni. '
        + 'Az új link és a cégnek szóló levél a vágólapra kerül.',
      igen: 'Új link',
      nem: 'Mégsem',
      veszelyes: true,
    }))) return
    setMegy(c.company_id)
    try {
      const token = await data.cegLinkUj(c.company_id)
      setLista((l) => (l ?? []).map((x) => x.company_id === c.company_id
        ? { ...x, token, created_at: new Date().toISOString() } : x))
      await masol(c, token, csere)
    } catch (e) {
      jelez({ cegId: c.company_id, hol: 'link', szoveg: hibaSzoveg(e), hiba: true })
    } finally {
      setMegy(null)
    }
  }

  async function uzenetMent(c: CegLink) {
    if (megy) return
    setMegy(c.company_id)
    try {
      const szoveg = (uzenetek[c.company_id] ?? '').trim()
      await data.cegLinkUzenet(c.company_id, szoveg)
      setLista((l) => (l ?? []).map((x) => x.company_id === c.company_id ? { ...x, message: szoveg || null } : x))
      setUzenetek((u) => ({ ...u, [c.company_id]: szoveg }))
      jelez({ cegId: c.company_id, hol: 'uzenet', szoveg: 'Üzenet mentve' })
    } catch (e) {
      jelez({ cegId: c.company_id, hol: 'uzenet', szoveg: hibaSzoveg(e), hiba: true })
    } finally {
      setMegy(null)
    }
  }

  return (
    <div className="oldal ceglink-oldal">
      {kerdesAblak}
      <div className="oldal-fej">
        <h2>Céges foglalási linkek</h2>
      </div>
      <p className="magyarazat halk">
        A szerződéses cégek dolgozói ezzel a linkkel a cég árain kérhetnek időpontot. A kérés az online kérések
        közé érkezik, elfogadás után az ügyfél a céghez kerül, és átadáskor az igazolólap sorát kéri a rendszer.
        Ha egy link kiszivárog, az Új link gomb azonnal megszünteti a régit.
      </p>

      {hiba && <p className="hiba">{hiba}</p>}
      {!lista && !hiba && <div className="betolt">Betöltés…</div>}

      {lista && lista.length === 0 && (
        <div className="panel ceglink-ures">
          <p>Még nincs érvényes szerződéssel rendelkező cég.</p>
          {onSzerzodes && (
            <button type="button" className="btn btn-kicsi" onClick={onSzerzodes}>Cégek és bérletesek megnyitása</button>
          )}
        </div>
      )}

      {lista && lista.length > 0 && (
        <table className="ceglink-lista" aria-label="Szerződéses cégek foglalási linkjei">
          <thead>
            <tr className="ceglink-sor ceglink-fejlec">
              <th scope="col">Cég</th>
              <th scope="col">Működő link</th>
              <th scope="col">Üzenet a foglalóknak</th>
            </tr>
          </thead>
          <tbody>
          {lista.map((c) => {
            const link = c.token ? cegLinkCim(c.token) : null
            const uzenet = uzenetek[c.company_id] ?? ''
            const uzenetValtozott = uzenet !== (c.message ?? '')
            const sajat = jelzes?.cegId === c.company_id ? jelzes : null
            const jelzo = (hol: Jelzes['hol']) => sajat?.hol === hol
              ? <output className={sajat.hiba ? 'ceglink-jelzes hiba' : 'ceglink-jelzes'}>{sajat.szoveg}</output>
              : null
            return (
              <tr key={c.company_id} className="ceglink-sor" data-ceg={c.name}>
                <td className="ceglink-ceg">
                  <strong>{c.name}</strong>
                  {c.valid_until && <small className="halk">Szerződés: {napRovidCim(c.valid_until)}-ig</small>}
                </td>

                <td className="ceglink-link">
                  {link ? (
                    <div className="ceglink-link-sor">
                      <a href={link} target="_blank" rel="noopener" className="ceglink-cim">{link}</a>
                      <button type="button" className="btn btn-kicsi ceglink-masol"
                              aria-label={`A levél másolása: ${c.name}`} title="A cégnek szóló levél másolása a linkkel"
                              disabled={megy === c.company_id} onClick={() => void masol(c, c.token!, false)}>
                        <MasolasIkon />
                      </button>
                    </div>
                  ) : (
                    <span className="halk">Még nincs link</span>
                  )}
                  <div className="ceglink-gombok">
                    <button type="button" className={`btn btn-kicsi${link ? '' : ' btn-fo'}`}
                            disabled={megy === c.company_id} onClick={() => void general(c)}>
                      {link ? 'Új link' : 'Link készítése'}
                    </button>
                    {c.created_at && <small className="halk">Készült: {napRovidCim(c.created_at.slice(0, 10))}</small>}
                  </div>
                  {jelzo('link')}
                </td>

                <td className="ceglink-uzenet">
                  <textarea className="beviteli" rows={2} maxLength={1000} value={uzenet}
                            aria-label={`Üzenet a foglalóknak: ${c.name}`}
                            placeholder="Például: Kérjük, a forgalmi engedélyt hagyjátok az autóban."
                            onChange={(e) => setUzenetek((u) => ({ ...u, [c.company_id]: e.target.value }))} />
                  <div className="ceglink-gombok">
                    <small className="halk">A foglalási oldalon a Megjegyzés mező fölött jelenik meg.</small>
                    {uzenetValtozott && (
                      <>
                        <button type="button" className="btn btn-kicsi"
                                onClick={() => setUzenetek((u) => ({ ...u, [c.company_id]: c.message ?? '' }))}>
                          Elvetés
                        </button>
                        <button type="button" className="btn btn-kicsi btn-fo" disabled={megy === c.company_id}
                                onClick={() => void uzenetMent(c)}>
                          Mentés
                        </button>
                      </>
                    )}
                  </div>
                  {jelzo('uzenet')}
                </td>
              </tr>
            )
          })}
          </tbody>
        </table>
      )}
    </div>
  )
}
