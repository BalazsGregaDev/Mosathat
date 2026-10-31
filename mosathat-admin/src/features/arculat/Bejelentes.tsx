import { useEffect, useId, useRef, useState } from 'react'

import './bejelentes.css'
import { egyediLathato, egyediSzoveg, felugroLathato, felugroSzoveg, type Felugro } from '../../lib/bejelentes'
import type { Nyelv } from '../../lib/nyelv'
import { Gazdag, useEgyedi, useFelugro, useNyelv } from '../publikus/tartalom'
import { egerElhagy, egerKovet } from './csillanas'

const LATTA_TAR = 'mosathat.felugro'

function lattaMar(valtozat: string): boolean {
  if (!valtozat) return false
  try {
    return window.localStorage.getItem(LATTA_TAR) === valtozat
  } catch {
    return false
  }
}

function megjegyez(valtozat: string) {
  if (!valtozat) return
  try {
    window.localStorage.setItem(LATTA_TAR, valtozat)
  } catch {
    return
  }
}

export function EgyediSzekcio() {
  const e = useEgyedi()
  const nyelv = useNyelv()
  if (!egyediLathato(e)) return null
  const szoveg = egyediSzoveg(e, nyelv)
  const kepek = e.kepek.length > 0 && (
    <div className="kv-egyedi-kepek" data-db={e.kepek.length}>
      {e.kepek.map((k, i) => <img key={`${i}-${k.slice(-24)}`} src={k} alt="" decoding="async" />)}
    </div>
  )
  return (
    <section className="kv-egyedi" data-igazitas={e.igazitas.toLowerCase()} data-meret={e.meret.toLowerCase()}>
      {e.kep_hely === 'FELETT' && kepek}
      {szoveg && <p className="kv-egyedi-szoveg"><Gazdag s={szoveg} /></p>}
      {e.kep_hely === 'ALATT' && kepek}
    </section>
  )
}

export function FelugroDoboz({ f, nyelv, onBezar, cimId }: { f: Felugro; nyelv: Nyelv; onBezar?: () => void; cimId?: string }) {
  const { cim, szoveg } = felugroSzoveg(f, nyelv)
  return (
    <div className="kv-felugro-doboz" tabIndex={-1}>
      <button type="button" className="kv-felugro-x" aria-label={nyelv === 'en' ? 'Close' : 'Bezárás'} onClick={onBezar}>
        <span aria-hidden="true">×</span>
      </button>
      {cim && <h2 id={cimId}>{cim}</h2>}
      <p className="kv-felugro-szoveg"><Gazdag s={szoveg} /></p>
      <div className="kv-felugro-lab">
        <button type="button" className="kv-gomb kv-gomb-lakk kv-felugro-ok" data-csillan=""
                onPointerMove={egerKovet} onPointerLeave={egerElhagy} onClick={onBezar}>
          {nyelv === 'en' ? 'Confirm' : 'Rendben'}
        </button>
      </div>
    </div>
  )
}

export function FelugroAblak() {
  const f = useFelugro()
  const nyelv = useNyelv()
  const ablak = useRef<HTMLDialogElement>(null)
  const cimId = useId()
  const valtozat = f?.valtozat ?? ''
  const [bezarva, setBezarva] = useState(() => lattaMar(valtozat))
  const lathato = felugroLathato(f) && !bezarva

  useEffect(() => {
    const d = ablak.current
    if (!lathato || !d || d.open) return
    d.showModal()
    d.querySelector<HTMLElement>('.kv-felugro-doboz')?.focus()
  }, [lathato])

  if (!lathato) return null
  const bezar = () => {
    megjegyez(valtozat)
    ablak.current?.close()
    setBezarva(true)
  }
  const { cim } = felugroSzoveg(f, nyelv)
  return (
    <dialog ref={ablak} className="kv-felugro" aria-labelledby={cim ? cimId : undefined}
            aria-label={cim ? undefined : nyelv === 'en' ? 'Announcement' : 'Bejelentés'}
            onCancel={(e) => { e.preventDefault(); bezar() }}>
      <FelugroDoboz f={f} nyelv={nyelv} onBezar={bezar} cimId={cimId} />
    </dialog>
  )
}
