import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { auto, idopontSorok, ora, rovidNap, szolgaltatas } from '../../../../supabase/functions/_shared/formaz.ts'
import type { Foglalas } from '../../../../supabase/functions/_shared/tipusok.ts'
import { lemondasLekerdezes, lemondasVegrehajtas, type LemondasValasz } from '../../data/lemondasApi'

const ALAP_TELEFON = '+36 1 506 0420'
const ALAP_UZLET = 'Mosathat'

function utvonal(): { alap: string; sikeres: boolean } {
  const ut = window.location.pathname.replace(/\/+$/, '')
  const sikeres = ut.endsWith('/sikeres')
  return { alap: sikeres ? ut.slice(0, -'/sikeres'.length) : ut, sikeres }
}

function idopont(iso: string): string {
  return `${rovidNap(iso)} ${ora(iso)}`
}

export default function LemondasOldal() {
  const { alap, sikeres } = utvonal()
  const token = new URLSearchParams(window.location.search).get('t') ?? ''
  const [v, setV] = useState<LemondasValasz | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [megy, setMegy] = useState(false)

  const ugras = useCallback((sikeresre: boolean) => {
    window.location.replace(`${alap}${sikeresre ? '/sikeres' : ''}?t=${encodeURIComponent(token)}`)
  }, [alap, token])

  const lekeres = useCallback(() => {
    lemondasLekerdezes(token)
      .then((r) => {
        if (sikeres && r.allapot !== 'LEMONDVA') return ugras(false)
        if (!sikeres && r.allapot === 'LEMONDVA') return ugras(true)
        setV(r)
      })
      .catch((e) => setHiba(e instanceof Error ? e.message : String(e)))
  }, [token, sikeres, ugras])

  useEffect(() => {
    document.title = sikeres ? 'Foglalás lemondva' : 'Foglalás lemondása'
    document.body.classList.add('lem-body')
    lekeres()
  }, [lekeres, sikeres])

  function ujra() {
    setHiba(null)
    setV(null)
    lekeres()
  }

  async function lemond() {
    if (megy) return
    setMegy(true)
    setHiba(null)
    try {
      const r = await lemondasVegrehajtas(token)
      if (r.allapot === 'LEMONDVA') {
        ugras(true)
        return
      }
      setV(r)
      setMegy(false)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      setMegy(false)
    }
  }

  const telefon = v?.telefon ?? ALAP_TELEFON
  const uzlet = v?.uzlet ?? ALAP_UZLET

  return (
    <div className="lem">
      <header className="lem-fej">
        <span className="lem-nev">{uzlet}</span>
      </header>
      <main className="lem-tartalom">
        {hiba ? (
          <Kartya cim={v ? 'Nem sikerült lemondani' : 'Most nem sikerült betölteni'} jelzes="baj">
            <p>{hiba}</p>
            <div className="lem-gombok">
              <button type="button" className="lem-gomb lem-gomb-fo" onClick={v ? () => void lemond() : ujra}
                      disabled={megy}>
                Újrapróbálom
              </button>
              <Hivas telefon={telefon} />
            </div>
          </Kartya>
        ) : !v ? (
          <p className="lem-betolt" aria-live="polite">Betöltés…</p>
        ) : (
          <Tartalom v={v} sikeres={sikeres} telefon={telefon} megy={megy} onLemond={() => void lemond()} />
        )}
      </main>
    </div>
  )
}

