import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import type { DayBooking } from '../../lib/types'
import BookingCard from './BookingCard'
import FlottaKartya from './FlottaKartya'

// ---------------------------------------------------------------------------
//  A nap egyetlen listája, kézzel rendezhető sorrendben
//
//  Nincsenek órasávok: a nap egy sor egymás alatti kártya, abban a
//  sorrendben, ahogy a műhely dolgozik. A sorrendet a kártya bal oldalán
//  lévő fogóval lehet megváltoztatni — megfogod, húzod, elengeded.
//
//  A sorrend az adatbázisban van (day_order), napra szólóan. Így minden
//  gépen és tableten ugyanaz, és semmi más nem írja felül: az állapotgomb
//  („Kész van") nem rendezi át a listát, és egy új foglalás sem tolja el a
//  meglévőket — az új az érkezési ideje szerinti helyre kerül be.
//
//  Hogyan működik a húzás (egér, ujj, toll — mind ugyanaz, „pointer"):
//
//    1. A fogó megnyomásakor lemérjük az összes kártya helyét.
//    2. Húzás közben a megfogott kártya követi az ujjat; a többi kártya
//       odébb csúszik, hogy látsszon, hova kerülne.
//    3. Elengedéskor a lista azonnal az új sorrendben áll, a mentés utána
//       megy. Ha a mentés hibára fut, visszaáll a régi sorrend.
//
//  Ha a lista hosszabb a képernyőnél, a széléhez húzva magától görget.
//
//  Billentyűzetről: a fogóra lépve (Tab) a fel/le nyíl egy hellyel mozgat.
// ---------------------------------------------------------------------------

/** Ennyi pixelre a görgethető terület szélétől kezd el magától görgetni. */
const SZEL = 80

interface Huzas {
  id: string
  kezd: number        // honnan indult (index)
  cel: number         // hova kerülne, ha most elengednék
  dy: number          // mennyit mozdult a kártya (px)
  lepes: number       // ennyivel csúsznak odébb a többiek (a kártya magassága + hézag)
}

/** A húzás közben változó, de a megjelenítést nem érintő adatok. */
interface HuzasAdat {
  pointerId: number
  kezdoY: number               // az ujj helye induláskor, tartalom-koordinátában
  kozepek: number[]            // minden kártya közepe, tartalom-koordinátában
  gorgeto: HTMLElement
  ujY: number                  // az ujj utolsó helye (képernyő-koordináta)
  raf: number
}

