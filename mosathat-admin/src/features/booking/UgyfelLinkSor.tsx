import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { foglalasOldalCim, vagolapra } from '../../lib/cegLink'
import { hibaSzoveg } from '../../lib/format'
import type { DayBooking } from '../../lib/types'
import QrAblak from '../ceglink/QrAblak'

export default function UgyfelLinkSor({ b }: { b: DayBooking }) {
  const { data } = useApp()
  const [link, setLink] = useState<string | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [masolva, setMasolva] = useState(false)
  const [qr, setQr] = useState(false)

  useEffect(() => {
    let el = true
    data.foglalasLink(b.id)
      .then((t) => { if (el) setLink(foglalasOldalCim(t)) })
      .catch((e) => { if (el) setHiba(hibaSzoveg(e)) })
    return () => { el = false }
  }, [data, b.id])

  useEffect(() => {
    if (!masolva) return
    const t = window.setTimeout(() => setMasolva(false), 2000)
    return () => window.clearTimeout(t)
  }, [masolva])

  async function masol() {
    if (!link) return
    if (await vagolapra(link)) setMasolva(true)
    else setHiba('A vágólapra másolás nem sikerült. Nyisd meg az oldalt, és másold ki a címsorból.')
  }

  const rendszam = (b.plate_raw ?? '').toUpperCase()
  return (
    <div className="adatsor ml-ugyfellink">
      <span>Az ügyfél foglalási oldala</span>
      <span className="ertek">
        <button type="button" className="btn" disabled={!link} onClick={() => void masol()}>
          {masolva ? 'Másolva' : 'Link másolása'}
        </button>
        <button type="button" className="btn" disabled={!link} onClick={() => setQr(true)}>QR-kód</button>
        {link
          ? <a className="btn" href={link} target="_blank" rel="noreferrer">Megnyitás</a>
          : <button type="button" className="btn" disabled>Megnyitás</button>}
      </span>
      {hiba && <span className="szerk-hiba">{hiba}</span>}
      {qr && link && (
        <QrAblak cegNev={rendszam} link={link} onBezar={() => setQr(false)} cim="Az ügyfél foglalási oldala"
                 fajl={`foglalas-${rendszam.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'ugyfel'}.png`}
                 leiras="Az ügyfél beolvassa a telefonja kamerájával, és megnyílik a foglalása oldala: látja az adatait, módosítást kérhet, és látja, ha elkészült az autó." />
      )}
    </div>
  )
}