function Tartalom({ v, sikeres, telefon, megy, onLemond }: {
  v: LemondasValasz
  sikeres: boolean
  telefon: string
  megy: boolean
  onLemond: () => void
}) {
  const f = v.foglalas

  if (sikeres && v.allapot === 'LEMONDVA') {
    return (
      <Kartya cim="Sikeresen lemondtad a foglalásodat" jelzes="kesz">
        <p>
          Az időpontot felszabadítottuk, nincs más teendőd.
          {v.lemondva && <> Lemondva: <strong>{idopont(v.lemondva)}</strong>.</>}
        </p>
        {f && <Adatok f={f} halvany />}
        <p className="lem-halk">
          Ha új időpontot szeretnél, hívj minket: <a href={`tel:${telefon.replace(/\s+/g, '')}`}>{telefon}</a>.
          Köszönjük, hogy szóltál.
        </p>
      </Kartya>
    )
  }

  if (v.allapot === 'LEMONDHATO' && f) {
    return (
      <Kartya cim="Biztosan lemondod a foglalásodat?">
        <Adatok f={f} />
        <p className="lem-halk">
          A lemondás végleges, az időpontot felszabadítjuk.
          {v.hatarido && <> Online lemondási határidő: {idopont(v.hatarido)}.</>}
        </p>
        <div className="lem-gombok">
          <button type="button" className="lem-gomb lem-gomb-veszely" onClick={onLemond} disabled={megy}>
            {megy ? 'Lemondás folyamatban…' : 'Igen, lemondom'}
          </button>
        </div>
        <p className="lem-halk">Ha mégis megtartod, nincs teendőd, ezt az oldalt nyugodtan bezárhatod.</p>
      </Kartya>
    )
  }

  if (v.allapot === 'LEJART' && f) {
    return (
      <Kartya cim="Online már nem mondható le" jelzes="figyel">
        <p>
          A lemondási határidő {v.hatarido ? <strong>{idopont(v.hatarido)}</strong> : 'már'} volt.
          Kérjük, hívj minket, és megbeszéljük.
        </p>
        <Adatok f={f} />
        <div className="lem-gombok"><Hivas telefon={telefon} fo /></div>
      </Kartya>
    )
  }

  if (v.allapot === 'NEM_LEMONDHATO' && f) {
    const [cim, szoveg] = nemLemondhato(v.statusz)
    return (
      <Kartya cim={cim} jelzes="figyel">
        <p>{szoveg}</p>
        <Adatok f={f} />
        <div className="lem-gombok"><Hivas telefon={telefon} /></div>
      </Kartya>
    )
  }

  return (
    <Kartya cim="Ez a lemondó link nem érvényes" jelzes="baj">
      <p>
        Lehet, hogy a link nem teljes, például a másoláskor lemaradt a vége. Nyisd meg
        újra a visszaigazoló e-mailből, vagy hívj minket.
      </p>
      <div className="lem-gombok"><Hivas telefon={telefon} /></div>
    </Kartya>
  )
}

function nemLemondhato(statusz: string | undefined): [string, string] {
  switch (statusz) {
    case 'CANCELLED_BY_SHOP':
      return ['Ez a foglalás már le van mondva', 'A foglalást mi mondtuk le. Ha kérdésed van, hívj minket.']
    case 'REJECTED':
      return ['Ezt az időpontot nem tudtuk vállalni', 'Ha új időpontot szeretnél, hívj minket.']
    case 'NO_SHOW':
      return ['Ez az időpont már elmúlt', 'Ha új időpontot szeretnél, hívj minket.']
    default:
      return ['Ezen az autón már dolgozunk', 'A munka már elkezdődött vagy elkészült, ezért online nem mondható le. Ha kérdésed van, hívj minket.']
  }
}

function Kartya({ cim, jelzes, children }: { cim: string; jelzes?: 'kesz' | 'figyel' | 'baj'; children: ReactNode }) {
  return (
    <section className="lem-kartya" data-jelzes={jelzes}>
      <h1>{cim}</h1>
      {children}
    </section>
  )
}

function Adatok({ f, halvany = false }: { f: Foglalas; halvany?: boolean }) {
  const sorok: [string, string][] = [
    ...idopontSorok(f),
    ['Autó', auto(f)],
    ['Szolgáltatás', szolgaltatas(f)],
  ]
  if (f.extras_summary) sorok.push(['Extrák', f.extras_summary])
  return (
    <dl className="lem-adatok" data-halvany={halvany || undefined}>
      {sorok.map(([cimke, ertek]) => (
        <div key={cimke}>
          <dt>{cimke}</dt>
          <dd>{ertek}</dd>
        </div>
      ))}
    </dl>
  )
}

function Hivas({ telefon, fo = false }: { telefon: string; fo?: boolean }) {
  return (
    <a className={`lem-gomb${fo ? ' lem-gomb-fo' : ''}`} href={`tel:${telefon.replace(/\s+/g, '')}`}>
      Hívás: {telefon}
    </a>
  )
}