/** A legközelebbi görgethető szülő. A napi nézetben ez a fő tartalom-terület. */
function gorgetoElem(el: HTMLElement): HTMLElement {
  let x: HTMLElement | null = el.parentElement
  while (x) {
    const oy = getComputedStyle(x).overflowY
    if ((oy === 'auto' || oy === 'scroll') && x.scrollHeight > x.clientHeight) return x
    x = x.parentElement
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement
}

/** A tömb egy elemét áthelyezi: [a, b, c], 0 → 2 = [b, c, a]. */
function athelyez<T>(t: T[], honnan: number, hova: number): T[] {
  const uj = t.slice()
  const [x] = uj.splice(honnan, 1)
  uj.splice(hova, 0, x)
  return uj
}

export default function NapiLista({
  nap,
  bookings,
  onMegnyit,
  onModosit,
  onAtrendez,
}: {
  nap: string
  bookings: DayBooking[]
  onMegnyit: (id: string) => void
  onModosit: (id: string, valtozas: Partial<DayBooking>) => void
  /** A lista helyben, azonnal átrendeződik (a mentés külön megy). */
  onAtrendez: (ids: string[]) => void
}) {
  const { data, refresh } = useApp()
  const [huzas, setHuzas] = useState<Huzas | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const elemek = useRef(new Map<string, HTMLDivElement>())
  const adat = useRef<HuzasAdat | null>(null)
  // Ugyanaz, mint a `huzas`, de mindig a legfrissebb: a mozgás- és az
  // elengedés-esemény két rajzolás között is jöhet, és akkor a state még a
  // régi lenne.
  const huzasRef = useRef<Huzas | null>(null)
  const huzasAllit = useCallback((h: Huzas | null) => {
    huzasRef.current = h
    setHuzas(h)
  }, [])

  // --- mentés ------------------------------------------------------------------
  const ment = useCallback(async (ids: string[]) => {
    onAtrendez(ids)
    setHiba(null)
    try {
      await data.setDayOrder(nap, ids)
      refresh()            // csendes: a többi gépen is az új sorrend jelenik meg
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      refresh()            // a régi sorrend visszaáll az adatbázisból
    }
  }, [data, nap, onAtrendez, refresh])

  // --- húzás közben: hova kerülne -------------------------------------------------
  const frissit = useCallback(() => {
    const a = adat.current
    const h = huzasRef.current
    if (!a || !h) return
    const y = a.ujY + a.gorgeto.scrollTop
    const dy = y - a.kezdoY
    const kozep = a.kozepek[h.kezd] + dy
    // Annyiadik helyre kerül, ahány MÁSIK kártya közepe van fölötte.
    let cel = 0
    a.kozepek.forEach((k, i) => { if (i !== h.kezd && k < kozep) cel++ })
    huzasAllit({ ...h, dy, cel })
  }, [huzasAllit])


  function vege(mentse: boolean) {
    const a = adat.current
    const h = huzasRef.current
    if (a) cancelAnimationFrame(a.raf)
    adat.current = null
    document.body.classList.remove('huzas-folyik')
    huzasAllit(null)
    if (mentse && h && h.cel !== h.kezd) {
      void ment(athelyez(bookings.map((b) => b.id), h.kezd, h.cel))
    }
  }

  // Escape: a húzás megszakad, minden marad a régiben.
  useEffect(() => {
    if (!huzas) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); vege(false) } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  })

  function indul(e: React.PointerEvent<HTMLButtonElement>, id: string, index: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)

    const gorgeto = gorgetoElem(e.currentTarget)
    const fent = gorgeto.scrollTop
    const dobozok = bookings.map((b) => elemek.current.get(b.id)?.getBoundingClientRect())
    if (dobozok.some((d) => !d)) return
    const d = dobozok as DOMRect[]
    const hezag = d.length > 1 ? Math.max(0, d[1].top - d[0].bottom) : 12

    const a: HuzasAdat = {
      pointerId: e.pointerId,
      kezdoY: e.clientY + fent,
      kozepek: d.map((x) => x.top + fent + x.height / 2),
      gorgeto,
      ujY: e.clientY,
      raf: 0,
    }
    adat.current = a
    document.body.classList.add('huzas-folyik')
    huzasAllit({ id, kezd: index, cel: index, dy: 0, lepes: d[index].height + hezag })

    // A szélén magától görget, amíg ott tartják az ujjukat. Képkockánként
    // egy kis lépés — minél közelebb a széléhez, annál gyorsabban.
    function gorget() {
      if (adat.current !== a) return            // közben vége lett a húzásnak
      const r = a.gorgeto === document.scrollingElement
        ? { top: 0, bottom: window.innerHeight }
        : a.gorgeto.getBoundingClientRect()
      let v = 0
      if (a.ujY < r.top + SZEL) v = -Math.ceil((r.top + SZEL - a.ujY) / 6)
      else if (a.ujY > r.bottom - SZEL) v = Math.ceil((a.ujY - (r.bottom - SZEL)) / 6)
      if (v !== 0) {
        a.gorgeto.scrollTop += v
        frissit()
      }
      a.raf = requestAnimationFrame(gorget)
    }
    a.raf = requestAnimationFrame(gorget)
  }

  function mozog(e: React.PointerEvent) {
    const a = adat.current
    if (!a || e.pointerId !== a.pointerId) return
    a.ujY = e.clientY
    frissit()
  }

  // Billentyűzet: a fogón a fel/le nyíl egy hellyel mozgat, és rögtön ment.
  function billentyu(e: React.KeyboardEvent, index: number) {
    const irany = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!irany) return
    e.preventDefault()
    const hova = index + irany
    if (hova < 0 || hova >= bookings.length) return
    void ment(athelyez(bookings.map((b) => b.id), index, hova))
  }

  /** Hol áll most egy kártya húzás közben (eltolás pixelben). */
  function eltolas(i: number): number {
    if (!huzas) return 0
    if (i === huzas.kezd) return huzas.dy
    const { kezd, cel, lepes } = huzas
    if (kezd < cel && i > kezd && i <= cel) return -lepes
    if (kezd > cel && i >= cel && i < kezd) return lepes
    return 0
  }

  return (
    <>
      {hiba && <div className="hibauzenet" style={{ marginBottom: 'var(--t3)' }}>{hiba}</div>}
      <div className="napi-lista" data-huzas={huzas ? 'igen' : undefined}>
        {bookings.map((b, i) => {
          const dy = eltolas(i)
          const fogva = huzas?.id === b.id
          return (
            <div
              key={b.id}
              className="sor-elem"
              data-fogva={fogva || undefined}
              ref={(el) => { if (el) elemek.current.set(b.id, el); else elemek.current.delete(b.id) }}
              style={dy ? { transform: `translateY(${dy}px)` } : undefined}
            >
              <button
                type="button"
                className="fogo"
                aria-label={`${b.plate_raw} áthelyezése a listában (fel/le nyíl)`}
                title="Fogd meg és húzd a helyére"
                onPointerDown={(e) => indul(e, b.id, i)}
                onPointerMove={mozog}
                onPointerUp={(e) => { if (adat.current?.pointerId === e.pointerId) vege(true) }}
                onPointerCancel={() => vege(false)}
                onKeyDown={(e) => billentyu(e, i)}
              >
                <span aria-hidden="true" />
              </button>
              {b.flotta
                ? <FlottaKartya b={b} onMegnyit={() => onMegnyit(b.id)} />
                : <BookingCard b={b} onMegnyit={() => onMegnyit(b.id)} onModosit={onModosit} />}
            </div>
          )
        })}
      </div>
    </>
  )
}
