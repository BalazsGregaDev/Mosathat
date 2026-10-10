import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface KerdesBeallitas {
  cim: string
  szoveg?: string
  igen?: string
  nem?: string
  veszelyes?: boolean
}

export function useKerdes(): [React.ReactNode, (k: KerdesBeallitas) => Promise<boolean>] {
  const [kerdes, setKerdes] = useState<KerdesBeallitas | null>(null)
  const valasz = useRef<((v: boolean) => void) | null>(null)

  const kerdez = useCallback((k: KerdesBeallitas) => {
    valasz.current?.(false)
    setKerdes(k)
    return new Promise<boolean>((resolve) => { valasz.current = resolve })
  }, [])

  const lezar = useCallback((v: boolean) => {
    valasz.current?.(v)
    valasz.current = null
    setKerdes(null)
  }, [])

  const ablak = kerdes
    ? createPortal(<KerdesAblak k={kerdes} onValasz={lezar} />, document.body)
    : null
  return [ablak, kerdez]
}

function KerdesAblak({ k, onValasz }: { k: KerdesBeallitas; onValasz: (v: boolean) => void }) {
  const igenGomb = useRef<HTMLButtonElement>(null)

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
