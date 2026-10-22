import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react'

import type { Velemeny } from '../../lib/publikusTartalom'
import { useGoogle, useNyelv, useSz, useVelemenyek } from '../publikus/tartalom'

const LEPES_MS = 5600

const MINTA: Velemeny[] = [
  { nev: 'Minta Anna', csillag: 5, szoveg: 'Minta vélemény: ide kerül a Google-on kapott értékelés szövege. A Vélemények menüben veheted fel a valódiakat.', datum: null },
  { nev: 'Minta Béla', csillag: 5, szoveg: 'Minta vélemény: rövidebb szöveg is szépen elfér a kártyán.', datum: null },
  { nev: 'Minta Csilla', csillag: 4, szoveg: 'Minta vélemény: a 4 és 5 csillagos, bekapcsolt vélemények jelennek meg a publikus oldalon, a többi nem.', datum: null },
  { nev: 'Minta Dénes', csillag: 5, szoveg: 'Minta vélemény: ha több vélemény van, mint amennyi egyszerre elfér, a kártyák maguktól váltják egymást.', datum: null },
]

function csokkentett() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function egerrel(e: PointerEvent<HTMLElement>) {
  return e.pointerType === 'mouse' && !csokkentett()
}

function dontes(e: PointerEvent<HTMLElement>) {
  if (!egerrel(e)) return
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
  el.style.setProperty('--rx', `${((0.5 - y) * 14).toFixed(2)}deg`)
  el.style.setProperty('--ry', `${((x - 0.5) * 16).toFixed(2)}deg`)
  el.style.setProperty('--mx', x.toFixed(3))
  el.style.setProperty('--my', y.toFixed(3))
  if (!el.hasAttribute('data-eger')) el.setAttribute('data-eger', '')
}

function elenged(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget
  el.removeAttribute('data-eger')
  for (const v of ['--rx', '--ry', '--mx', '--my']) el.style.removeProperty(v)
}

function Csillagok({ n }: { n: number }) {
  const sz = useSz()
  return (
    <span className="kv-velemeny-csillagok" role="img" aria-label={sz('velemeny.csillag', { n: String(n) })}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} data-tele={i <= n || undefined} />)}
    </span>
  )
}

function Kartya({ v, lathato }: { v: Velemeny; lathato: boolean }) {
  const nyelv = useNyelv()
  const datum = v.datum
    ? new Intl.DateTimeFormat(nyelv === 'en' ? 'en-GB' : 'hu-HU', { year: 'numeric', month: 'long' }).format(new Date(`${v.datum}T12:00:00`))
    : null
  return (
    <li className="kv-velemeny-hely" aria-hidden={!lathato || undefined} data-lathato={lathato || undefined}>
      <figure className="kv-velemeny" onPointerMove={dontes} onPointerLeave={elenged}>
        <Csillagok n={v.csillag} />
        <blockquote><p>{v.szoveg}</p></blockquote>
        <figcaption>
          <span className="kv-velemeny-monogram" aria-hidden="true">{v.nev.trim().charAt(0).toUpperCase()}</span>
          <span className="kv-velemeny-nev">{v.nev}</span>
          {datum && <span className="kv-velemeny-datum">{datum}</span>}
        </figcaption>
      </figure>
    </li>
  )
}

function useHanyLatszik(ref: RefObject<HTMLElement | null>, van: boolean) {
  const [k, setK] = useState(3)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const szamol = () => {
      const w = el.clientWidth
      setK(w >= 980 ? 3 : w >= 620 ? 2 : 1)
    }
    szamol()
    const f = new ResizeObserver(szamol)
    f.observe(el)
    return () => f.disconnect()
  }, [ref, van])
  return k
}

