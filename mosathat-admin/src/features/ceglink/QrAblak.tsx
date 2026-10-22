import { useEffect, useState } from 'react'

import Ablak from '../common/Ablak'

function fajlnev(ceg: string): string {
  const alap = ceg.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `foglalas-qr-${alap || 'ceg'}.png`
}

export default function QrAblak({ cegNev, link, onBezar, cim = 'Foglalási QR-kód', leiras, fajl }: {
  cegNev: string
  link: string
  onBezar: () => void
  cim?: string
  leiras?: string
  fajl?: string
}) {
  const [kep, setKep] = useState<string | null>(null)
  const [hiba, setHiba] = useState(false)

  useEffect(() => {
    let el = true
    import('qrcode')
      .then((q) => q.toDataURL(link, { width: 720, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#14181a', light: '#ffffff' } }))
      .then((url) => { if (el) setKep(url) })
      .catch(() => { if (el) setHiba(true) })
    return () => { el = false }
  }, [link])

  return (
    <Ablak osztaly="fedo kerdes-fedo" cimkeId="qr-cim" onEsc={onBezar} onHatter={onBezar}>
      <div className="kerdes-ablak qr-ablak">
        <h2 id="qr-cim">{cim}</h2>
        <p className="qr-ceg">{cegNev}</p>
        <div className="qr-kep" aria-busy={!kep && !hiba}>
          {kep && <img src={kep} alt={`QR-kód: ${cegNev} foglalási oldala`} />}
          {hiba && <p className="hibauzenet">A QR-kódot nem sikerült elkészíteni.</p>}
        </div>
        <p>{leiras ?? 'Olvasd be a telefonod kamerájával. A megnyíló foglalási oldalt elmentheted a könyvjelzők közé vagy a kezdőképernyőre.'}</p>
        <p className="qr-link">{link}</p>
        <div className="kerdes-gombok">
          <button type="button" className="btn" onClick={onBezar}>Bezárás</button>
          {kep ? (
            <a className="btn btn-fo" href={kep} download={fajl ?? fajlnev(cegNev)}>Letöltés (PNG)</a>
          ) : (
            <button type="button" className="btn btn-fo" disabled>Letöltés (PNG)</button>
          )}
        </div>
      </div>
    </Ablak>
  )
}
