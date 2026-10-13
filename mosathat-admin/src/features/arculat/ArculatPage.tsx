import { useEffect, useMemo, useRef, useState } from 'react'

import './betuk'
import './koncepciok.css'
import './arculat-oldal.css'
import { useApp } from '../../state/AppContext'
import { hibaSzoveg } from '../../lib/format'
import { csomagTabla, KONCEPCIOK, type KoncepcioKod, type Mod } from '../../lib/arculat'
import type { ArculatValasztas } from '../../lib/types'
import Koncepcio from './Koncepcio'

type Meret = 'ASZTALI' | 'TABLET' | 'TELEFON'

const SZELESSEG: Record<Meret, number> = { ASZTALI: 1440, TABLET: 1024, TELEFON: 390 }
const MERET_NEV: Record<Meret, string> = { ASZTALI: 'Asztali', TABLET: 'Tablet', TELEFON: 'Telefon' }

export default function ArculatPage() {
  const { data, catalog, refreshCatalog } = useApp()
  const [kod, setKod] = useState<KoncepcioKod>('01')
  const [mod, setMod] = useState<Mod>('VILAGOS')
  const [meret, setMeret] = useState<Meret>('ASZTALI')
  const [valasztott, setValasztott] = useState<ArculatValasztas>({ kod: null, mod: null })
  const [ment, setMent] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [arany, setArany] = useState(1)
  const terulet = useRef<HTMLDivElement>(null)

  useEffect(() => { refreshCatalog().catch(() => {}) }, [refreshCatalog])

  useEffect(() => {
    let el = true
    data.getArculat()
      .then((v) => {
        if (!el) return
        setValasztott(v)
        if (v.kod) setKod(v.kod as KoncepcioKod)
        if (v.mod) setMod(v.mod)
      })
      .catch((e) => { if (el) setHiba(hibaSzoveg(e)) })
    return () => { el = false }
  }, [data])

  const szel = SZELESSEG[meret]
  useEffect(() => {
    const t = terulet.current
    if (!t) return
    const szamol = () => setArany(Math.min(1, (t.clientWidth - 2) / szel))
    szamol()
    const ro = new ResizeObserver(szamol)
    ro.observe(t)
    return () => ro.disconnect()
  }, [szel])

  const tabla = useMemo(() => (catalog ? csomagTabla(catalog) : null), [catalog])
  const aktiv = KONCEPCIOK.find((k) => k.kod === kod)!
  const ezAValasztott = valasztott.kod === kod && valasztott.mod === mod

  async function valaszt() {
    setMent(true)
    setHiba(null)
    try {
      await data.saveArculat(kod, mod)
      setValasztott({ kod, mod })
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setMent(false)
    }
  }

  return (
    <div className="oldal arculat-oldal">
      <div className="oldal-fej">
        <h2>Arculat</h2>
        <span className="halk arculat-alcim">A publikus oldal nyolc koncepciója, a valódi árakkal</span>
      </div>

      {hiba && <div className="hibauzenet">{hiba}</div>}

      <div className="arculat-racs">
        <nav className="arculat-lista" aria-label="Koncepciók">
          {KONCEPCIOK.map((k) => (
            <button key={k.kod} type="button" aria-pressed={k.kod === kod} onClick={() => setKod(k.kod)}>
              <span className="arculat-szam">{k.kod}</span>
              <span className="arculat-nev">
                {k.nev}
                {valasztott.kod === k.kod && (
                  <span className="cimke-pill" data-r="uj">
                    kiválasztva{valasztott.mod === 'SOTET' ? ', sötét' : ', világos'}
                  </span>
                )}
              </span>
              <span className="arculat-leiras">{k.leiras}</span>
            </button>
          ))}
        </nav>

        <div className="arculat-elonezet">
          <div className="arculat-eszkozok">
            <div className="arculat-cim">
              <strong>{aktiv.kod} {aktiv.nev}</strong>
            </div>
            <fieldset className="arculat-valto">
              <legend className="csakolvaso">Mód</legend>
              {(['VILAGOS', 'SOTET'] as Mod[]).map((m) => (
                <button key={m} type="button" aria-pressed={mod === m} onClick={() => setMod(m)}>
                  {m === 'VILAGOS' ? 'Világos' : 'Sötét'}
                </button>
              ))}
            </fieldset>
            <fieldset className="arculat-valto">
              <legend className="csakolvaso">Képernyő</legend>
              {(['ASZTALI', 'TABLET', 'TELEFON'] as Meret[]).map((m) => (
                <button key={m} type="button" aria-pressed={meret === m} onClick={() => setMeret(m)}>
                  {MERET_NEV[m]}
                </button>
              ))}
            </fieldset>
            <button type="button" className="btn btn-fo arculat-valaszt" onClick={() => void valaszt()}
                    disabled={ment || ezAValasztott}>
              {ezAValasztott ? 'Ez a kiválasztott' : ment ? 'Mentés…' : 'Ezt választom'}
            </button>
          </div>

          <div className="arculat-terulet" ref={terulet}>
            {!tabla ? (
              <div className="betolt">Betöltés…</div>
            ) : (
              <div className="arculat-keret kv-keret" style={{ width: szel, zoom: arany }}
                   data-meret={meret}>
                <Koncepcio kod={kod} mod={mod} t={tabla} />
              </div>
            )}
          </div>
          <p className="halk arculat-megjegyzes">
            Az előnézet {szel} px széles{arany < 1 ? `, ${Math.round(arany * 100)}%-ra kicsinyítve` : ''}.
            A csomagok és az árak a Szolgáltatások menüből jönnek, a sedan teljes ára.
          </p>
        </div>
      </div>
    </div>
  )
}
