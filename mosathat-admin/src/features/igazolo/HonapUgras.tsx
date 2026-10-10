import { useState } from 'react'

const HONAP_NEVEK = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('hu-HU', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2026, i, 15))))

export default function HonapUgras({ honap, onLep }: {
  honap: string
  onLep: (uj: string) => void
}) {
  const ev = honap.slice(0, 4)
  const [szoveg, setSzoveg] = useState(ev)
  const [elozoEv, setElozoEv] = useState(ev)
  if (ev !== elozoEv) {
    setElozoEv(ev)
    setSzoveg(ev)
  }

  function evIrva(s: string) {
    const tiszta = s.replace(/[^0-9]/g, '')
    setSzoveg(tiszta)
    if (/^\d{4}$/.test(tiszta)) onLep(`${tiszta}-${honap.slice(5, 7)}-01`)
  }

  function evLep(irany: 1 | -1) {
    onLep(`${Number(ev) + irany}-${honap.slice(5, 7)}-01`)
  }

  return (
    <div className="honap-ugras">
      <span className="halk">Másik hónap:</span>
      <span className="ev-valaszto">
        <input className="beviteli ev-mezo" inputMode="numeric" aria-label="Év"
               value={szoveg} maxLength={4}
               onChange={(e) => evIrva(e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === 'ArrowUp') { e.preventDefault(); evLep(1) }
                 if (e.key === 'ArrowDown') { e.preventDefault(); evLep(-1) }
               }} />
        <span className="ev-nyilak">
          <button type="button" className="ev-nyil" aria-label="Következő év"
                  onClick={() => evLep(1)}>▲</button>
          <button type="button" className="ev-nyil" aria-label="Előző év"
                  onClick={() => evLep(-1)}>▼</button>
        </span>
      </span>
      <select className="beviteli" aria-label="Hónap" value={Number(honap.slice(5, 7))}
              onChange={(e) => onLep(`${ev}-${String(e.target.value).padStart(2, '0')}-01`)}>
        {HONAP_NEVEK.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
      </select>
    </div>
  )
}
