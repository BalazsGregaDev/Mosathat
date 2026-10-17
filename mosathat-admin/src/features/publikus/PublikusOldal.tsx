import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import './publikus-oldal.css'
import { createDataSource } from '../../data'
import type { DataSource, PublikusAdat } from '../../data/source'
import type { PublikusNapAdat, VehicleCategory } from '../../lib/types'
import { UZLET, type KoncepcioKod } from '../../lib/arculat'
import { JOGI_CIM, JOGI_CIM_EN } from '../../lib/ceg'
import type { Nyelv } from '../../lib/nyelv'
import Koncepcio, { KoncepcioKeret } from '../arculat/Koncepcio'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import { FoglalasUrlap, type FoglalasForras } from './FoglalasModul'
import JogiOldal, { type JogiLap } from './JogiOldal'
import { TartalomProvider, useNyelv, useSz, useUzlet } from './tartalom'

const PUBLIKUS_KONCEPCIO: KoncepcioKod = '03'

export type PublikusLap = 'fooldal' | JogiLap

function Cim({ lap }: { lap: PublikusLap }) {
  const sz = useSz()
  const u = useUzlet()
  const nyelv = useNyelv()
  const cim = lap === 'fooldal' ? sz('oldal.cim')
    : `${(nyelv === 'en' ? JOGI_CIM_EN : JOGI_CIM)[lap]} — ${u.nev}`
  useEffect(() => { document.title = cim }, [cim])
  return null
}

const NYELV_TAR = 'mosathat.nyelv'

function kezdoNyelv(): Nyelv {
  const param = new URLSearchParams(window.location.search).get('lang')
  if (param === 'en' || param === 'hu') return param
  try {
    return window.localStorage.getItem(NYELV_TAR) === 'en' ? 'en' : 'hu'
  } catch {
    return 'hu'
  }
}

function useNyelvAllapot(): [Nyelv, (n: Nyelv) => void] {
  const [nyelv, setNyelv] = useState<Nyelv>(kezdoNyelv)
  useEffect(() => {
    document.documentElement.lang = nyelv
    const url = new URL(window.location.href)
    if (nyelv === 'en') url.searchParams.set('lang', 'en')
    else url.searchParams.delete('lang')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    try {
      window.localStorage.setItem(NYELV_TAR, nyelv)
    } catch {
      return
    }
  }, [nyelv])
  return [nyelv, setNyelv]
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

interface Valasztas {
  kat: VehicleCategory
  onKat: (k: VehicleCategory) => void
  csomagId: string | null
  onCsomag: (id: string | null) => void
}

function EloFoglalas({ forras, adat, valasztas }: Betoltve & { valasztas: Valasztas }) {
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((r) => r + 1), [])
  const data = useMemo(() => nyilvanosForras(forras, revision), [forras, revision])
  const sz = useSz()
  return (
    <section className="kv-foglalas kv-foglalas-elo">
      <h2>{sz('foglalas.cim')}</h2>
      <p className="kv-bevezeto">{sz('foglalas.bevezeto')}</p>
      <FoglalasUrlap data={data} katalogus={adat.katalogus} revision={revision} refresh={refresh}
                     nyilvanos lemondasOra={adat.lemondasOra} {...valasztas} />
    </section>
  )
}

function useMenuMagassag(keret: RefObject<HTMLDivElement | null>, frissit: unknown) {
  useEffect(() => {
    const k = keret.current
    const nav = k?.querySelector<HTMLElement>('.kv-nav')
    if (!k || !nav) return
    const figyelo = new ResizeObserver(() => k.style.setProperty('--nav-h', `${nav.offsetHeight}px`))
    figyelo.observe(nav)
    return () => figyelo.disconnect()
  }, [keret, frissit])
}

export default function PublikusOldal({ lap }: { lap: PublikusLap }) {
  const [betoltott, setBetoltott] = useState<Betoltve | null>(null)
  const [hiba, setHiba] = useState(false)
  const [kat, setKat] = useState<VehicleCategory>('SZEMELYAUTO')
  const [csomagId, setCsomagId] = useState<string | null>(null)
  const [nyelv, setNyelv] = useNyelvAllapot()
  const keret = useRef<HTMLDivElement>(null)
  useMenuMagassag(keret, betoltott ? lap : null)

  useEffect(() => {
    document.title = UZLET.nev
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
        <span>
          {nyelv === 'en'
            ? `The page cannot be loaded right now. Please try again in a few minutes, or call us: ${UZLET.telefon}`
            : `Az oldal most nem tölthető be. Kérjük, próbáld újra pár perc múlva, vagy hívj minket: ${UZLET.telefon}`}
        </span>
      </div>
    )
  }
  if (!betoltott) return <div className="pub-allapot" aria-busy="true"><strong>{UZLET.nev}</strong></div>

  const { adat } = betoltott
  const mod = adat.arculat === PUBLIKUS_KONCEPCIO && adat.mod ? adat.mod : 'VILAGOS'
  const valasztas: Valasztas = { kat, onKat: setKat, csomagId, onCsomag: setCsomagId }
  const valaszto = <NyelvKapcsolo nyelv={nyelv} onValt={setNyelv} />

  return (
    <TartalomProvider t={adat.tartalom} lemondasOra={adat.lemondasOra} nyelv={nyelv}>
      <Cim lap={lap} />
      <div className="kv-keret pub-keret" ref={keret}>
        {lap === 'fooldal' ? (
          <Koncepcio kod={PUBLIKUS_KONCEPCIO} mod={mod} k={adat.katalogus} nyilvanos nyelvValaszto={valaszto}
                     kat={kat} onKat={setKat} kiemelt={csomagId} onCsomag={setCsomagId}
                     foglalas={<EloFoglalas {...betoltott} valasztas={valasztas} />} />
        ) : (
          <KoncepcioKeret kod={PUBLIKUS_KONCEPCIO} mod={mod} k={adat.katalogus} nyilvanos nyelvValaszto={valaszto}>
            <JogiOldal lap={lap} />
          </KoncepcioKeret>
        )}
      </div>
    </TartalomProvider>
  )
}
