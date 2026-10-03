import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ---------------------------------------------------------------------------
//  Megerősítő kérdés: „Biztosan elkészült?"  [Nem]  [Igen]
//
//  Miért nem a böngésző saját ablaka (window.confirm):
//
//    • telefonon apró, a böngésző címével kezdődik („localhost üzenete"),
//      és a gombjai kisebbek, mint amit vizes ujjal el lehet találni
//    • nem lehet megmondani, melyik gomb mit jelent — mindig OK / Mégse
//    • egyes böngészők egy idő után felajánlják, hogy „ne mutassa többet"
//      az oldal ablakait — onnantól a kérdés csendben elmarad
//
//  Használat egy komponensben:
//
//      const [kerdesAblak, kerdez] = useKerdes()
//      …
//      if (!(await kerdez({ cim: 'Biztosan elkészült?' }))) return
//      …
//      return <>…{kerdesAblak}</>
//
//  A kérdés egy ígéretet (Promise) ad vissza: igaz, ha Igen, hamis, ha Nem
//  vagy mellékattintás / Escape. Így a hívó kód sorban olvasható marad.
// ---------------------------------------------------------------------------

export interface KerdesBeallitas {
  /** A kérdés maga. Rövid: „Biztosan elkészült?" */
  cim: string
  /** Egy-két mondat alatta, ha kell. */
  szoveg?: string
  igen?: string
  nem?: string
  /** Törlésnél: az Igen gomb a „veszélyes" színt kapja. */
  veszelyes?: boolean
}

export function useKerdes(): [React.ReactNode, (k: KerdesBeallitas) => Promise<boolean>] {
  const [kerdes, setKerdes] = useState<KerdesBeallitas | null>(null)
  const valasz = useRef<((v: boolean) => void) | null>(null)

  const kerdez = useCallback((k: KerdesBeallitas) => {
    // Ha egy előző kérdés még nyitva lenne, azt nemmel zárjuk le.
    valasz.current?.(false)
    setKerdes(k)
    return new Promise<boolean>((resolve) => { valasz.current = resolve })
  }, [])

  const lezar = useCallback((v: boolean) => {
    valasz.current?.(v)
    valasz.current = null
    setKerdes(null)
  }, [])

  // A dokumentum gyökerébe kerül, nem oda, ahol a hívó áll: így egy másik
  // ablak (munkalap) belsejéből is felül van, és annak a háttérre-kattintás
  // kezelője sem kapja meg az itteni kattintásokat.
  const ablak = kerdes
    ? createPortal(<KerdesAblak k={kerdes} onValasz={lezar} />, document.body)
    : null
  return [ablak, kerdez]
}

function KerdesAblak({ k, onValasz }: { k: KerdesBeallitas; onValasz: (v: boolean) => void }) {
  const igenGomb = useRef<HTMLButtonElement>(null)

  // Escape = Nem. A fókusz az Igen gombra kerül, így billentyűzetről egy
  // Enter elég — telefonon ez nem hoz fel semmit, csak kijelöli a gombot.
  useEffect(() => {
    igenGomb.current?.focus()
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onValasz(false) }
    }
    window.addEventListener('keydown', f, true)
    return () => window.removeEventListener('keydown', f, true)
  }, [onValasz])

  return (
    <div className="fedo kerdes-fedo" role="presentation"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onValasz(false) }}>
      <div className="kerdes-ablak" role="alertdialog" aria-modal="true"
           aria-labelledby="kerdes-cim" aria-describedby={k.szoveg ? 'kerdes-szoveg' : undefined}>
        <h2 id="kerdes-cim">{k.cim}</h2>
        {k.szoveg && <p id="kerdes-szoveg">{k.szoveg}</p>}
        <div className="kerdes-gombok">
          <button type="button" className="btn" onClick={() => onValasz(false)}>
            {k.nem ?? 'Nem'}
          </button>
          <button type="button" ref={igenGomb}
                  className={`btn ${k.veszelyes ? 'btn-veszelyes-teli' : 'btn-fo'}`}
                  onClick={() => onValasz(true)}>
            {k.igen ?? 'Igen'}
          </button>
        </div>
      </div>
    </div>
  )
}
