import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg } from '../../lib/format'
import type { DayBooking } from '../../lib/types'
import BookingCard from './BookingCard'
import FlottaKartya from './FlottaKartya'
import { azonosito } from './MiniKartya'

const SZEL = 80

interface Huzas {
  id: string
  kezd: number
  cel: number
  dy: number
  lepes: number
}

interface HuzasAdat {
  pointerId: number
  kezdoY: number
  kozepek: number[]
  gorgeto: HTMLElement
  ujY: number
  raf: number
}

function gorgetoElem(el: HTMLElement): HTMLElement {
  let x: HTMLElement | null = el.parentElement
  while (x) {
    const oy = getComputedStyle(x).overflowY
    if ((oy === 'auto' || oy === 'scroll') && x.scrollHeight > x.clientHeight) return x
    x = x.parentElement
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement
}

function athelyez<T>(t: T[], honnan: number, hova: number): T[] {
  const uj = t.slice()
  const [x] = uj.splice(honnan, 1)
  uj.splice(hova, 0, x)
  return uj
}

function kibont(lista: DayBooking[]): string[] {
  return lista.flatMap((b) => (b.flotta ? b.flotta.map((t) => t.id) : [b.id]))
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
  onAtrendez: (ids: string[]) => void
}) {
  const { data, refresh } = useApp()
  const [huzas, setHuzas] = useState<Huzas | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const elemek = useRef(new Map<string, HTMLDivElement>())
  const adat = useRef<HuzasAdat | null>(null)
  const huzasRef = useRef<Huzas | null>(null)
  const fokuszKell = useRef<string | null>(null)
  const huzasAllit = useCallback((h: Huzas | null) => {
    huzasRef.current = h
    setHuzas(h)
  }, [])

  const ment = useCallback(async (ids: string[]) => {
    onAtrendez(ids)
    setHiba(null)
    try {
      await data.setDayOrder(nap, ids)
      refresh()
    } catch (e) {
      setHiba(hibaSzoveg(e))
      refresh()
    }
  }, [data, nap, onAtrendez, refresh])

  useEffect(() => {
    const id = fokuszKell.current
    if (!id) return
    fokuszKell.current = null
    elemek.current.get(id)?.querySelector<HTMLButtonElement>('.fogo')?.focus()
  })

  useEffect(() => () => {
    if (!adat.current) return
    cancelAnimationFrame(adat.current.raf)
    document.body.classList.remove('huzas-folyik')
  }, [])

  const frissit = useCallback(() => {
    const a = adat.current
    const h = huzasRef.current
    if (!a || !h) return
    const y = a.ujY + a.gorgeto.scrollTop
    const dy = y - a.kezdoY
    const kozep = a.kozepek[h.kezd] + dy
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
    if (!mentse || !h) return
    const kezd = bookings.findIndex((b) => b.id === h.id)
    if (kezd === -1 || h.cel === kezd) return
    void ment(kibont(athelyez(bookings, kezd, h.cel)))
  }

  const vegeRef = useRef(vege)
  useEffect(() => { vegeRef.current = vege })
  const huzasFolyik = huzas !== null
  useEffect(() => {
    if (!huzasFolyik) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); vegeRef.current(false) } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [huzasFolyik])

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

    function gorget() {
      if (adat.current !== a) return
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

  function billentyu(e: React.KeyboardEvent, index: number) {
    const irany = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!irany) return
    e.preventDefault()
    const hova = index + irany
    if (hova < 0 || hova >= bookings.length) return
    fokuszKell.current = bookings[index].id
    void ment(kibont(athelyez(bookings, index, hova)))
  }

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
                aria-label={`${azonosito(b)} áthelyezése a listában (fel/le nyíl)`}
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
                : <BookingCard b={b} nap={nap} onMegnyit={() => onMegnyit(b.id)} onModosit={onModosit} />}
            </div>
          )
        })}
      </div>
    </>
  )
}
