import { useEffect, useState } from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import './publikus-oldal.css'
import { createDataSource } from '../../data'
import type { PublikusAdat } from '../../data/source'
import { UZLET, type KoncepcioKod } from '../../lib/arculat'
import Koncepcio from '../arculat/Koncepcio'

const PUBLIKUS_KONCEPCIO: KoncepcioKod = '03'

let betoltes: Promise<PublikusAdat> | null = null

function betolt(): Promise<PublikusAdat> {
  betoltes ??= (async () => {
    const forras = await createDataSource()
    await forras.init()
    return forras.getPublikus()
  })().catch((e) => {
    betoltes = null
    throw e
  })
  return betoltes
}

export default function PublikusOldal() {
  const [adat, setAdat] = useState<PublikusAdat | null>(null)
  const [hiba, setHiba] = useState(false)

  useEffect(() => {
    document.title = `${UZLET.nev} — kézi autókozmetika, ${UZLET.irsz}, ${UZLET.cim}`
    document.documentElement.classList.add('publikus')
    let el = true
    betolt()
      .then((a) => { if (el) setAdat(a) })
      .catch(() => { if (el) setHiba(true) })
    return () => { el = false }
  }, [])

  if (hiba) {
    return (
      <div className="pub-allapot">
        <strong>{UZLET.nev}</strong>
        <span>Az oldal most nem tölthető be. Kérjük, próbáld újra pár perc múlva, vagy hívj minket: {UZLET.telefon}</span>
      </div>
    )
  }
  if (!adat) return <div className="pub-allapot" aria-busy="true"><strong>{UZLET.nev}</strong></div>

  const mod = adat.arculat === PUBLIKUS_KONCEPCIO && adat.mod ? adat.mod : 'VILAGOS'

  return (
    <div className="kv-keret pub-keret">
      <Koncepcio kod={PUBLIKUS_KONCEPCIO} mod={mod} k={adat.katalogus} />
    </div>
  )
}
