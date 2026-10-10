import { useCallback, useEffect, useRef, useState } from 'react'

const VARAKOZAS_MS = 900

export default function DatumMezo({ ertek, onMent, ariaLabel, min, disabled }: {
  ertek: string
  onMent: (uj: string) => void
  ariaLabel: string
  min?: string
  disabled?: boolean
}) {
  const [vazlat, setVazlat] = useState(ertek)
  const [alap, setAlap] = useState(ertek)
  const mentett = useRef(ertek)
  const idozito = useRef<number | undefined>(undefined)
  const fuggo = useRef<string | null>(null)
  const onMentRef = useRef(onMent)

  if (ertek !== alap) { setAlap(ertek); setVazlat(ertek) }

  useEffect(() => { onMentRef.current = onMent })
  useEffect(() => { mentett.current = ertek }, [ertek])

  const ment = useCallback((d: string) => {
    window.clearTimeout(idozito.current)
    fuggo.current = null
    if (!/^2\d{3}-\d{2}-\d{2}$/.test(d) || d === mentett.current) return
    mentett.current = d
    onMentRef.current(d)
  }, [])

  useEffect(() => () => {
    window.clearTimeout(idozito.current)
    if (fuggo.current !== null) ment(fuggo.current)
  }, [ment])

  return (
    <input type="date" className="beviteli" aria-label={ariaLabel}
           value={vazlat} min={min} disabled={disabled}
           onChange={(e) => {
             const d = e.target.value
             setVazlat(d)
             fuggo.current = d
             window.clearTimeout(idozito.current)
             idozito.current = window.setTimeout(() => ment(d), VARAKOZAS_MS)
           }}
           onBlur={() => ment(vazlat)} />
  )
}
