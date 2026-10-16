import { useCallback, useEffect, useMemo, useState } from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import './publikus-oldal.css'
import { createDataSource } from '../../data'
import type { DataSource, PublikusAdat } from '../../data/source'
import type { PublikusNapAdat } from '../../lib/types'
import { UZLET, type KoncepcioKod } from '../../lib/arculat'
import Koncepcio, { KoncepcioKeret } from '../arculat/Koncepcio'
import { FoglalasUrlap, type FoglalasForras } from './FoglalasModul'
import JogiOldal, { type JogiLap } from './JogiOldal'

const PUBLIKUS_KONCEPCIO: KoncepcioKod = '03'

export type PublikusLap = 'fooldal' | JogiLap

const CIMEK: Record<PublikusLap, string> = {
  fooldal: `${UZLET.nev} — kézi autókozmetika, ${UZLET.irsz}, ${UZLET.cim}`,
  impresszum: `Impresszum — ${UZLET.nev}`,
  adatvedelem: `Adatvédelmi tájékoztató — ${UZLET.nev}`,
}

interface Betoltve {
  forras: DataSource
  adat: PublikusAdat
}

let betoltes: Promise<Betoltve> | null = null

function betolt(): Promise<Betoltve> {
  betoltes ??= (async () => {
    const forras = await createDataSource()
    await forras.init()
    return { forras, adat: await forras.getPublikus() }
  })().catch((e) => {
    betoltes = null
    throw e
  })
  return betoltes
}

function nyilvanosForras(forras: DataSource, revision: number): FoglalasForras {
  void revision
  const napok = new Map<string, Promise<PublikusNapAdat>>()
  const nap = (d: string) => {
    let p = napok.get(d)
    if (!p) {
      p = forras.publikusNap(d).catch((e) => { napok.delete(d); throw e })
      napok.set(d, p)
    }
    return p
  }
  return {
    getDay: (d) => nap(d).then((x) => x.foglalasok),
    getDayLanes: (d) => nap(d).then((x) => x.savok),
    quoteBooking: (input) => forras.publikusAjanlat(input),
    onlineBooking: (input) => forras.publikusFoglalas(input),
  }
}

function EloFoglalas({ forras, adat }: Betoltve) {
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((r) => r + 1), [])
  const data = useMemo(() => nyilvanosForras(forras, revision), [forras, revision])
  return (
    <section className="kv-foglalas kv-foglalas-elo">
      <h2>Időpontfoglalás</h2>
      <p className="kv-bevezeto">
        Válaszd ki, mit szeretnél, és mutatjuk a szabad időpontokat. A kérésedet munkatársunk
        igazolja vissza.
      </p>
      <FoglalasUrlap data={data} katalogus={adat.katalogus} revision={revision} refresh={refresh}
                     nyilvanos lemondasOra={adat.lemondasOra} />
    </section>
  )
}

export default function PublikusOldal({ lap }: { lap: PublikusLap }) {
  const [betoltott, setBetoltott] = useState<Betoltve | null>(null)
  const [hiba, setHiba] = useState(false)

  useEffect(() => {
    document.title = CIMEK[lap]
    document.documentElement.classList.add('publikus')
    let el = true
    betolt()
      .then((b) => { if (el) setBetoltott(b) })
      .catch(() => { if (el) setHiba(true) })
    return () => { el = false }
  }, [lap])

  useEffect(() => {
    if (!betoltott || lap !== 'fooldal') return
    const cel = window.location.hash.slice(1)
    const osztaly: Record<string, string> = { csomagok: '.kv-csomagok', foglalas: '.kv-foglalas', hely: '.kv-hely', kapcsolat: '.kv-lab' }
    if (osztaly[cel]) window.setTimeout(() => document.querySelector(osztaly[cel])?.scrollIntoView(), 50)
  }, [betoltott, lap])

  if (hiba) {
    return (
      <div className="pub-allapot">
        <strong>{UZLET.nev}</strong>
        <span>Az oldal most nem tölthető be. Kérjük, próbáld újra pár perc múlva, vagy hívj minket: {UZLET.telefon}</span>
      </div>
    )
  }
  if (!betoltott) return <div className="pub-allapot" aria-busy="true"><strong>{UZLET.nev}</strong></div>

  const { adat } = betoltott
  const mod = adat.arculat === PUBLIKUS_KONCEPCIO && adat.mod ? adat.mod : 'VILAGOS'

  return (
    <div className="kv-keret pub-keret">
      {lap === 'fooldal' ? (
        <Koncepcio kod={PUBLIKUS_KONCEPCIO} mod={mod} k={adat.katalogus} nyilvanos
                   foglalas={<EloFoglalas {...betoltott} />} />
      ) : (
        <KoncepcioKeret kod={PUBLIKUS_KONCEPCIO} mod={mod} k={adat.katalogus} nyilvanos>
          <JogiOldal lap={lap} />
        </KoncepcioKeret>
      )}
    </div>
  )
}
