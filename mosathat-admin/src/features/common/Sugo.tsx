import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
//  Súgó buborék — a kis karikás „i"
//
//  Egy szolgáltatás neve nem mindig mondja meg, mi van benne. Telefon közben
//  viszont pont ezt kérdezik: „és az mit takar?". Ezért a név mellett ott a
//  leírás, de csak akkor foglal helyet, amikor kérik.
//
//  Két módon kérhető, mert két módon használják a rendszert:
//
//    - egérrel: elég ráállni, nem kell kattintani
//    - érintéssel (a műhelyben tableten): koppintás nyitja és zárja
//
//  A buborék fixen pozicionált és a képernyőhöz igazodik. Ez azért kell, mert
//  a harmadik oszlopban lévő szolgáltatásnál egy egyszerű „a gomb alá"
//  megoldás kilógna az ablakból — és pont a hosszú leírásoknál lógna ki a
//  legjobban, tehát ott lenne olvashatatlan, ahol a legtöbbet érne.
// ---------------------------------------------------------------------------

const SZELES = 280      // a buborék legnagyobb szélessége
const RES = 8           // ennyit hagyunk a képernyő szélétől

export default function Sugo({ cim, szoveg }: { cim: string; szoveg: string }) {
  const [nyitva, setNyitva] = useState(false)
  const [hely, setHely] = useState<{ top: number; left: number } | null>(null)
  const gomb = useRef<HTMLButtonElement>(null)
  const buborek = useRef<HTMLDivElement>(null)
  // Kattintásra nyitottuk-e ki. Ez a kettő különbsége:
  //   egérrel ráállva  → az egeret elvéve eltűnik
  //   rákattintva/tappolva → kint marad, amíg újra rá nem nyomnak
  // Enélkül érintőképernyőn semmi nem látszana: a koppintás előtt a böngésző
  // egy egérrel-ráállást is küld, ami kinyitná, a koppintás meg becsukná.
  const kattintva = useRef(false)

  function helyre() {
    const g = gomb.current?.getBoundingClientRect()
    if (!g) return
    // Alapból a gomb alá, a jobb szélét a gombhoz igazítva — így a jobb
    // oldali oszlopoknál befelé nyílik.
    const left = Math.min(
      Math.max(RES, g.right - SZELES),
      window.innerWidth - SZELES - RES,
    )
    setHely({ top: g.bottom + 6, left })
  }

  // Ha alul nem fér el, a gomb fölé kerül. Ezt csak akkor tudjuk eldönteni,
  // amikor a buborék már megvan és látszik a magassága.
  useLayoutEffect(() => {
    if (!nyitva || !hely) return
    const b = buborek.current?.getBoundingClientRect()
    const g = gomb.current?.getBoundingClientRect()
    if (!b || !g) return
    if (b.bottom > window.innerHeight - RES) {
      const fent = g.top - b.height - 6
      if (fent >= RES) setHely((h) => (h && h.top !== fent ? { ...h, top: fent } : h))
    }
  }, [nyitva, hely])

  // Kívülre kattintás, Escape és görgetés zárja. A görgetés azért, mert a
  // buborék fix helyen áll, az oldal meg elmozdul alatta.
  useEffect(() => {
    if (!nyitva) return
    const zar = () => { kattintva.current = false; setNyitva(false) }
    const kint = (e: PointerEvent) => {
      if (gomb.current?.contains(e.target as Node)) return
      if (buborek.current?.contains(e.target as Node)) return
      zar()
    }
    const bill = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); zar() } }
    document.addEventListener('pointerdown', kint, true)
    document.addEventListener('keydown', bill, true)
    window.addEventListener('scroll', zar, true)
    window.addEventListener('resize', zar)
    return () => {
      document.removeEventListener('pointerdown', kint, true)
      document.removeEventListener('keydown', bill, true)
      window.removeEventListener('scroll', zar, true)
      window.removeEventListener('resize', zar)
    }
  }, [nyitva])

  function nyit() { helyre(); setNyitva(true) }

  return (
    <>
      <button
        ref={gomb}
        type="button"
        className="sugo-gomb"
        aria-label={`${cim} — leírás`}
        aria-expanded={nyitva}
        onClick={(e) => {
          // A gomb egy pipálható sorban ül: a kattintás ne pipálja ki.
          e.preventDefault()
          e.stopPropagation()
          if (kattintva.current) { kattintva.current = false; setNyitva(false) }
          else { kattintva.current = true; nyit() }
        }}
        onMouseEnter={nyit}
        onMouseLeave={() => { if (!kattintva.current) setNyitva(false) }}
        onFocus={nyit}
        onBlur={() => { if (!kattintva.current) setNyitva(false) }}
      >
        i
      </button>

      {nyitva && hely && (
        <div
          ref={buborek}
          className="sugo-buborek"
          role="tooltip"
          style={{ top: hely.top, left: hely.left, width: SZELES }}
        >
          <div className="sugo-cim">{cim}</div>
          <div className="sugo-szoveg">{szoveg}</div>
        </div>
      )}
    </>
  )
}
