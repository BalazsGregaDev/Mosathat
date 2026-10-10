import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import { ft, hibaSzoveg } from '../../lib/format'
import type { BookingTask, FinishPreview } from '../../lib/types'

interface Kerdes {
  bookingId: string
  felirat: string
}

export function useKeszAblak(): [React.ReactNode, (bookingId: string, felirat: string) => Promise<FinishPreview | null>] {
  const [kerdes, setKerdes] = useState<Kerdes | null>(null)
  const valasz = useRef<((v: FinishPreview | null) => void) | null>(null)

  const keszVan = useCallback((bookingId: string, felirat: string) => {
    valasz.current?.(null)
    setKerdes({ bookingId, felirat })
    return new Promise<FinishPreview | null>((resolve) => { valasz.current = resolve })
  }, [])

  const lezar = useCallback((v: FinishPreview | null) => {
    valasz.current?.(v)
    valasz.current = null
    setKerdes(null)
  }, [])

  const ablak = kerdes
    ? createPortal(<KeszAblak k={kerdes} onVege={lezar} />, document.body)
    : null
  return [ablak, keszVan]
}

interface Csoport {
  kulcs: 'KULSO' | 'BELSO' | 'EGYEB'
  cim: string
  pontok: BookingTask[]
}

function KeszAblak({ k, onVege }: { k: Kerdes; onVege: (v: FinishPreview | null) => void }) {
  const { data } = useApp()
  const [lista, setLista] = useState<BookingTask[] | null>(null)
  const [pipalt, setPipalt] = useState<Set<string>>(new Set())
  const [elonezet, setElonezet] = useState<FinishPreview | null>(null)
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const megyRef = useRef(false)
  const megse = useCallback(() => { if (!megyRef.current) onVege(null) }, [onVege])

  useEffect(() => {
    let el = true
    data.getTasks(k.bookingId)
      .then((t) => { if (el) setLista(t) })
      .catch((e) => { if (el) setHiba(hibaSzoveg(e)) })
    return () => { el = false }
  }, [data, k.bookingId])

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); megse() }
    }
    window.addEventListener('keydown', f, true)
    return () => window.removeEventListener('keydown', f, true)
  }, [megse])

  const csoportok = useMemo<Csoport[]>(() => {
    if (!lista) return []
    const rend = (a: BookingTask, b: BookingTask) => a.sort_order - b.sort_order
    const csomag = lista.filter((t) => t.source === 'PACKAGE')
    return ([
      { kulcs: 'KULSO', cim: 'Külső', pontok: csomag.filter((t) => t.area === 'KULSO').sort(rend) },
      { kulcs: 'BELSO', cim: 'Belső', pontok: csomag.filter((t) => t.area !== 'KULSO').sort(rend) },
      { kulcs: 'EGYEB', cim: 'Egyéb szolgáltatások', pontok: lista.filter((t) => t.source === 'EXTRA').sort(rend) },
    ] as Csoport[]).filter((cs) => cs.pontok.length > 0)
  }, [lista])

  const kesz = (t: BookingTask) => t.done || pipalt.has(t.id)
  const nyitott = (lista ?? []).filter((t) => !t.done)
  const mindKesz = nyitott.every((t) => pipalt.has(t.id))

  const kor = useRef(0)
  useEffect(() => {
    if (!lista) return
    const sajat = ++kor.current
    data.finishPreview(k.bookingId, [...pipalt])
      .then((p) => { if (sajat === kor.current) setElonezet(p) })
      .catch((e) => { if (sajat === kor.current) setHiba(hibaSzoveg(e)) })
  }, [data, k.bookingId, lista, pipalt])

  function valt(t: BookingTask) {
    if (t.done) return
    setPipalt((s) => {
      const u = new Set(s)
      if (u.has(t.id)) u.delete(t.id); else u.add(t.id)
      return u
    })
  }

  function csoportValt(pontok: BookingTask[], kell: boolean) {
    setPipalt((s) => {
      const u = new Set(s)
      for (const t of pontok) {
        if (t.done) continue
        if (kell) u.add(t.id); else u.delete(t.id)
      }
      return u
    })
  }

  async function ment(mind = false) {
    if (megyRef.current) return
    megyRef.current = true
    setMegy(true)
    setHiba(null)
    try {
      const pipak = mind ? (lista ?? []).filter((t) => !t.done).map((t) => t.id) : [...pipalt]
      onVege(await data.finishBooking(k.bookingId, pipak))
    } catch (e) {
      setHiba(hibaSzoveg(e))
      megyRef.current = false
      setMegy(false)
    }
  }

  const csokken = elonezet && elonezet.skip_huf > 0

  return (
    <div className="fedo kerdes-fedo" role="presentation"
         onMouseDown={(e) => { if (e.target === e.currentTarget) megse() }}>
      <div className="kerdes-ablak kesz-ablak" role="dialog" aria-modal="true" aria-labelledby="kesz-cim">
        <div className="kesz-fej">
          <h2 id="kesz-cim">Kész van? <span className="rendszam">{k.felirat}</span></h2>
          {nyitott.length > 0 && (
            <button type="button" className="btn btn-kicsi" onClick={() => csoportValt(nyitott, !mindKesz)}>
              {mindKesz ? 'Pipák vissza' : 'Minden kész'}
            </button>
          )}
        </div>

        {lista === null && !hiba && <p>Betöltés…</p>}
        {lista && lista.length === 0 && <p>Ehhez a foglaláshoz nincs munkalista.</p>}
        {nyitott.length > 0 && (
          <p>
            Pipáld ki, ami elkészült. Ami üresen marad, az kimaradt: nem számít
            bele az árba. A foglalás maga nem változik.
          </p>
        )}

        <div className="kesz-lista">
          {csoportok.map((cs) => {
            const csNyitott = cs.pontok.filter((t) => !t.done)
            const csMind = csNyitott.every((t) => pipalt.has(t.id))
            return (
              <div className="munkacsoport" key={cs.kulcs} data-csoport={cs.kulcs}>
                <div className="munkacsoport-fej">
                  <span className="cim">{cs.cim}</span>
                  <span className="szam halk">
                    {cs.pontok.filter(kesz).length}/{cs.pontok.length}
                  </span>
                  {csNyitott.length > 0 && (
                    <button type="button" className={`btn btn-kicsi ${csMind ? '' : 'btn-fo'}`}
                            onClick={() => csoportValt(csNyitott, !csMind)}>
                      {csMind ? 'Vissza' : 'Mind kész'}
                    </button>
                  )}
                </div>
                <div className="munkalista">
                  {cs.pontok.map((t) => (
                    <label key={t.id} data-kesz={kesz(t)}
                           className={`munka${cs.kulcs === 'EGYEB' ? ' munka-extra' : ''}`}
                           title={t.done ? 'Már korábban kipipálva' : undefined}>
                      <input type="checkbox" checked={kesz(t)} disabled={t.done}
                             onChange={() => valt(t)} />
                      <span className="nev">{t.name}</span>
                      {!kesz(t) && <span className="kimaradt-cimke">kimarad</span>}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {elonezet && lista && lista.length > 0 && (
          <div className="kesz-ar" data-csokken={csokken ? 'true' : 'false'}>
            <span>Ár (lista szerint):</span>
            <strong className="szam">{ft(elonezet.adjusted)}</strong>
            {csokken && (
              <>
                <s className="halk szam">{ft(elonezet.base)}</s>
                <span className="kesz-ar-ok">
                  {ft(elonezet.skip_huf)}-tal kevesebb — kimaradt: {elonezet.skip_note}
                </span>
              </>
            )}
            {!csokken && elonezet.skip_note && (
              <span className="kesz-ar-ok halk">
                Kimarad: {elonezet.skip_note} — az ár ettől nem változik.
              </span>
            )}
          </div>
        )}

        {hiba && <div className="kartya-hiba" role="alert">{hiba}</div>}

        <div className="kerdes-gombok">
          <button type="button" className="btn" disabled={megy} onClick={megse}>Mégse</button>
          {!mindKesz && (
            <button type="button" className="btn btn-fo" disabled={megy || lista === null}
                    onClick={() => void ment(true)}>
              Mindennel elkészültünk
            </button>
          )}
          <button type="button" className={`btn ${mindKesz ? 'btn-fo' : ''}`} disabled={megy || lista === null}
                  onClick={() => void ment()}>
            {mindKesz ? 'Kész van' : 'Kész van, a többi kimaradt'}
          </button>
        </div>
      </div>
    </div>
  )
}
