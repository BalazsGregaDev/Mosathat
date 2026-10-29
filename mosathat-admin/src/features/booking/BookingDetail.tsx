import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { useMentetlen } from '../../state/useMentetlen'
import { felarasAr, ft, helyiNap, helyiOra, hibaSzoveg, idotartam, napKulonbseg, uresJel, vegOra } from '../../lib/format'
import { tobbnaposE } from '../../lib/savok'
import {
  CATEGORY_LABEL, EGYSEG, KATEGORIAK, NEXT_STATUS, SCOPE_LABEL, TERJEDELMEK, TYPE_LABEL, eloE, lemondottE,
  type BookingExtraRow, type BookingTask, type BookingType,
  type DayBooking, type MunkalapFokusz, type ServiceArea,
} from '../../lib/types'
import Szerkesztheto, { type Valaszthato } from '../common/Szerkesztheto'
import Sugo from '../common/Sugo'
import { useKerdes, type KerdesBeallitas } from '../common/Kerdes'
import { ELUTASITAS_KERDES, NEM_FERT_BE_KERDES, TORLES_KERDES } from '../common/kerdesek'
import { csomagLeiras } from '../../lib/csomagLeiras'
import Ablak from '../common/Ablak'
import Kerdojel from '../day/Kerdojel'
import FlottaMunkalap from './FlottaMunkalap'
import IgazoloGomb, { igazoloFajta } from '../igazolo/IgazoloGomb'
import { useIgazoloKapu } from '../igazolo/useIgazoloKapu'
import { useKeszAblak } from './KeszAblak'
import NapOraSor from './NapOraSor'
import CegSor from './CegSor'
import UgyfelLinkSor from './UgyfelLinkSor'
import { kovetkezoLepesFut } from './lepes'

const MERET_VALASZTO: Valaszthato[] = KATEGORIAK.map((v) => ({ ertek: v, cimke: CATEGORY_LABEL[v] }))

const CEGES_MERET_VALASZTO: Valaszthato[] = [
  { ertek: 'SZEMELYAUTO', cimke: 'Normál' },
  { ertek: 'SUV', cimke: 'Nagy' },
]

const TERJEDELEM_VALASZTO: Valaszthato[] = TERJEDELMEK.map((v) => ({ ertek: v, cimke: SCOPE_LABEL[v] }))

const TIPUSOK: Valaszthato[] = (['LEADOS', 'VAROS', 'HOZOMVISZEM'] as BookingType[])
  .map((v) => ({ ertek: v, cimke: TYPE_LABEL[v] }))

const JARMU_TIPUSOK: Valaszthato[] = [
  { ertek: 'FLOTTA', cimke: 'Flotta' },
  { ertek: 'SAJAT', cimke: 'Saját' },
]

interface Csoport {
  kulcs: 'KULSO' | 'BELSO' | 'EGYEB'
  cim: string
  area: ServiceArea | null
  csomag: BookingTask[]
  extra: BookingTask[]
  reszletezve: boolean
}

