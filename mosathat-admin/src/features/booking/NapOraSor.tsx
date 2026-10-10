import { useEffect, useRef, useState } from 'react'

import { hibaSzoveg } from '../../lib/format'
import IdoMezo from '../common/IdoMezo'

const VARAKOZAS_MS = 900

export default function NapOraSor({
  cimke,
  nap,
  ora,
  minNap,
  zarolt,
  oraUres,
  utotag,
  onMent,
}: {
  cimke: string
  nap: string
  ora: string
  minNap?: string
  zarolt: boolean
  oraUres?: string
  utotag?: React.ReactNode
  onMent: (m: { nap?: string; ora?: string }) => Promise<void>
}) {
  const [napP, setNapP] = useState(nap)
  const [oraP, setOraP] = useState(ora)
  const [hiba, setHiba] = useState<string | null>(null)
  const idozito = useRef<number | undefined>(undefined)
  const mentett = useRef({ nap, ora })
  const fuggo = useRef<{ nap: string; ora: string } | null>(null)
  const mentRef = useRef<(ujNap: string, ujOra: string) => Promise<void>>(async () => {})

  useEffect(() => {
    setNapP(nap); setOraP(ora)
    mentett.current = { nap, ora }
  }, [nap, ora])

  useEffect(() => () => {
    window.clearTimeout(idozito.current)
    if (fuggo.current) void mentRef.current(fuggo.current.nap, fuggo.current.ora)
  }, [])

  async function ment(ujNap: string, ujOra: string) {
    window.clearTimeout(idozito.current)
    fuggo.current = null
    const m: { nap?: string; ora?: string } = {}
    if (ujNap !== mentett.current.nap && /^(2\d{3})-\d{2}-\d{2}$/.test(ujNap)) m.nap = ujNap
    if (ujOra !== mentett.current.ora && (ujOra === '' || /^\d{2}:\d{2}$/.test(ujOra))) m.ora = ujOra
    if (m.nap === undefined && m.ora === undefined) return
    mentett.current = { nap: m.nap ?? mentett.current.nap, ora: m.ora ?? mentett.current.ora }
    try {
      await onMent(m)
      setHiba(null)
    } catch (e) {
      mentett.current = { nap, ora }
      setHiba(hibaSzoveg(e))
    }
  }

  useEffect(() => { mentRef.current = ment })

  function kesobb(ujNap: string, ujOra: string) {
    window.clearTimeout(idozito.current)
    fuggo.current = { nap: ujNap, ora: ujOra }
    idozito.current = window.setTimeout(() => void ment(ujNap, ujOra), VARAKOZAS_MS)
  }

  if (zarolt) {
    return (
      <div className="adatsor">
        <span>{cimke}</span>
        <span className="ertek">
          {nap.replaceAll('-', '. ')}. {ora || <span className="halvany">{oraUres ?? '—'}</span>}
          {utotag}
        </span>
      </div>
    )
  }

  return (
    <div className="adatsor szerk-sor napora-adat">
      <span className="szerk-cimke">{cimke}</span>
      <span className="ertek">
        <span className="napora-mezok">
          <input type="date" className="beviteli" aria-label={`${cimke} napja`}
                 value={napP} min={minNap}
                 onChange={(e) => { setNapP(e.target.value); kesobb(e.target.value, oraP) }}
                 onBlur={() => void ment(napP, oraP)} />
          <IdoMezo ariaLabel={`${cimke} órája`} cim={`${cimke} — óra`}
                   value={oraP} placeholder={oraUres} torolheto={Boolean(oraUres)}
                   onChange={(v) => { setOraP(v); kesobb(napP, v) }}
                   onKesz={(v) => void ment(napP, v)} />
          {utotag}
        </span>
        {hiba && <div className="szerk-hiba">{hiba}</div>}
      </span>
    </div>
  )
}
