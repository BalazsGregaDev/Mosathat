import { useEffect, useRef, useState } from 'react'

import { hibaSzoveg } from '../../lib/format'

type Mentes = 'nincs' | 'megy' | 'kesz' | 'hiba'

export default function SzamMezo({
  ertek, onMent, cimke, suffix, hianyzoJelzes = true, lepes = 100,
}: {
  ertek: number | null
  onMent: (v: number | null) => Promise<void>
  cimke: string
  suffix?: string
  hianyzoJelzes?: boolean
  lepes?: number
}) {
  const [v, setV] = useState(ertek === null ? '' : String(ertek))
  const [alap, setAlap] = useState(ertek)
  const [allapot, setAllapot] = useState<Mentes>('nincs')
  const [hiba, setHiba] = useState<string | undefined>(undefined)
  const idozito = useRef<number | undefined>(undefined)

  if (ertek !== alap) { setAlap(ertek); setV(ertek === null ? '' : String(ertek)) }

  useEffect(() => () => window.clearTimeout(idozito.current), [])

  async function ki() {
    const uj = v.trim() === '' ? null : Number(v)
    if (uj !== null && !Number.isFinite(uj)) return
    if (uj === ertek) return
    window.clearTimeout(idozito.current)
    setAllapot('megy')
    setHiba(undefined)
    try {
      await onMent(uj)
      setAllapot('kesz')
      idozito.current = window.setTimeout(() => setAllapot('nincs'), 1200)
    } catch (e) {
      setAllapot('hiba')
      setHiba(hibaSzoveg(e))
    }
  }

  const hianyzik = hianyzoJelzes && v.trim() === ''

  return (
    <span className="szammezo" data-allapot={allapot} data-hianyzik={hianyzik} title={hiba}>
      <input
        className="beviteli szam"
        type="number"
        inputMode="numeric"
        step={lepes}
        aria-label={cimke}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => void ki()}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  )
}
