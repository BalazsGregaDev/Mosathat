import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import Ablak from './Ablak'

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

  useEffect(() => { igenGomb.current?.focus() }, [])

  return (
    <Ablak osztaly="fedo kerdes-fedo" szerep="alertdialog" cimkeId="kerdes-cim"
           leirasId={k.szoveg ? 'kerdes-szoveg' : undefined}
           onEsc={() => onValasz(false)} onHatter={() => onValasz(false)}>
      <div className="kerdes-ablak">
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
    </Ablak>
  )
}
