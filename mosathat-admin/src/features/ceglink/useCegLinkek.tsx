import { useEffect, useRef, useState, type ReactNode } from 'react'

import './ceglink.css'
import { useApp } from '../../state/AppContext'
import { useMentetlen } from '../../state/useMentetlen'
import { useKerdes } from '../common/Kerdes'
import { hibaSzoveg, napRovidCim } from '../../lib/format'
import { cegLinkAtirasLevel, cegLinkCim, cegLinkCsereLevel, cegLinkLevel, linkCimElotag, vagolapra } from '../../lib/cegLink'
import QrAblak from './QrAblak'
import LinkCimMezo from './LinkCimMezo'
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

export interface CegLinkVezerlo {
  kerdesAblak: ReactNode
  hiba: string | null
  linkCella: (cegId: string) => ReactNode
  uzenetCella: (cegId: string) => ReactNode
}

export function useCegLinkek(engedett: boolean, frissites: number): CegLinkVezerlo {
  const { data } = useApp()
  const [lista, setLista] = useState<CegLink[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [megy, setMegy] = useState<string | null>(null)
  const [jelzes, setJelzes] = useState<Jelzes | null>(null)
  const [uzenetek, setUzenetek] = useState<Record<string, string>>({})
  const [kerdesAblak, kerdez] = useKerdes()
  const [qr, setQr] = useState<{ nev: string; link: string } | null>(null)
  const idozito = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!engedett) return
    let el = true
    data.cegLinkek()
      .then((l) => {
        if (!el) return
        setLista(l)
        setUzenetek((u) => ({ ...Object.fromEntries(l.map((c) => [c.company_id, c.message ?? ''])), ...u }))
        setHiba(null)
      })
      .catch((e) => { if (el) setHiba(hibaSzoveg(e)) })
    return () => { el = false }
  }, [data, engedett, frissites])
  useEffect(() => () => window.clearTimeout(idozito.current), [])

  const valtozott = (lista ?? []).some((c) => (uzenetek[c.company_id] ?? '') !== (c.message ?? ''))
  useMentetlen(valtozott)

  function jelez(j: Jelzes) {
    window.clearTimeout(idozito.current)
    setJelzes(j)
    idozito.current = window.setTimeout(() => setJelzes(null), 4000)
  }

  async function masol(c: CegLink, token: string, mod: 'sima' | 'csere' | 'atiras') {
    const level = mod === 'csere' ? cegLinkCsereLevel : mod === 'atiras' ? cegLinkAtirasLevel : cegLinkLevel
    const ok = await vagolapra(level(c.name, cegLinkCim(token)))
    jelez(ok
      ? { cegId: c.company_id, hol: 'link', szoveg: mod === 'sima' ? 'A levél a vágólapon' : mod === 'atiras' ? 'Cím átírva, a levél a vágólapon' : 'Új link kész, a levél a vágólapon' }
      : { cegId: c.company_id, hol: 'link', szoveg: 'Nem sikerült a vágólapra másolni', hiba: true })
  }

  async function general(c: CegLink, cim?: string) {
    if (megy) return
    const csere = Boolean(c.token)
    if (csere && !(await kerdez({
      cim: cim ? `Link átírása: ${c.name}` : `Új link: ${c.name}`,
      szoveg: 'A mostani link azonnal megszűnik, aki azt használja, már nem tud vele foglalni. '
        + 'Az új link és a cégnek szóló levél a vágólapra kerül.',
      igen: cim ? 'Átírás' : 'Új link',
      nem: 'Mégsem',
      veszelyes: true,
    }))) return
    setMegy(c.company_id)
    try {
      const token = cim ? await data.cegLinkAtir(c.company_id, cim) : await data.cegLinkUj(c.company_id)
      setLista((l) => (l ?? []).map((x) => x.company_id === c.company_id
        ? { ...x, token, created_at: new Date().toISOString() } : x))
      await masol(c, token, !csere ? 'sima' : cim ? 'atiras' : 'csere')
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

  const jelzo = (cegId: string, hol: Jelzes['hol']) => jelzes?.cegId === cegId && jelzes.hol === hol
    ? <output className={jelzes.hiba ? 'ceglink-jelzes hiba' : 'ceglink-jelzes'}>{jelzes.szoveg}</output>
    : null

  function nincs(cegId: string): ReactNode | null {
    if (!lista) return <span className="halk">Betöltés…</span>
    if (!lista.some((c) => c.company_id === cegId)) {
      return <span className="halk">Nincs érvényes szerződés, ezért link sem készíthető.</span>
    }
    return null
  }

  function linkCella(cegId: string): ReactNode {
    const elotte = nincs(cegId)
    if (elotte) return elotte
    const c = lista!.find((x) => x.company_id === cegId)!
    const link = c.token ? cegLinkCim(c.token) : null
    return (
      <div className="ceglink-link">
        {link ? (
          <div className="ceglink-link-sor">
            <a href={link} target="_blank" rel="noopener" className="ceglink-cim">{link}</a>
            <button type="button" className="btn btn-kicsi ceglink-masol"
                    aria-label={`A levél másolása: ${c.name}`} title="A cégnek szóló levél másolása a linkkel"
                    disabled={megy === c.company_id} onClick={() => void masol(c, c.token!, 'sima')}>
              <MasolasIkon />
            </button>
          </div>
        ) : (
          <span className="halk">Még nincs link</span>
        )}
        <LinkCimMezo id={`cl-${c.company_id}`} elotag={linkCimElotag('ceg')} ertek={c.token}
                     megy={megy === c.company_id} cimke={`A link egyedi címe: ${c.name}`}
                     onMent={(cim) => general(c, cim)} />
        <div className="ceglink-gombok">
          <button type="button" className={`btn btn-kicsi${link ? '' : ' btn-fo'}`}
                  disabled={megy === c.company_id} onClick={() => void general(c)}>
            {link ? 'Új link' : 'Link készítése'}
          </button>
          {link && (
            <button type="button" className="btn btn-kicsi ceglink-qr" onClick={() => setQr({ nev: c.name, link })}>
              QR-kód
            </button>
          )}
          {c.created_at && <small className="halk">Készült: {napRovidCim(c.created_at.slice(0, 10))}</small>}
        </div>
        {jelzo(c.company_id, 'link')}
      </div>
    )
  }

  function uzenetCella(cegId: string): ReactNode {
    const elotte = nincs(cegId)
    if (elotte) return null
    const c = lista!.find((x) => x.company_id === cegId)!
    const uzenet = uzenetek[c.company_id] ?? ''
    const uzenetValtozott = uzenet !== (c.message ?? '')
    return (
      <div className="ceglink-uzenet">
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
        {jelzo(c.company_id, 'uzenet')}
      </div>
    )
  }

  return {
    kerdesAblak: (
      <>
        {kerdesAblak}
        {qr && <QrAblak cegNev={qr.nev} link={qr.link} onBezar={() => setQr(null)} />}
      </>
    ),
    hiba, linkCella, uzenetCella,
  }
}
