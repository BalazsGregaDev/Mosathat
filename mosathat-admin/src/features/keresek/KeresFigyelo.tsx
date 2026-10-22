import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp, useRevizio } from '../../state/AppContext'
import type { OnlineKeres } from '../../lib/types'
import KeresAblak from './KeresAblak'

const HALASZTAS_MS = 15 * 60_000

export default function KeresFigyelo({ onMegnyit, onLathato }: { onMegnyit: (id: string) => void; onLathato?: (lathato: boolean) => void }) {
  const { data } = useApp()
  const revision = useRevizio()
  const [lista, setLista] = useState<OnlineKeres[]>([])
  const [halasztva, setHalasztva] = useState<Record<string, number>>({})
  const [ora, setOra] = useState(() => Date.now())
  const [valasztott, setValasztott] = useState<string | null>(null)
  const [zarolt, setZarolt] = useState<OnlineKeres | null>(null)
  const kerSzam = useRef(0)

  const betolt = useCallback(() => {
    const n = ++kerSzam.current
    data.listOnlineKeresek()
      .then((l) => { if (n === kerSzam.current) setLista(l) })
      .catch(() => {})
  }, [data])

  useEffect(() => { betolt() }, [betolt, revision])
  useEffect(() => data.subscribe(betolt), [data, betolt])
  useEffect(() => {
    const t = setInterval(() => setOra(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const varo = lista.filter((k) => (halasztva[k.id] ?? 0) <= ora)
  const mutatott = zarolt ?? varo.find((k) => k.id === valasztott) ?? varo[0] ?? null
  const index = mutatott ? varo.indexOf(mutatott) : -1
  const lathato = mutatott !== null
  useEffect(() => { onLathato?.(lathato) }, [onLathato, lathato])

  function kesobb() {
    const most = Date.now()
    setHalasztva((h) => {
      const uj = { ...h }
      for (const k of lista) uj[k.id] = most + HALASZTAS_MS
      return uj
    })
    setOra(most)
  }

  function lapoz(irany: 1 | -1) {
    if (varo.length === 0) return
    setValasztott(varo[(index + irany + varo.length) % varo.length].id)
  }

  return (
    <>
      {mutatott && (
        <KeresAblak
          key={mutatott.id}
          keres={mutatott}
          sorszam={zarolt ? 1 : index + 1}
          osszes={zarolt ? 1 : varo.length}
          ugyanarra={lista.filter((k) => k.id !== mutatott.id && k.service_date === mutatott.service_date).length}
          onLapoz={lapoz}
          onKesobb={kesobb}
          onMegnyit={onMegnyit}
          onZarol={(be) => setZarolt(be ? mutatott : null)}
          onDontott={() => { setZarolt(null); betolt() }}
        />
      )}
      {!mutatott && lista.length > 0 && (
        <button type="button" className="keres-jelzo"
                onClick={() => { setHalasztva({}); setOra(Date.now()) }}>
          <strong>{lista.length}</strong> online foglalási kérés vár
        </button>
      )}
    </>
  )
}
