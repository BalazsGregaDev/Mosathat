import { useCallback, useEffect, useMemo, useState } from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import './publikus-oldal.css'
import type { DataSource } from '../../data/source'
import { CATEGORY_SHORT, type BerletLinkAdat, type PublikusNapAdat } from '../../lib/types'
import { UZLET } from '../../lib/arculat'
import { KoncepcioKeret } from '../arculat/Koncepcio'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import { FoglalasUrlap, type FoglalasForras } from './FoglalasModul'
import { betolt, PUBLIKUS_KONCEPCIO, useNyelvAllapot, type Betoltve } from './PublikusOldal'
import { TartalomProvider, telefonLink, useFormatum, useNyelv, useUzlet } from './tartalom'

const SZOVEG = {
  hu: {
    cimke: 'Bérletes foglalás',
    cim: 'Bérletes időpontfoglalás',
    bevezeto: 'Időpontfoglalás a bérletedre. A bérletből járó csomagnál nem kell fizetned, csak az esetleges extrákért. Ha a napon van még bőven hely, a foglalás azonnal rögzül, egyébként telefonon vagy e-mailben visszaigazoljuk.',
    maradt: (n: number) => `még ${n} alkalom`,
    elfogyott: 'elfogyott',
    ervenyes: 'érvényes eddig:',
    ervenytelen: 'Ez a foglalási link nem érvényes',
    ervenytelenSzoveg: 'Lehet, hogy lejárt a bérleted, vagy új linket kaptál. Hívj minket, és segítünk:',
    hiba: 'Az oldal most nem tölthető be. Kérjük, próbáld újra pár perc múlva, vagy hívj minket:',
  },
  en: {
    cimke: 'Pass booking',
    cim: 'Book with your pass',
    bevezeto: 'Booking with your pass. You don’t pay for the package covered by your pass, only for any extras. If the day still has plenty of room, your booking is confirmed right away; otherwise we will confirm it by phone or e-mail.',
    maradt: (n: number) => `${n} left`,
    elfogyott: 'used up',
    ervenyes: 'valid until',
    ervenytelen: 'This booking link is not valid',
    ervenytelenSzoveg: 'Your pass may have expired, or you may have received a new link. Give us a call and we’ll help:',
    hiba: 'The page cannot be loaded right now. Please try again in a few minutes, or call us:',
  },
}

function berletForras(forras: DataSource, token: string, revision: number): FoglalasForras {
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
    quoteBooking: (input) => forras.berletAjanlat(token, input),
    onlineBooking: (input) => forras.berletFoglalas(token, input),
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

function Allas({ adat }: { adat: BerletLinkAdat }) {
  const nyelv = useNyelv()
  const f = useFormatum()
  const t = SZOVEG[nyelv]
  return (
    <div className="kv-berlet-allas">
      {adat.berletek.map((b) => (
        <div key={`${b.nev}-${b.ervenyes}`}>
          <div className="kv-berlet-nev">{b.nev}</div>
          {b.tetelek.map((x, i) => (
            <div className="kv-berlet-sor" key={i}>
              <span>
                {nyelv === 'en' ? x.csomag_en : x.csomag}
                {x.kategoria && ` · ${CATEGORY_SHORT[x.kategoria]}`}
              </span>
              <strong>{x.maradt > 0 ? t.maradt(x.maradt) : t.elfogyott}</strong>
            </div>
          ))}
          <small>{t.ervenyes} {f.napRovidCim(b.ervenyes.slice(0, 10))}</small>
        </div>
      ))}
    </div>
  )
}

function BerletesFoglalas({ betoltott, token, adat, onFrissit }: {
  betoltott: Betoltve; token: string; adat: BerletLinkAdat; onFrissit: () => void
}) {
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => { setRevision((r) => r + 1); onFrissit() }, [onFrissit])
  const data = useMemo(() => berletForras(betoltott.forras, token, revision), [betoltott.forras, token, revision])
  const nyelv = useNyelv()
  const u = useUzlet()
  const t = SZOVEG[nyelv]
  return (
    <>
      <Cim szoveg={`${t.cim}: ${adat.nev} — ${u.nev}`} />
      <section className="kv-ceg-sav" data-csillan>
        <div className="kv-ceg-sav-belso">
          <h1>{t.cim}</h1>
          <p>{t.bevezeto}</p>
          <p className="kv-ceg-sav-ceg">{adat.nev}</p>
          <Allas adat={adat} />
        </div>
      </section>
      <section className="kv-foglalas kv-foglalas-elo kv-ceg-foglalas">
        <FoglalasUrlap data={data} katalogus={betoltott.adat.katalogus} revision={revision} refresh={refresh}
                       lemondasOra={betoltott.adat.lemondasOra} berletCsomagok={adat.csomagok} elotoltNev={adat.nev} />
      </section>
    </>
  )
}

export default function BerletFoglalasOldal({ token }: { token: string | null }) {
  const [betoltott, setBetoltott] = useState<Betoltve | null>(null)
  const [adat, setAdat] = useState<BerletLinkAdat | null | undefined>(undefined)
  const [hiba, setHiba] = useState(false)
  const [nyelv, setNyelv] = useNyelvAllapot()

  useEffect(() => {
    document.title = UZLET.nev
    document.documentElement.classList.add('publikus')
    let el = true
    betolt()
      .then(async (b) => {
        const a = token ? await b.forras.berletLinkAdat(token) : null
        if (!el) return
        setBetoltott(b)
        setAdat(a)
      })
      .catch(() => { if (el) setHiba(true) })
    return () => { el = false }
  }, [token])

  const frissit = useCallback(() => {
    if (!betoltott || !token) return
    betoltott.forras.berletLinkAdat(token).then(setAdat).catch(() => {})
  }, [betoltott, token])

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
            ? <BerletesFoglalas betoltott={betoltott} token={token} adat={adat} onFrissit={frissit} />
            : <Ervenytelen />}
        </KoncepcioKeret>
      </div>
    </TartalomProvider>
  )
}