export default function BookingDetail({
  bookingId,
  onBezar,
  onSzerkeszt,
  arlistaGombok,
  arlistaPanel,
  osztott,
  fokusz,
  egyedi,
}: {
  bookingId: string
  onBezar: () => void
  onSzerkeszt: (id: string) => void
  arlistaGombok?: React.ReactNode
  arlistaPanel?: React.ReactNode
  osztott?: boolean
  fokusz?: MunkalapFokusz
  egyedi?: boolean
}) {
  const { data, catalog, refresh } = useApp()
  const [kerdesAblak, kerdez] = useKerdes()
  const [kapuAblak, kapu] = useIgazoloKapu()
  const [keszAblak, keszVan] = useKeszAblak()
  const [b, setB] = useState<DayBooking | null>(null)
  const [lista, setLista] = useState<BookingTask[]>([])
  const [mennyisegek, setMennyisegek] = useState<BookingExtraRow[]>([])
  const [tolt, setTolt] = useState(true)
  const [hiba, setHiba] = useState<string | null>(null)

  const [vegleges, setVegleges] = useState('')
  const [pct, setPct] = useState(0)
  const [fix, setFix] = useState(0)

  const [megjegyzes, setMegjegyzes] = useState('')
  const [megjMentve, setMegjMentve] = useState(true)
  const [lepesMegy, setLepesMegy] = useState(false)

  const valtozott = useRef(false)
  const kerSzam = useRef(0)
  const irasok = useRef(0)
  const kimaradtFrissites = useRef(false)
  const veglegesKezzel = useRef(false)
  const csoportRef = useRef(false)

  useMentetlen(!megjMentve)

  const betolt = useCallback(async () => {
    const n = ++kerSzam.current
    try {
      const [f, t, m] = await Promise.all([
        data.getBooking(bookingId),
        data.getTasks(bookingId),
        data.getBookingExtras(bookingId),
      ])
      if (n !== kerSzam.current) return
      setB(f)
      setLista(t)
      setMennyisegek(m)
      if (!veglegesKezzel.current) setVegleges(f?.final_price_huf ? String(f.final_price_huf) : '')
      setMegjegyzes(f?.notes ?? '')
      setMegjMentve(true)
    } catch (e) {
      if (n === kerSzam.current) setHiba(hibaSzoveg(e))
    } finally {
      if (n === kerSzam.current) setTolt(false)
    }
  }, [data, bookingId])

  useEffect(() => {
    void betolt()
  }, [betolt])

  async function irasKozben<T>(fn: () => Promise<T>): Promise<T> {
    irasok.current++
    try {
      return await fn()
    } finally {
      irasok.current--
      if (irasok.current === 0 && kimaradtFrissites.current) {
        kimaradtFrissites.current = false
        void betolt()
      }
    }
  }

  const megjMentveRef = useRef(megjMentve)
  useEffect(() => { megjMentveRef.current = megjMentve }, [megjMentve])
  useEffect(() => data.subscribe(() => {
    if (csoportRef.current) return
    if (irasok.current > 0) { kimaradtFrissites.current = true; return }
    const aktiv = document.activeElement
    const gepel = (aktiv instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(aktiv.type))
      || aktiv instanceof HTMLTextAreaElement
      || aktiv instanceof HTMLSelectElement
    if (megjMentveRef.current && !gepel) void betolt()
  }), [data, betolt])

  const bezar = useCallback(() => {
    if (valtozott.current) refresh()
    onBezar()
  }, [onBezar, refresh])

  const csoportNezet = Boolean(b?.fleet_group) && !egyedi
  useEffect(() => { csoportRef.current = csoportNezet }, [csoportNezet])

  const lezart = b?.status === 'COMPLETED'
  const megerkezett = b ? ['ARRIVED', 'IN_PROGRESS', 'READY'].includes(b.status) : false
  const keszVolt = b ? ['READY', 'COMPLETED'].includes(b.status) : false
  const listaNyitva = megerkezett && !keszVolt
  const kimaradtJel = keszVolt && !b?.not_fitted

  const csoportok = useMemo<Csoport[]>(() => {
    const ki = (a: ServiceArea | null) => lista.filter((t) => t.area === a)
    const mk = (
      kulcs: Csoport['kulcs'], cim: string, area: ServiceArea | null, reszletezve: boolean,
    ): Csoport => {
      const sorok = ki(area).sort((x, y) => x.sort_order - y.sort_order)
      return {
        kulcs, cim, area, reszletezve,
        csomag: sorok.filter((t) => t.source === 'PACKAGE'),
        extra: sorok.filter((t) => t.source === 'EXTRA'),
      }
    }
    const kulsoKimaradt = keszVolt && lista.some((t) => t.area === 'KULSO' && t.source === 'PACKAGE' && !t.done)
    return [
      mk('KULSO', 'Kívül', 'KULSO', kulsoKimaradt),
      mk('BELSO', 'Belül', 'BELSO', true),
      mk('EGYEB', 'Csomagon kívül', null, true),
    ].filter((cs) => cs.csomag.length + cs.extra.length > 0)
  }, [lista, keszVolt])

  async function pipal(t: BookingTask) {
    if (!listaNyitva) return
    const uj = !t.done
    setLista((l) => l.map((x) => (x.id === t.id ? { ...x, done: uj, done_at: uj ? new Date().toISOString() : null } : x)))
    valtozott.current = true
    try {
      await irasKozben(() => data.toggleTask(t.id, uj))
    } catch (e) {
      setHiba(hibaSzoveg(e))
      setLista((l) => l.map((x) => (x.id === t.id ? { ...x, done: !uj } : x)))
    }
  }

  async function csoportPipal(cs: Csoport, done: boolean) {
    if (!listaNyitva || cs.area === null) return
    const erintett = new Set(cs.csomag.map((t) => t.id))
    const most = new Date().toISOString()
    setLista((l) =>
      l.map((x) => (erintett.has(x.id) ? { ...x, done, done_at: done ? most : null } : x)),
    )
    valtozott.current = true
    try {
      await irasKozben(() => data.toggleTaskGroup(bookingId, cs.area!, done))
    } catch (e) {
      setHiba(hibaSzoveg(e))
      await betolt()
    }
  }

  async function allapot(cel: Parameters<typeof data.setStatus>[1], k?: KerdesBeallitas) {
    if (k && !(await kerdez(k))) return
    valtozott.current = true
    setB((x) => (x ? { ...x, status: cel } : x))
    setLepesMegy(true)
    try {
      await data.setStatus(bookingId, cel)
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      await betolt()
      setLepesMegy(false)
    }
  }

  async function kovetkezoLepes(cel: Parameters<typeof data.setStatus>[1]) {
    if (!b || lepesMegy) return
    await kovetkezoLepesFut({
      bookingId: b.id, cel, felirat: (b.plate_raw ?? '').toUpperCase(), igazolo: igazoloFajta(b),
      kapu, keszVan, kerdez, allapot: (c) => allapot(c),
      keszUtan: async () => { valtozott.current = true; await betolt() },
      hiba: setHiba,
    })
  }

  async function kerdojelValt(uj: boolean) {
    if (!b) return
    valtozott.current = true
    setB((x) => (x ? { ...x, tentative: uj } : x))
    try {
      await data.setTentative(b.id, uj)
    } catch (e) {
      setB((x) => (x ? { ...x, tentative: !uj } : x))
      setHiba(hibaSzoveg(e))
    }
  }

  async function nemFertBe() {
    if (!b || !(await kerdez(NEM_FERT_BE_KERDES(b)))) return
    valtozott.current = true
    try {
      await data.notFitted(b.id)
      await betolt()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
  }

  async function visszanyit() {
    if (!b) return
    valtozott.current = true
    try {
      await data.reopenBooking(b.id)
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
    await betolt()
  }

  async function lemond() {
    if (!b) return
    await allapot('CANCELLED_BY_CUSTOMER', TORLES_KERDES(b))
  }

  const javasolt = useMemo(() => {
    if (!b) return 0
    return felarasAr(b.estimated_price_huf, pct, fix)
  }, [b, pct, fix])

  async function arMent() {
    if (!b || lezart) return
    const beirt = vegleges.trim()
    const ar = beirt === '' ? javasolt : Math.round(Number(beirt))
    if (!Number.isFinite(ar) || ar < 0) return

    const indok = [
      pct ? `erősen szennyezett +${pct}%` : null,
      fix ? `fix felár ${ft(fix)}` : null,
    ].filter(Boolean).join(', ')

    try {
      await data.setFinalPrice(bookingId, ar, indok || undefined)
      valtozott.current = true
      veglegesKezzel.current = false
      await betolt()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
  }

  async function megjMent() {
    if (lezart) return
    try {
      await data.setNotes(bookingId, megjegyzes)
      setMegjMentve(true)
      valtozott.current = true
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
  }

  const mezoMent = useCallback(async (patch: Record<string, unknown>) => {
    valtozott.current = true
    await data.patchBooking(bookingId, patch)
    await betolt()
  }, [data, bookingId, betolt])

  const csomagok = useMemo(
    () => (catalog?.packages ?? []).filter((p) => p.active),
    [catalog],
  )

  function csomagAr(packageId: string) {
    return catalog?.packagePricing.find(
      (p) => p.package_id === packageId && p.category === b?.category && p.scope === b?.scope,
    )
  }

  function fullServiceAr(packageId: string) {
    return catalog?.fullServicePricing.find(
      (p) => p.package_id === packageId && p.category === b?.category,
    )
  }

  const [csomagMegy, setCsomagMegy] = useState(false)

  async function csomagMent(patch: Record<string, unknown>) {
    if (lezart || csomagMegy) return
    setCsomagMegy(true)
    try {
      await mezoMent(patch)
      setHiba(null)
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setCsomagMegy(false)
    }
  }

  async function csomagValt(id: string) {
    if (b?.package_id === id) return
    await csomagMent({ package_id: id })
  }

  async function fullServiceValt(be: boolean) {
    await csomagMent({ full_service: be })
  }

  const [extraNyitva, setExtraNyitva] = useState(false)
  const [extraMegy, setExtraMegy] = useState(false)

  const kertExtrak = useMemo(
    () => new Set(mennyisegek.map((m) => m.extra_id)),
    [mennyisegek],
  )

  const merhetok = useMemo(
    () => mennyisegek.filter((m) => m.price_unit !== 'ALKALOM'),
    [mennyisegek],
  )

  const valaszthatoExtrak = useMemo(
    () => (catalog?.extras ?? []).filter((e) => e.active)
      .sort((a, z) => a.sort_order - z.sort_order || a.name.localeCompare(z.name, 'hu')),
    [catalog],
  )

  async function extraBillent(extraId: string) {
    if (lezart || extraMegy) return
    const most = mennyisegek.map((m) => ({ extra_id: m.extra_id, quantity: m.quantity }))
    const uj = kertExtrak.has(extraId)
      ? most.filter((x) => x.extra_id !== extraId)
      : [...most, { extra_id: extraId, quantity: 1 }]
    setExtraMegy(true)
    try {
      await mezoMent({ extras: uj })
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setExtraMegy(false)
    }
  }

  const szerzodeses = Boolean(b?.contract_kind || b?.ceg_link_company)
  const varos = b?.booking_type === 'VAROS'
  const tobbnapos = b ? tobbnaposE(b) : false

  const kovetkezo = b ? NEXT_STATUS[b.status] : undefined
  const lemondott = b ? lemondottE(b.status) : false
  const igazolo = b ? igazoloFajta(b) : null
  const berletes = Boolean(b?.pass_item_id) && !lemondott && !b?.not_fitted
  const keres = b?.status === 'REQUESTED'
  const lemondhato = b ? !lezart && eloE(b.status) && !keres : false
  const keszLista = lista.filter((t) => t.done).length

  if (b?.fleet_group && !egyedi) {
    return (
      <FlottaMunkalap
        groupId={b.fleet_group}
        onBezar={onBezar}
        arlistaPanel={arlistaPanel}
        reszletek={(id, bezarReszlet) => (
          <BookingDetail key={id} bookingId={id} egyedi onBezar={bezarReszlet}
                         onSzerkeszt={onSzerkeszt} arlistaGombok={arlistaGombok}
                         arlistaPanel={arlistaPanel} />
        )}
      />
    )
  }

  return (
    <Ablak osztaly={`fedo munkalap-fedo${osztott ? ' osztott' : ''}`} cimke="Munkalap" onEsc={bezar}
           onHatter={(ablak) => {
             const f = document.activeElement
             if ((f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement)
                 && ablak.contains(f)) {
               f.blur()
               return
             }
             bezar()
           }}>
      <div className="lap lap-szeles munkalap-urlap" data-zarolt={lezart || undefined}>
        {tolt || !b ? (
          <div className="lap-torzs">
            <div className="betolt">{hiba ? <span className="hibauzenet">{hiba}</span> : 'Betöltés…'}</div>
          </div>
        ) : (
          <>
            <div className="lap-fej">
              <div>
                <h2 style={{ fontFamily: 'var(--betu-szam)', letterSpacing: '.06em' }}>
                  {b.plate_raw?.toUpperCase()} <Kerdojel b={b} />
                </h2>
                <div className="halk" style={{ fontSize: 'var(--m-sm)' }}>
                  {b.customer_name}
                  {[b.brand, b.model].filter(Boolean).length > 0 &&
                    ` · ${[b.brand, b.model].filter(Boolean).join(' ')}`}
                </div>
              </div>
              {arlistaGombok}
              <button className="bezar" onClick={bezar} aria-label="Bezárás">
                ×
              </button>
            </div>

            <div className="lap-torzs">
              {hiba && <div className="hibauzenet">{hiba}</div>}

              {lezart && (
                <div className="figyelmeztet">
                  <span>
                    <strong>Lezárva.</strong> Ez a munkalap végleges — a lista és az ár
                    nem módosítható. Ha javítani kell, előbb vissza kell nyitni.
                  </span>
                </div>
              )}

              <div className="urlap-oszlopok ml-felso">
                <div className="urlap-oszlop">
                  <div className="szakasz ml-ugyfel">
                    <div className="fej">
                      Ügyfél
                      {!lezart && <span className="jobbra halvany">kattints rá az átíráshoz</span>}
                    </div>

                    <div className="sor-2">
                      <Szerkesztheto
                        cimke="Rendszám" ertek={b.plate_raw} tipus="rendszam" zarolt={lezart}
                        onMent={(v) => mezoMent({ plate_raw: v })} />
                      <Szerkesztheto
                        cimke="Név" ertek={b.customer_name} zarolt={lezart}
                        onMent={(v) => mezoMent({ customer_name: v })} />
                    </div>

                    <div className="sor-2">
                      <Szerkesztheto
                        cimke="Telefon" ertek={b.customer_phone} tipus="telefon" zarolt={lezart}
                        kezdetbenNyitva={fokusz === 'telefon'}
                        onMent={(v) => mezoMent({ customer_phone: v })}
                        utotag={!uresJel(b.customer_phone) && (
                          <a href={`tel:${b.customer_phone}`} className="hivas"
                             title="Hívás">Hívás</a>
                        )} />
                      <CegSor b={b} zarolt={lezart} onMent={mezoMent} />
                    </div>

                    {igazolo && (
                      <div className="adatsor ml-igazolo">
                        <span>{igazolo === 'BERLET' ? 'Bérlet igazolólap' : 'Igazolólap'}</span>
                        <span className="ertek">
                          <IgazoloGomb bookingId={b.id} fajta={igazolo}
                                       className="btn" felirat="Kitöltés, aláírás" />
                        </span>
                      </div>
                    )}

                    <UgyfelLinkSor b={b} />
                  </div>

                  <div className="szakasz ml-csomag">
                    <div className="fej">Csomag</div>
                    <div className="csomagok">
                      {csomagok.map((p) => {
                        const ar = csomagAr(p.id)
                        return (
                          <button key={p.id} type="button" className="csomag" aria-label={p.name}
                                  aria-pressed={b.package_id === p.id}
                                  disabled={lezart || csomagMegy}
                                  onClick={() => void csomagValt(p.id)}>
                            <span className="jel" />
                            <span style={{ minWidth: 0 }}>
                              <span className="nev">{p.name}</span>
                              <span className="leiras">{csomagLeiras(catalog, p)}</span>
                            </span>
                            <span className="arblokk">
                              <div className="ar">
                                {berletes && b.package_id === p.id ? 'Bérletből'
                                  : szerzodeses ? 'Szerződéses'
                                  : ar?.requires_quote || ar?.price_huf == null ? 'Érdeklődjön'
                                  : ft(ar.price_huf)}
                              </div>
                              <div className="ido">{idotartam(ar?.duration_minutes ?? null)}</div>
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {b.package_id && (
                      <label className="jelolo" data-aktiv={b.full_service}>
                        <input type="checkbox" checked={b.full_service} disabled={lezart || csomagMegy}
                               onChange={(e) => void fullServiceValt(e.target.checked)} />
                        <span style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>Full Service</div>
                          <div className="halk" style={{ fontSize: 'var(--m-xs)' }}>
                            Mélytisztítás. Saját ára van, nem a csomag + extra összege.
                          </div>
                        </span>
                        <span className="szam" style={{ fontWeight: 600 }}>
                          {(() => {
                            const fs = fullServiceAr(b.package_id)
                            return szerzodeses ? '' : fs?.requires_quote || fs?.price_huf == null ? 'Érdeklődjön' : ft(fs.price_huf)
                          })()}
                        </span>
                      </label>
                    )}

                    <div className="ml-rejtett-cimke">
                      <Szerkesztheto
                        cimke="Terjedelem" ertek={b.scope} zarolt={lezart}
                        valaszthato={TERJEDELEM_VALASZTO} gombok
                        onMent={(v) => mezoMent({ scope: v })} />
                    </div>
                  </div>
                </div>

                <div className="urlap-oszlop">
                  <div className="szakasz ml-mikor">
                    <div className="fej">Mikor</div>

                    <div className="ml-rejtett-cimke">
                      <Szerkesztheto
                        cimke="Típus"
                        ertek={b.booking_type === 'TOBBNAPOS' ? 'LEADOS' : b.booking_type}
                        zarolt={lezart}
                        valaszthato={TIPUSOK} gombok
                        onMent={(v) => mezoMent({ booking_type: v })} />
                    </div>

                    <NapOraSor
                      cimke={varos ? 'Kezdés' : 'Hozza'}
                      nap={b.service_date.slice(0, 10)}
                      ora={helyiOra(varos ? b.start_at : b.drop_off_at)}
                      zarolt={lezart}
                      onMent={(m) => mezoMent({
                        ...(m.nap !== undefined ? { service_date: m.nap } : {}),
                        ...(m.ora !== undefined ? { [varos ? 'start_time' : 'drop_off_time']: m.ora } : {}),
                      })} />

                    {varos ? (
                      <div className="adatsor napora-adat ml-varos">
                        <span>Kész</span>
                        <span className="ertek">
                          {b.start_at && b.planned_duration_minutes > 0
                            ? <>megvárja, kb. {vegOra(b.start_at, b.planned_duration_minutes)}-kor kész</>
                            : <span className="halvany">megvárja</span>}
                        </span>
                      </div>
                    ) : (
                      <NapOraSor
                        cimke="Viszi"
                        nap={helyiNap(b.pick_up_at ?? b.deadline_at) || b.service_date.slice(0, 10)}
                        ora={helyiOra(b.pick_up_at ?? b.deadline_at)}
                        minNap={b.service_date.slice(0, 10)}
                        zarolt={lezart}
                        oraUres="nincs megbeszélve"
                        utotag={tobbnapos && (
                          <span className="cimke-pill tobbnapos-pill">
                            {napokSzama(b.service_date, b.last_day)} nap
                          </span>
                        )}
                        onMent={(m) => mezoMent({
                          ...(m.nap !== undefined ? { pick_up_date: m.nap } : {}),
                          ...(m.ora !== undefined ? { pick_up_time: m.ora } : {}),
                        })} />
                    )}

                    <div className="valaszto ml-kerdojel">
                      <button type="button" className="kerdojel-gomb" aria-pressed={b.tentative}
                              disabled={lezart}
                              title="Ha befér, megcsináljuk, ha nem, nem"
                              onClick={() => void kerdojelValt(!b.tentative)}>
                        Kérdőjeles (???)
                      </button>
                      {lemondhato && !b.tentative && (
                        <button type="button" className="ml-nem-fert"
                                onClick={() => void nemFertBe()}>
                          Nem fért be
                        </button>
                      )}
                    </div>

                    <div className="ml-info">
                      <span>
                        Munkaóra:{' '}
                        <strong>
                          {b.planned_duration_minutes > 0
                            ? idotartam(b.planned_duration_minutes)
                            : 'nincs megadva'}
                        </strong>
                      </span>
                      {b.pickup_fee_huf != null && (
                        <span>Fuvar: <strong>{ft(b.pickup_fee_huf)}</strong>, benne az árban</span>
                      )}
                    </div>
                  </div>

                  <div className="szakasz ml-jarmu">
                    <div className="fej">Jármű</div>

                    {b.contract_kind && (
                      <Szerkesztheto
                        cimke="Jármű típus" ertek={b.contract_kind} zarolt={lezart}
                        valaszthato={JARMU_TIPUSOK} gombok
                        onMent={(v) => mezoMent({ contract_kind: v })} />
                    )}

                    {b.ceg_link_company ? (
                      <Szerkesztheto
                        cimke="Méret" ertek={b.category === 'SZEMELYAUTO' ? 'SZEMELYAUTO' : 'SUV'} zarolt={lezart}
                        valaszthato={CEGES_MERET_VALASZTO} gombok
                        onMent={(v) => mezoMent({ category: v })} />
                    ) : (
                      <Szerkesztheto
                        cimke="Méret" ertek={b.category} zarolt={lezart}
                        valaszthato={MERET_VALASZTO} gombok
                        onMent={(v) => mezoMent({ category: v })} />
                    )}

                    <div className="sor-2">
                      <Szerkesztheto
                        cimke="Márka" ertek={b.brand} zarolt={lezart} ures="nincs megadva"
                        onMent={(v) => mezoMent({ brand: v, model: b.model ?? '' })} />
                      <Szerkesztheto
                        cimke="Típus" ertek={b.model} zarolt={lezart} ures="nincs megadva"
                        onMent={(v) => mezoMent({ brand: b.brand ?? '', model: v })} />
                    </div>
                  </div>

                  <div className="szakasz ml-megj">
                    <div className="fej">
                      Megjegyzés
                      {!megjMentve && <span className="jobbra halvany">nincs mentve</span>}
                    </div>
                    <textarea
                      className="beviteli"
                      aria-label="Megjegyzés"
                      value={megjegyzes}
                      disabled={lezart}
                      onChange={(e) => {
                        setMegjegyzes(e.target.value)
                        setMegjMentve(false)
                      }}
                      onBlur={() => !megjMentve && void megjMent()}
                    />
                  </div>
                </div>
              </div>

              <div className="szakasz urlap-extrak ml-extrak">
                <button type="button" className="osszecsuk" aria-expanded={extraNyitva}
                        disabled={lezart}
                        onClick={() => setExtraNyitva((v) => !v)}>
                  <span className="cim">Egyéb szolgáltatások</span>
                  {mennyisegek.length > 0 && <span className="db">{mennyisegek.length}</span>}
                  {!lezart && <span className="nyil">{extraNyitva ? '−' : '+'}</span>}
                </button>

                {!extraNyitva && mennyisegek.length > 0 && (
                  <div className="extra-cimkek">
                    {mennyisegek.map((m) => (
                      lezart ? (
                        <span className="extra-cimke" key={m.item_id}>{m.name}</span>
                      ) : (
                        <button type="button" className="extra-cimke" key={m.item_id}
                                disabled={extraMegy}
                                title="Kattints a levételhez"
                                onClick={() => void extraBillent(m.extra_id)}>
                          {m.name}<span className="le">×</span>
                        </button>
                      )
                    ))}
                  </div>
                )}

                {extraNyitva && !lezart && (
                  <div className="extrak">
                    {valaszthatoExtrak.map((e) => {
                      const aktiv = kertExtrak.has(e.id)
                      return (
                        <div className="extra-sav" key={e.id}>
                          <label className="extra" data-aktiv={aktiv}>
                            <input type="checkbox" checked={aktiv} disabled={extraMegy}
                                   onChange={() => void extraBillent(e.id)} />
                            <span className="nev">{e.name}</span>
                            <span className={`ar ${e.price_huf == null ? 'kerdes' : ''}`}>
                              {e.requires_quote
                                ? 'árajánlat'
                                : e.price_huf == null
                                  ? 'ár hiányzik'
                                  : `${ft(e.price_huf)}${e.price_unit !== 'ALKALOM' ? ` / ${EGYSEG[e.price_unit]}` : ''}`}
                            </span>
                          </label>
                          {e.description?.trim() && (
                            <Sugo cim={e.name} szoveg={e.description} />
                          )}
                        </div>
                      )
                    })}
                    {valaszthatoExtrak.length === 0 && (
                      <div className="ures">Nincs felvett egyéb szolgáltatás.</div>
                    )}
                  </div>
                )}
              </div>

              <div className="urlap-oszlopok ml-also">
                <div className="urlap-oszlop">
                  <div className="szakasz">
                    <div className="fej">
                      Munkalista
                      <span className="jobbra szam halk">
                        {keszLista}/{lista.length}
                      </span>
                    </div>

                    {keszVolt && b.skip_note && (
                      <div className="kimaradt-sor" data-teszt="kimaradt">
                        <strong>Kimaradt:</strong> {b.skip_note}
                        {b.skip_huf ? <> — {ft(b.skip_huf)}-tal kevesebb az ár.</> : <> — az ár nem változott.</>}
                      </div>
                    )}

                    {!megerkezett && !lezart && (
                      <div className="figyelmeztet">
                        <span>
                          Az ügyfél még nem érkezett meg, ezért a lista zárolva van.
                          Nyomd meg lent a <strong>Megérkezett</strong> gombot.
                        </span>
                      </div>
                    )}

                    {csoportok.map((cs) => {
                      const mind = cs.csomag.length
                      const kesz = cs.csomag.filter((t) => t.done).length
                      const teljes = mind > 0 && kesz === mind
                      return (
                        <div className="munkacsoport" key={cs.kulcs}>
                          <div className="munkacsoport-fej">
                            <span className="cim">{cs.cim}</span>
                            {mind > 0 && !cs.reszletezve && b.package_name && (
                              <span className="halk csomagnev" style={{ fontSize: 'var(--m-sm)' }}>
                                {b.package_name}
                              </span>
                            )}
                            {mind > 0 && cs.reszletezve && (
                              <span className="szam halk">
                                {kesz}/{mind}
                              </span>
                            )}
                            {mind > 0 && cs.area && (
                              <button
                                type="button"
                                className={`btn btn-kicsi ${teljes ? '' : 'btn-fo'}`}
                                disabled={!listaNyitva}
                                onClick={() => void csoportPipal(cs, !teljes)}
                              >
                                {teljes ? 'Visszavon' : `${cs.cim} kész`}
                              </button>
                            )}
                          </div>

                          {cs.reszletezve && (
                          <div className="munkalista">
                            {cs.csomag.map((t) => (
                              <label className="munka" key={t.id} data-kesz={t.done}>
                                <input
                                  type="checkbox"
                                  checked={t.done}
                                  disabled={!listaNyitva}
                                  onChange={() => void pipal(t)}
                                />
                                <span className="nev">{t.name}</span>
                                {kimaradtJel && !t.done && <span className="kimaradt-cimke">kimaradt</span>}
                              </label>
                            ))}
                          </div>
                          )}

                          {cs.extra.length > 0 && (
                            <>
                              <div className="munkacsoport-alcim">Külön kért</div>
                              <div className="munkalista">
                                {cs.extra.map((t) => (
                                  <label className="munka munka-extra" key={t.id} data-kesz={t.done}>
                                    <input
                                      type="checkbox"
                                      checked={t.done}
                                      disabled={!listaNyitva}
                                      onChange={() => void pipal(t)}
                                    />
                                    <span className="nev">{t.name}</span>
                                    {kimaradtJel && !t.done && <span className="kimaradt-cimke">kimaradt</span>}
                                  </label>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}

                    {lista.length === 0 && <div className="ures">Ehhez a foglaláshoz nincs munkalista.</div>}
                  </div>
                </div>
                <div className="urlap-oszlop">
                  {merhetok.length > 0 && (
                    <div className="szakasz">
                      <div className="fej">Mennyiségek</div>
                      {merhetok.map((m) => (
                        <div className="mennyisegsor" key={m.item_id}>
                          <span className="nev">{m.name}</span>
                          <input
                            className="beviteli szam"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={m.price_unit === 'LITER' ? 0.5 : 1}
                            disabled={lezart}
                            aria-label={`${m.name} mennyisége`}
                            defaultValue={m.quantity}
                            key={`${m.item_id}:${m.quantity}`}
                            onBlur={async (e) => {
                              const uj = Number(e.target.value)
                              if (!Number.isFinite(uj) || uj === m.quantity) return
                              try {
                                await data.setBookingExtraQty(m.item_id, uj)
                                valtozott.current = true
                                await betolt()
                              } catch (err) {
                                setHiba(hibaSzoveg(err))
                              }
                            }}
                          />
                          <span className="egyseg">{EGYSEG[m.price_unit]}</span>
                          <span className="ar szam">{ft(m.price_huf)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="szakasz">
                    <div className="fej">Ár</div>

                    <div className="adatsor">
                      <span>Becsült (foglaláskor)</span>
                      <span className="ertek">{ft(b.estimated_price_huf)}</span>
                    </div>

                    <div className="sor-2">
                      <div className="mezo">
                        <label htmlFor="pct">Erősen szennyezett (%)</label>
                        <input
                          id="pct"
                          className="beviteli szam"
                          type="number"
                          min={0}
                          max={50}
                          step={5}
                          disabled={lezart}
                          placeholder="0"
                          value={pct === 0 ? '' : pct}
                          onChange={(e) => setPct(Number(e.target.value) || 0)}
                        />
                      </div>
                      <div className="mezo">
                        <label htmlFor="fix">Fix felár (Ft)</label>
                        <input
                          id="fix"
                          className="beviteli szam"
                          type="number"
                          min={0}
                          step={500}
                          disabled={lezart}
                          placeholder="0"
                          value={fix === 0 ? '' : fix}
                          onChange={(e) => setFix(Number(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="sor-2" style={{ alignItems: 'end' }}>
                      <div className="mezo">
                        <label htmlFor="veg">Végleges ár</label>
                        <input
                          id="veg"
                          className="beviteli szam"
                          type="number"
                          step={500}
                          disabled={lezart}
                          value={vegleges}
                          onChange={(e) => { veglegesKezzel.current = true; setVegleges(e.target.value) }}
                          placeholder={String(javasolt)}
                        />
                      </div>
                      <button
                        className="btn"
                        disabled={lezart}
                        onClick={() => void arMent()}
                        style={{ height: 43 }}
                      >
                        Ár rögzítése
                      </button>
                    </div>

                    <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>
                      Üresen hagyva a javasolt ár kerül be: <strong>{ft(javasolt)}</strong>.
                      Nullát csak akkor rögzít, ha tényleg nullát írsz be.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lap-lab munkalap-lab">
              <div className="lab-fent">
                <div className="osszeg">
                  <span className="ertek">{ft(b.final_price_huf ?? b.estimated_price_huf)}</span>
                  <span className="alatta">
                    {b.final_price_huf ? 'végleges' : 'becsült'}{berletes ? ' · a csomag bérletből' : ''}
                  </span>
                </div>
                {!lezart && (
                  <button className="btn" onClick={() => onSzerkeszt(bookingId)}>
                    Szerkesztés
                  </button>
                )}
              </div>
              <div className="gombok">
                {b.status === 'CONFIRMED' && (
                  <button className="btn" disabled={lepesMegy} onClick={() => void allapot('NO_SHOW')}>
                    Nem jött el
                  </button>
                )}
                {keres && (
                  <button className="btn btn-veszelyes" disabled={lepesMegy}
                          onClick={() => void allapot('REJECTED', ELUTASITAS_KERDES((b.plate_raw ?? '').toUpperCase()))}>
                    Elutasít
                  </button>
                )}
                {lemondhato && b.tentative && (
                  <button className="btn btn-kerdojel" disabled={lepesMegy} onClick={() => void nemFertBe()}>
                    Nem fért be
                  </button>
                )}
                {lemondhato && (
                  <button className="btn btn-veszelyes" disabled={lepesMegy}
                          onClick={() => void lemond()}>
                    Törlés
                  </button>
                )}
                {lemondott && (
                  <button className="btn" disabled={lepesMegy} onClick={() => void allapot('CONFIRMED')}>
                    Mégis jön
                  </button>
                )}
                {(lezart || b.status === 'READY') && (
                  <button className="btn" disabled={lepesMegy} onClick={() => void visszanyit()}>
                    Visszanyit
                  </button>
                )}
                {kovetkezo && (
                  <button className="btn btn-fo" disabled={lepesMegy}
                          onClick={() => void kovetkezoLepes(kovetkezo.to)}>
                    {kovetkezo.label}
                  </button>
                )}
                <button className="btn" onClick={bezar}>
                  Bezárás
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {arlistaPanel}
      {kerdesAblak}
      {keszAblak}
      {kapuAblak}
    </Ablak>
  )
}

function napokSzama(elso: string, utolso: string): number {
  return napKulonbseg(elso, utolso) + 1
}
