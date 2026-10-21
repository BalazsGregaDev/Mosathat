import { useCallback, useEffect, useMemo, useState } from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import './publikus-oldal.css'
import type { Catalog, DataSource } from '../../data/source'
import type { CegLinkAdat, PublikusNapAdat } from '../../lib/types'
import { UZLET } from '../../lib/arculat'
import { KoncepcioKeret } from '../arculat/Koncepcio'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import { FoglalasUrlap, type FoglalasForras } from './FoglalasModul'
import { betolt, PUBLIKUS_KONCEPCIO, useNyelvAllapot, type Betoltve } from './PublikusOldal'
import { TartalomProvider, telefonLink, useNyelv, useUzlet } from './tartalom'

const SZOVEG = {
  hu: {
    cimke: 'Céges foglalás',
    cim: 'Céges időpontfoglalás',
    bevezeto: 'Időpontfoglalás a cég szerződése alapján. Ha a napon van még bőven hely, a foglalás azonnal rögzül, egyébként telefonon vagy e-mailben visszaigazoljuk.',
    ervenytelen: 'Ez a foglalási link nem érvényes',
    ervenytelenSzoveg: 'Lehet, hogy a cég új linket kapott, vagy lejárt a szerződés. Kérd el az új linket a cégednél, vagy hívj minket:',
    hiba: 'Az oldal most nem tölthető be. Kérjük, próbáld újra pár perc múlva, vagy hívj minket:',
  },
  en: {
    cimke: 'Company booking',
    cim: 'Company booking',
    bevezeto: 'Booking under your company’s contract. If the day still has plenty of room, your booking is confirmed right away; otherwise we will confirm it by phone or e-mail.',
    ervenytelen: 'This booking link is not valid',
    ervenytelenSzoveg: 'Your company may have received a new link, or the contract has ended. Ask your company for the new link, or call us:',
    hiba: 'The page cannot be loaded right now. Please try again in a few minutes, or call us:',
  },
}

function cegesKatalogus(k: Catalog, adat: CegLinkAdat): Catalog {
  return { ...k, packages: k.packages.filter((p) => adat.csomagok.includes(p.id)) }
}

function cegesForras(forras: DataSource, token: string, revision: number): FoglalasForras {
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
    quoteBooking: (input) => forras.cegAjanlat(token, input),
    onlineBooking: (input) => forras.cegFoglalas(token, input),
    teliNapok: (tol, ig) => forras.cegTeliNapok(token, tol, ig),
  }
}

function Cim({ szoveg }: { szoveg: string }) {
  useEffect(() => { document.title = szoveg }, [szoveg])
  return null
}

function Ervenytelen() {
  const nyelv = useNyelv()
  const u = useUzlet()
  const t = SZOVEG[nyelv]
  return (
    <section className="kv-foglalas kv-ceg-ervenytelen">
      <Cim szoveg={`${t.ervenytelen} — ${u.nev}`} />
      <h2>{t.ervenytelen}</h2>
      <p className="kv-bevezeto">
        {t.ervenytelenSzoveg} <a href={telefonLink(u.telefon)}>{u.telefon}</a>
      </p>
    </section>
  )
}

function CegesFoglalas({ betoltott, token, adat }: { betoltott: Betoltve; token: string; adat: CegLinkAdat }) {
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((r) => r + 1), [])
  const data = useMemo(() => cegesForras(betoltott.forras, token, revision), [betoltott.forras, token, revision])
  const katalogus = useMemo(() => cegesKatalogus(betoltott.adat.katalogus, adat), [betoltott.adat.katalogus, adat])
  const nyelv = useNyelv()
  const u = useUzlet()
  const t = SZOVEG[nyelv]
  return (
    <>
      <Cim szoveg={`${t.cim}: ${adat.ceg} — ${u.nev}`} />
      <section className="kv-ceg-sav" data-csillan>
        <div className="kv-ceg-sav-belso">
          <h1>{t.cim}</h1>
          <p>{t.bevezeto}</p>
          <p className="kv-ceg-sav-ceg">{adat.ceg}</p>
        </div>
      </section>
      <section className="kv-foglalas kv-foglalas-elo kv-ceg-foglalas">
        <FoglalasUrlap data={data} katalogus={katalogus} revision={revision} refresh={refresh}
                       nyilvanos ceges hozomviszem={adat.hozomviszem} lemondasOra={betoltott.adat.lemondasOra} cegUzenet={adat.uzenet} />
      </section>
    </>
  )
}

export default function CegFoglalasOldal({ token }: { token: string | null }) {
  const [betoltott, setBetoltott] = useState<Betoltve | null>(null)
  const [adat, setAdat] = useState<CegLinkAdat | null | undefined>(undefined)
  const [hiba, setHiba] = useState(false)
  const [nyelv, setNyelv] = useNyelvAllapot()

  useEffect(() => {
    document.title = UZLET.nev
    document.documentElement.classList.add('publikus')
    let el = true
    betolt()
      .then(async (b) => {
        const a = token ? await b.forras.cegLinkAdat(token) : null
        if (!el) return
        setBetoltott(b)
        setAdat(a)
      })
      .catch(() => { if (el) setHiba(true) })
    return () => { el = false }
  }, [token])

  if (hiba) {
    return (
      <div className="pub-allapot">
        <strong>{UZLET.nev}</strong>
        <span>{SZOVEG[nyelv].hiba} {UZLET.telefon}</span>
      </div>
    )
  }
  if (!betoltott || adat === undefined) return <div className="pub-allapot" aria-busy="true"><strong>{UZLET.nev}</strong></div>

  const mod = betoltott.adat.arculat === PUBLIKUS_KONCEPCIO && betoltott.adat.mod ? betoltott.adat.mod : 'VILAGOS'
  const valaszto = <NyelvKapcsolo nyelv={nyelv} onValt={setNyelv} />

  return (
    <TartalomProvider t={betoltott.adat.tartalom} lemondasOra={betoltott.adat.lemondasOra} nyelv={nyelv}>
      <div className="kv-keret pub-keret pub-ceg">
        <KoncepcioKeret kod={PUBLIKUS_KONCEPCIO} mod={mod} k={betoltott.adat.katalogus} nyilvanos
                        navJobbra={<div className="kv-ceg-jobb"><span className="kv-ceg-cimke">{SZOVEG[nyelv].cimke}</span>{valaszto}</div>}>
          {adat && token
            ? <CegesFoglalas betoltott={betoltott} token={token} adat={adat} />
            : <Ervenytelen />}
        </KoncepcioKeret>
      </div>
    </TartalomProvider>
  )
}