export default function Velemenyek({ minta = false }: { minta?: boolean }) {
  const sajat = useVelemenyek()
  const lista = sajat.length ? sajat : minta ? MINTA : []
  const sz = useSz()
  const google = useGoogle()
  const szakasz = useRef<HTMLElement>(null)
  const n = lista.length
  const van = n > 0
  const k = useHanyLatszik(szakasz, van)
  const forog = n > k
  const [i, setI] = useState(0)
  const [ugras, setUgras] = useState(false)
  const [all, setAll] = useState(false)
  const [kint, setKint] = useState(() => typeof IntersectionObserver !== 'undefined')
  const [meret, setMeret] = useState(`${n}/${k}`)
  const erintes = useRef<number | null>(null)

  if (meret !== `${n}/${k}`) {
    setMeret(`${n}/${k}`)
    setI(0)
  }

  useEffect(() => {
    const el = szakasz.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const f = new IntersectionObserver(([b]) => setKint(!b.isIntersecting), { threshold: 0.15 })
    f.observe(el)
    return () => f.disconnect()
  }, [van])

  useEffect(() => {
    const el = szakasz.current
    if (!el) return
    const be = () => setAll(true)
    const ki = (e: FocusEvent) => { if (!el.contains(e.relatedTarget as Node | null)) setAll(false) }
    el.addEventListener('focusin', be)
    el.addEventListener('focusout', ki)
    return () => { el.removeEventListener('focusin', be); el.removeEventListener('focusout', ki) }
  }, [van])

  const tovabb = useCallback(() => { setUgras(false); setI((x) => x + 1) }, [])
  const vissza = useCallback(() => {
    if (i > 0) { setUgras(false); setI(i - 1); return }
    setUgras(true)
    setI(n)
    requestAnimationFrame(() => requestAnimationFrame(() => { setUgras(false); setI(n - 1) }))
  }, [i, n])

  useEffect(() => {
    if (!forog || all || kint || csokkentett()) return
    const t = window.setInterval(() => { if (!document.hidden) tovabb() }, LEPES_MS)
    return () => window.clearInterval(t)
  }, [forog, all, kint, tovabb])

  useEffect(() => {
    if (!ugras) return
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setUgras(false)))
    return () => cancelAnimationFrame(t)
  }, [ugras])

  if (n === 0) return null

  const elemek = forog ? [...lista, ...lista.slice(0, k)] : lista
  const vegen = () => { if (i >= n) { setUgras(true); setI(i - n) } }
  const stilus = { '--k': k, '--i': forog ? i : 0 } as CSSProperties

  return (
    <section className="kv-velemenyek" data-csillan ref={szakasz} aria-roledescription="carousel" aria-labelledby="kv-velemeny-cim"
             onPointerEnter={(e) => { if (e.pointerType === 'mouse') setAll(true) }}
             onPointerLeave={() => setAll(false)}>
      <div className="kv-velemeny-fej">
        <div>
          <span className="kv-kicker">{sz('velemeny.felcim')}</span>
          <h2 id="kv-velemeny-cim">{sz('velemeny.cim')}</h2>
        </div>
        <div className="kv-velemeny-eszkozok">
          <a className="kv-link" href={google} target="_blank" rel="noreferrer">{sz('velemeny.osszes')}</a>
          {forog && (
            <span className="kv-velemeny-nyilak">
              <button type="button" className="kv-velemeny-nyil" aria-label={sz('velemeny.elozo')} onClick={vissza} data-irany="vissza" />
              <button type="button" className="kv-velemeny-nyil" aria-label={sz('velemeny.kovetkezo')} onClick={tovabb} data-irany="tovabb" />
            </span>
          )}
        </div>
      </div>
      <div className="kv-velemeny-ablak"
           onTouchStart={(e) => { erintes.current = e.touches[0]?.clientX ?? null }}
           onTouchEnd={(e) => {
             const kezd = erintes.current
             erintes.current = null
             const veg = e.changedTouches[0]?.clientX
             if (!forog || kezd == null || veg == null || Math.abs(veg - kezd) < 40) return
             if (veg < kezd) tovabb(); else vissza()
           }}>
        <ul className="kv-velemeny-sav" style={stilus} data-ugras={ugras || undefined} data-forog={forog || undefined}
            onTransitionEnd={(e) => { if (e.target === e.currentTarget) vegen() }} aria-live={all ? 'polite' : 'off'}>
          {elemek.map((v, j) => {
            const lathato = !forog || (j >= i && j < i + k)
            return <Kartya key={`${j}-${v.nev}`} v={v} lathato={lathato} />
          })}
        </ul>
      </div>
    </section>
  )
}
