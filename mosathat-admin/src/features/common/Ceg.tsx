import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import type { CompanyCandidate, CompanyHit } from '../../lib/types'

// ---------------------------------------------------------------------------
//  A Cég mező és a „hasonló nevű cég" kérdés
//
//  A cég nem egyszerű szöveg. Ha egy cégnek öt autója van, öt sofőrrel, akkor
//  az öt ügyfél UGYANAHHOZ a céghez tartozik — a szerződéses ár, a fuvardíj
//  és a cég szerinti nézet is ezen múlik. Ezért:
//
//  1. A mező keres, az első betűtől. A találatra kattintva a foglalás a
//     MEGLÉVŐ céghez kötődik — nem egy újabb, ugyanúgy írt szöveghez.
//
//  2. Ha valaki gépel, és nem választ, az új cégnév lesz. Mentés előtt az
//     adatbázis összeveti a meglévőkkel, kisbetűsítve, ékezet, írásjel,
//     cégforma és dupla betű nélkül:
//
//        ugyanaz a kulcs   → ugyanaz a cég, csendben ahhoz kötjük
//        nagyon hasonló    → rákérdezünk: „Erre gondoltál?"
//        semmi hasonló     → új cég lesz
//
//     A hasonlót nem vonjuk össze magunktól: két tényleg különböző cégnek
//     is lehet hasonló neve, és egy rossz összevonás rosszabb, mint egy
//     kérdés.
// ---------------------------------------------------------------------------

/** A mező értéke: a kiválasztott cég (id), vagy csak a beírt név (id = null). */
export interface CegErtek {
  id: string | null
  nev: string
}

export const URES_CEG: CegErtek = { id: null, nev: '' }

export function CegValaszto({
  ertek,
  onValt,
  inputId,
  disabled,
  onKilep,
}: {
  ertek: CegErtek
  onValt: (uj: CegErtek) => void
  inputId?: string
  disabled?: boolean
  /** A mezőből kilépéskor (pl. a munkalapon itt ment). */
  onKilep?: () => void
}) {
  const { data } = useApp()
  const [talalatok, setTalalatok] = useState<CompanyHit[]>([])
  const [nyitva, setNyitva] = useState(false)
  const idozito = useRef<number | undefined>(undefined)

  // Keresés gépelés közben, 200 ms csend után. Kiválasztott cégnél nem
  // keresünk: ott már tudjuk, melyik az.
  useEffect(() => {
    window.clearTimeout(idozito.current)
    const q = ertek.nev.trim()
    if (!nyitva || ertek.id || q.length < 1) { setTalalatok([]); return }
    idozito.current = window.setTimeout(async () => {
      try { setTalalatok(await data.searchCompanies(q, 6)) } catch { setTalalatok([]) }
    }, 200)
    return () => window.clearTimeout(idozito.current)
  }, [ertek.nev, ertek.id, nyitva, data])

  const valaszt = (h: CompanyHit) => {
    onValt({ id: h.id, nev: h.name })
    setNyitva(false)
    setTalalatok([])
  }

  return (
    <div className="kereso ceg-kereso">
      <input
        id={inputId}
        className="beviteli"
        value={ertek.nev}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        // Gépeléssel a kiválasztás elengedődik: amit most írnak, az már nem
        // feltétlenül az a cég.
        onChange={(e) => { onValt({ id: null, nev: e.target.value }); setNyitva(true) }}
        onFocus={() => setNyitva(true)}
        onBlur={() => { setNyitva(false); onKilep?.() }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); setNyitva(false) }
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
        }}
      />

      {/* Mit fog jelenteni a mentés — hogy ne legyen meglepetés. */}
      {ertek.nev.trim() !== '' && (
        <small className={`ceg-allapot ${ertek.id ? 'meglevo' : 'uj'}`}>
          {ertek.id ? 'meglévő cég' : 'új cég lesz, ha nincs ilyen'}
        </small>
      )}

      {nyitva && talalatok.length > 0 && (
        <div className="talalatlista">
          {talalatok.map((h) => (
            // mousedown + preventDefault: a mező nem veszíti el a fókuszt a
            // kattintás előtt, így a lista nem tűnik el a kattintás alól.
            <button key={h.id} type="button" className="talalatsor"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => valaszt(h)}>
              <span className="nev">{h.name}</span>
              {h.szerzodes && <span className="cimke-pill szerzodes-pill">szerződés</span>}
              <span className="auto halk">
                {h.jarmuvek > 0 ? `${h.jarmuvek} autó` : `${h.ugyfelek} ügyfél`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


// ---------------------------------------------------------------------------
//  Mentés előtti egyeztetés
// ---------------------------------------------------------------------------
//
//    const [cegAblak, cegEgyeztet] = useCegEgyeztetes()
//    const ceg = await cegEgyeztet(ertek)
//    if (ceg === null) return             // a felhasználó meggondolta magát
//    … mentés ceg.id-vel vagy ceg.nev-vel …
//
//  Ha a cég ki van választva, vagy üres, nincs mit egyeztetni: rögtön
//  visszaadja. Ha csak név van, megkérdezi az adatbázist, és szükség esetén
//  a felhasználót is.

export function useCegEgyeztetes(): [React.ReactNode, (e: CegErtek) => Promise<CegErtek | null>] {
  const { data } = useApp()
  const [kerdes, setKerdes] = useState<{ nev: string; jeloltek: CompanyCandidate[] } | null>(null)
  const valasz = useRef<((v: CegErtek | null) => void) | null>(null)

  const egyeztet = useCallback(async (e: CegErtek): Promise<CegErtek | null> => {
    const nev = e.nev.trim()
    if (e.id || nev === '') return { id: e.id, nev }

    const jeloltek = await data.companyCandidates(nev)
    const azonos = jeloltek.find((j) => j.egyezes === 'AZONOS')
    if (azonos) return { id: azonos.id, nev: azonos.name }
    if (jeloltek.length === 0) return { id: null, nev }

    valasz.current?.(null)
    setKerdes({ nev, jeloltek })
    return new Promise<CegErtek | null>((resolve) => { valasz.current = resolve })
  }, [data])

  const lezar = useCallback((v: CegErtek | null) => {
    valasz.current?.(v)
    valasz.current = null
    setKerdes(null)
  }, [])

  useEffect(() => {
    if (!kerdes) return
    const f = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); lezar(null) }
    }
    window.addEventListener('keydown', f, true)
    return () => window.removeEventListener('keydown', f, true)
  }, [kerdes, lezar])

  const ablak = kerdes ? createPortal(
    <div className="fedo kerdes-fedo" role="presentation"
         onMouseDown={(ev) => { if (ev.target === ev.currentTarget) lezar(null) }}>
      <div className="kerdes-ablak" role="alertdialog" aria-modal="true" aria-labelledby="ceg-kerdes">
        <h2 id="ceg-kerdes">Erre a cégre gondoltál?</h2>
        <p>
          Hasonló nevű cég már van a rendszerben. Ha ugyanaz, válaszd ki — különben
          két külön cég lesz belőle, és az autók nem kerülnek egy helyre.
        </p>
        <div className="ceg-jeloltek">
          {kerdes.jeloltek.map((j) => (
            <button key={j.id} type="button" className="btn btn-fo"
                    onClick={() => lezar({ id: j.id, nev: j.name })}>
              Igen: {j.name}
            </button>
          ))}
          <button type="button" className="btn" onClick={() => lezar({ id: null, nev: kerdes.nev })}>
            Nem, ez új cég: {kerdes.nev}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null

  return [ablak, egyeztet]
}
