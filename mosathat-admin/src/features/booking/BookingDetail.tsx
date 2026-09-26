import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { useMentetlen } from '../../state/useMentetlen'
import { ft, idosav, idotartam, ora } from '../../lib/format'
import {
  CATEGORY_LABEL, NEXT_STATUS, SCOPE_LABEL, TYPE_LABEL,
  type BookingExtraRow, type BookingScope, type BookingTask, type BookingType,
  type DayBooking, type ServiceArea, type VehicleCategory,
} from '../../lib/types'
import Szerkesztheto, { type Valaszthato } from '../common/Szerkesztheto'

// A legördülők tartalma. A feliratok ugyanabból a szótárból jönnek, mint
// mindenhol máshol — így nem lehet két különböző neve ugyanannak.
const KATEGORIAK: Valaszthato[] = (['SZEMELYAUTO', 'SUV', 'KISBUSZ'] as VehicleCategory[])
  .map((v) => ({ ertek: v, cimke: CATEGORY_LABEL[v] }))

const TERJEDELMEK: Valaszthato[] = (['TELJES', 'KULSO', 'BELSO'] as BookingScope[])
  .map((v) => ({ ertek: v, cimke: SCOPE_LABEL[v] }))

const TIPUSOK: Valaszthato[] = (['VAROS', 'LEADOS', 'TOBBNAPOS', 'HOZOMVISZEM'] as BookingType[])
  .map((v) => ({ ertek: v, cimke: TYPE_LABEL[v] }))

// ---------------------------------------------------------------------------
//  A munkalap.
//
//  Ez az a képernyő, ami a mosóállásban nyitva van, gyakran vizes kézzel.
//  Ezért három szabály vezette a felépítését:
//
//  1. Ami a csomag része, azt nem kell egyenként pipálni. Egy Elitnél 14
//     lépés van — ezeket egyesével kipipálni időpazarlás. Ami KÜLÖN volt
//     kérve, az az érdekes: azt külön kell nyugtázni.
//
//  2. A pipálás nem tölti újra az oldalt. Azonnal átbillen, a mentés a
//     háttérben megy. Ha hiba van, visszabillen és szól.
//
//  3. Amíg az ügyfél nem érkezett meg, a lista nincs nyitva. Lezárás után
//     pedig végleg zárva van — ezt nem itt, hanem az adatbázisban is
//     biztosítja egy trigger.
// ---------------------------------------------------------------------------

interface Csoport {
  kulcs: 'KULSO' | 'BELSO' | 'EGYEB'
  cim: string
  area: ServiceArea | null
  csomag: BookingTask[]
  extra: BookingTask[]
  /**
   * Kell-e tételesen kilistázni a csomag lépéseit.
   *
   * Kívül nem: minden autón ugyanaz a nyolc lépés, extra nélkül nincs
   * különbség köztük — egy gomb elég. Belül igen: ott a porszívózás és a
   * kárpitápolás között valódi különbség van, és menet közben derül ki,
   * meddig jutottak.
   */
  reszletezve: boolean
}

export default function BookingDetail({
  bookingId,
  onBezar,
  onSzerkeszt,
  arlistaGombok,
  osztott,
}: {
  bookingId: string
  onBezar: () => void
  /** Átvált a szerkesztő űrlapra — ugyanarra, amivel a foglalás készült. */
  onSzerkeszt: () => void
  /** Az árlistát nyitó gombok. A héj adja át, mert ő tartja az állapotot. */
  arlistaGombok?: React.ReactNode
  /** Nyitva az árlista: ilyenkor ez az ablak a bal oldalra húzódik. */
  osztott?: boolean
}) {
  const { data, catalog, refresh } = useApp()
  const [b, setB] = useState<DayBooking | null>(null)
  const [lista, setLista] = useState<BookingTask[]>([])
  const [mennyisegek, setMennyisegek] = useState<BookingExtraRow[]>([])
  const [tolt, setTolt] = useState(true)
  const [hiba, setHiba] = useState<string | null>(null)

  // ár
  const [vegleges, setVegleges] = useState('')
  const [pct, setPct] = useState(0)
  const [fix, setFix] = useState(0)

  // megjegyzés
  const [megjegyzes, setMegjegyzes] = useState('')
  const [megjMentve, setMegjMentve] = useState(true)

  // Ha bármi változott, a napi nézetet frissíteni kell — de csak bezáráskor,
  // nem minden pipa után.
  const valtozott = useRef(false)

  // A meg nem mentett megjegyzés a leggyakoribb elveszíthető adat.
  useMentetlen(!megjMentve)

  const betolt = useCallback(async () => {
    try {
      const [f, t, m] = await Promise.all([
        data.getBooking(bookingId),
        data.getTasks(bookingId),
        data.getBookingExtras(bookingId),
      ])
      setB(f)
      setLista(t)
      setMennyisegek(m)
      setVegleges(f?.final_price_huf ? String(f.final_price_huf) : '')
      setMegjegyzes(f?.notes ?? '')
      setMegjMentve(true)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setTolt(false)
    }
  }, [data, bookingId])

  useEffect(() => {
    void betolt()
  }, [betolt])

  const bezar = useCallback(() => {
    if (valtozott.current) refresh()
    onBezar()
  }, [onBezar, refresh])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && bezar()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [bezar])

  // --- állapotból adódó zárolás ----------------------------------------------

  const lezart = b?.status === 'COMPLETED'
  const megerkezett = b ? ['ARRIVED', 'IN_PROGRESS', 'READY'].includes(b.status) : false
  const listaNyitva = megerkezett && !lezart

  // --- a lista csoportosítva --------------------------------------------------

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
    return [
      mk('KULSO', 'Kívül', 'KULSO', false),
      mk('BELSO', 'Belül', 'BELSO', true),
      mk('EGYEB', 'Csomagon kívül', null, true),
    ].filter((cs) => cs.csomag.length + cs.extra.length > 0)
  }, [lista])

  // --- pipálás ----------------------------------------------------------------

  async function pipal(t: BookingTask) {
    if (!listaNyitva) return
    const uj = !t.done
    // Azonnal átbillentjük. Nincs újratöltés: a mosóállásban a késleltetés
    // azt jelentené, hogy kétszer nyomják meg.
    setLista((l) => l.map((x) => (x.id === t.id ? { ...x, done: uj, done_at: uj ? new Date().toISOString() : null } : x)))
    valtozott.current = true
    try {
      await data.toggleTask(t.id, uj)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      setLista((l) => l.map((x) => (x.id === t.id ? { ...x, done: !uj } : x))) // vissza
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
      await data.toggleTaskGroup(bookingId, cs.area, done)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      await betolt()
    }
  }

  // --- állapotváltás -----------------------------------------------------------

  async function allapot(cel: Parameters<typeof data.setStatus>[1]) {
    // A lezárás visszafordíthatatlan: a munkalap véglegessé válik.
    if (cel === 'COMPLETED') {
      const ok = window.confirm(
        'Biztos lezárom? Minden adat helyes?\n\n' +
          'Lezárás után a munkalista és az ár nem módosítható.',
      )
      if (!ok) return
    }
    try {
      await data.setStatus(bookingId, cel)
      valtozott.current = true
      await betolt()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  // --- ár ----------------------------------------------------------------------

  // Amit a rendszer javasol: a becsült ár, a most megadott felárakkal.
  const javasolt = useMemo(() => {
    if (!b) return 0
    const alap = b.estimated_price_huf
    return Math.round(alap * (1 + pct / 100)) + fix
  }, [b, pct, fix])

  async function arMent() {
    if (!b || lezart) return
    // ÜRES mező nem nulla forintot jelent, hanem azt, hogy marad a javasolt ár.
    const beirt = vegleges.trim()
    const ar = beirt === '' ? javasolt : Number(beirt)
    if (!Number.isFinite(ar) || ar < 0) return

    const indok = [
      pct ? `erősen szennyezett +${pct}%` : null,
      fix ? `fix felár ${ft(fix)}` : null,
    ].filter(Boolean).join(', ')

    try {
      await data.setFinalPrice(bookingId, ar, indok || undefined)
      valtozott.current = true
      await betolt()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  // --- megjegyzés ---------------------------------------------------------------

  async function megjMent() {
    if (lezart) return
    try {
      await data.setNotes(bookingId, megjegyzes)
      setMegjMentve(true)
      valtozott.current = true
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  // --- helyben szerkesztés ------------------------------------------------------
  //
  // Egy mező átírása. Az adatbázis a többi adatot változatlanul hagyja, de az
  // árat, az időt és a munkalistát újraszámolja — ugyanazon az úton, mint a
  // teljes szerkesztésnél. Két külön út előbb-utóbb eltérne egymástól.
  const mezoMent = useCallback(async (patch: Record<string, unknown>) => {
    await data.patchBooking(bookingId, patch)
    valtozott.current = true
    await betolt()
  }, [data, bookingId, betolt])

  // A csomagválasztó a katalógusból jön. Nincs „csomag nélkül" lehetőség: a
  // Start a legkisebb munka, ez alatt nincs semmi. Ha valaki csak egy
  // kárpittisztítást kér, az is Start mellé kerül külön kért szolgáltatásként.
  const csomagValaszto = useMemo<Valaszthato[]>(
    () => (catalog?.packages ?? []).filter((p) => p.active)
      .map((p) => ({ ertek: p.id, cimke: p.name })),
    [catalog],
  )

  // --- külön kért szolgáltatások -------------------------------------------------
  //
  // Menet közben derül ki a legtöbb: „nézd meg a kárpitot is". Ezért itt is
  // fel lehet venni, nem csak a foglalási űrlapon.
  //
  // A mennyiségek megmaradnak: ha valaki három liter ablakmosót kért, egy új
  // tétel felvétele nem írja vissza egyre. Ezért a mostani listából építjük a
  // csomagot, nem üres lapról.
  const [extraNyitva, setExtraNyitva] = useState(false)
  const [extraMegy, setExtraMegy] = useState(false)

  const kertExtrak = useMemo(
    () => new Set(mennyisegek.map((m) => m.extra_id)),
    [mennyisegek],
  )

  // Amiből van mit beírni: liter, ülés, ajtó. Az alkalmi árazásúaknál a
  // mennyiség mindig egy, ott a beviteli mező csak zavarna.
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
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setExtraMegy(false)
    }
  }

  const kovetkezo = b ? NEXT_STATUS[b.status] : undefined
  const keszLista = lista.filter((t) => t.done).length

  return (
    // A háttérre kattintás bezárja az ablakot — de ha épp beírnak valamit,
    // az első kattintás csak a beírást zárja le. Kiléptetjük a mezőből,
    // amitől lefut a mentése; az ablak marad. A második kattintás zár be.
    //
    // Így ugyanaz a mozdulat ugyanazt jelenti mindenhol: a telefonszámnál,
    // a megjegyzésnél és a mennyiségeknél is. Enélkül a menet közben beírt
    // „jobb első sárvédőn karc" egy félrekattintással eltűnne.
    //
    // mousedown, nem click: különben a kifelé húzott jelölés (a szövegen
    // belül kezdem, az ablakon kívül engedem el) bezárná az ablakot.
    <div className={`fedo${osztott ? ' osztott' : ''}`} role="presentation"
         onMouseDown={(e) => {
           if (e.target !== e.currentTarget) return
           const f = document.activeElement
           if ((f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement)
               && e.currentTarget.contains(f)) {
             f.blur()
             return
           }
           bezar()
         }}>
      <div className="lap" role="dialog" aria-modal="true" aria-label="Munkalap">
        {tolt || !b ? (
          <div className="lap-torzs">
            <div className="betolt">{hiba ? <span className="hibauzenet">{hiba}</span> : 'Betöltés…'}</div>
          </div>
        ) : (
          <>
            <div className="lap-fej">
              <div>
                <h2 style={{ fontFamily: 'var(--betu-szam)', letterSpacing: '.06em' }}>
                  {b.plate_raw}
                </h2>
                <div className="halk" style={{ fontSize: 'var(--m-sm)' }}>
                  {b.customer_name}
                  {[b.brand, b.model].filter(Boolean).length > 0 &&
                    ` · ${[b.brand, b.model].filter(Boolean).join(' ')}`}
                </div>
              </div>
              {/* Itt korábban az állapotjelző címke állt. Kikerült: az állapot
                  látszik a napi kártyán, a lábléc gombja pedig megmondja, mi a
                  következő lépés. Helyette az kerül ide, ami telefon közben
                  kell — az árlista. */}
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

              {/* ---------- alapadatok, helyben szerkesztve ----------
                  Minden adatra rá lehet kattintani és át lehet írni, egészen
                  a lezárásig. Telefon közben ez a különbség nyolc kattintás
                  és egy között: „a férjem jön érte, őt ezen a számon éred el". */}
              <div className="szakasz">
                {!lezart && (
                  <div className="fej">
                    Adatok
                    <span className="jobbra halvany">kattints rá az átíráshoz</span>
                  </div>
                )}

                <Szerkesztheto
                  cimke="Név" ertek={b.customer_name} zarolt={lezart}
                  onMent={(v) => mezoMent({ customer_name: v })} />

                <Szerkesztheto
                  cimke="Telefon" ertek={b.customer_phone} tipus="telefon" zarolt={lezart}
                  onMent={(v) => mezoMent({ customer_phone: v })}
                  utotag={b.customer_phone && (
                    <a href={`tel:${b.customer_phone}`} className="hivas"
                       title="Hívás">Hívás</a>
                  )} />

                <Szerkesztheto
                  cimke="Rendszám" ertek={b.plate_raw} tipus="rendszam" zarolt={lezart}
                  onMent={(v) => mezoMent({ plate_raw: v })} />

                <Szerkesztheto
                  cimke="Autó" ertek={[b.brand, b.model].filter(Boolean).join(' ')}
                  zarolt={lezart} ures="nincs megadva"
                  onMent={(v) => {
                    const [marka, ...tobbi] = v.split(' ')
                    return mezoMent({ brand: marka ?? '', model: tobbi.join(' ') })
                  }} />

                <Szerkesztheto
                  cimke="Méret" ertek={b.category} zarolt={lezart}
                  valaszthato={KATEGORIAK} gombok
                  onMent={(v) => mezoMent({ category: v })} />

                <Szerkesztheto
                  cimke="Csomag"
                  ertek={b.package_id ?? ''} zarolt={lezart} ures="nincs kiválasztva"
                  valaszthato={csomagValaszto} gombok
                  onMent={(v) => mezoMent({ package_id: v || null })} />

                {/* ---------- egyéb szolgáltatás ----------
                    A csomag alatt, mert a beszélgetés is így megy: először a
                    csomag, aztán „és még nézzétek meg a kárpitot".
                    A lista nem görgethető: ami nem látszik, arról nem is jut
                    eszébe az embernek, hogy felajánlja. */}
                <div className="adatsor szerk-sor extra-sor">
                  <span className="szerk-cimke">Egyéb szolgáltatás</span>
                  <span className="ertek">
                    <div className="extra-cimkek">
                      {mennyisegek.length === 0 && (
                        <span className="halvany">nincs</span>
                      )}
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
                    {!lezart && (
                      <button type="button" className="btn btn-kicsi extra-hozzaad"
                              aria-expanded={extraNyitva}
                              onClick={() => setExtraNyitva((v) => !v)}>
                        {extraNyitva ? 'Kész' : 'Hozzáadás'}
                      </button>
                    )}
                  </span>
                </div>

                {extraNyitva && !lezart && (
                  <div className="extra-valaszto">
                    {valaszthatoExtrak.map((e) => (
                      <label className="extra-tetel" key={e.id}
                             data-kert={kertExtrak.has(e.id)}>
                        <input type="checkbox"
                               checked={kertExtrak.has(e.id)}
                               disabled={extraMegy}
                               onChange={() => void extraBillent(e.id)} />
                        <span className="nev">{e.name}</span>
                        {/* Aminek nincs ára, az nulla forintot ad a foglaláshoz.
                            Ezt ki kell mondani: telefon közben a „—" jelenthetné
                            azt is, hogy ingyen van. */}
                        <span className={`ar szam${
                          !e.requires_quote && !e.price_huf ? ' nincs-ar' : ''}`}>
                          {e.requires_quote ? 'egyedi'
                            : e.price_huf ? ft(e.price_huf) : 'nincs ár'}
                        </span>
                      </label>
                    ))}
                    {valaszthatoExtrak.length === 0 && (
                      <div className="ures">Nincs felvett egyéb szolgáltatás.</div>
                    )}
                  </div>
                )}

                <Szerkesztheto
                  cimke="Terjedelem" ertek={b.scope} zarolt={lezart}
                  valaszthato={TERJEDELMEK} gombok
                  onMent={(v) => mezoMent({ scope: v })} />

                <Szerkesztheto
                  cimke="Típus" ertek={b.booking_type} zarolt={lezart}
                  valaszthato={TIPUSOK} gombok
                  onMent={(v) => mezoMent({ booking_type: v })} />

                <Szerkesztheto
                  cimke="Nap" ertek={b.service_date.slice(0, 10)} tipus="datum" zarolt={lezart}
                  onMent={(v) => mezoMent({ service_date: v })} />

                {b.booking_type === 'VAROS' ? (
                  <Szerkesztheto
                    cimke="Kezdés" ertek={ora(b.start_at)} tipus="ido" zarolt={lezart}
                    onMent={(v) => mezoMent({ start_time: v })}
                    utotag={b.planned_duration_minutes > 0 && (
                      <span className="halk">
                        {' '}· {idosav(b.start_at, b.planned_duration_minutes).split('–')[1]?.trim()}
                        -ig, {idotartam(b.planned_duration_minutes)}
                      </span>
                    )} />
                ) : (
                  <>
                    <Szerkesztheto
                      cimke="Hozza" ertek={ora(b.drop_off_at)} tipus="ido" zarolt={lezart}
                      onMent={(v) => mezoMent({ drop_off_time: v })} />
                    <Szerkesztheto
                      cimke="Viszi" ertek={ora(b.pick_up_at)} tipus="ido" zarolt={lezart}
                      ures="nincs megbeszélve"
                      onMent={(v) => mezoMent({ pick_up_time: v })}
                      utotag={b.planned_duration_minutes > 0 && (
                        <span className="halk"> · {idotartam(b.planned_duration_minutes)} munka</span>
                      )} />
                  </>
                )}

                {b.booking_type === 'TOBBNAPOS' && (
                  <>
                    <Szerkesztheto
                      cimke="Határidő napja" ertek={b.deadline_at?.slice(0, 10)}
                      tipus="datum" zarolt={lezart}
                      onMent={(v) => mezoMent({ deadline_date: v })} />
                    <Szerkesztheto
                      cimke="Határidő órája" ertek={ora(b.deadline_at)}
                      tipus="ido" zarolt={lezart}
                      onMent={(v) => mezoMent({ deadline_time: v })} />
                  </>
                )}
              </div>

              {/* ---------- 1. MEGJEGYZÉS ---------- */}
              {/* Menet közben derül ki a legtöbb fontos dolog, ezért van elöl. */}
              <div className="szakasz">
                <div className="fej">
                  Megjegyzés
                  {!megjMentve && <span className="jobbra halvany">nincs mentve</span>}
                </div>
                <textarea
                  className="beviteli"
                  value={megjegyzes}
                  disabled={lezart}
                  onChange={(e) => {
                    setMegjegyzes(e.target.value)
                    setMegjMentve(false)
                  }}
                  onBlur={() => !megjMentve && void megjMent()}
                />
              </div>

              {/* ---------- 2. MUNKALISTA ---------- */}
              <div className="szakasz">
                <div className="fej">
                  Munkalista
                  <span className="jobbra szam halk">
                    {keszLista}/{lista.length}
                  </span>
                </div>

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
                        {/* Csak ott van értelme a számlálónak, ahol tételek is
                            látszanak. A Kívülnél egy gomb van — a 4/8 csak zaj. */}
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

                      {/* a csomag lépései — csak ott, ahol a részletnek van értelme */}
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
                          </label>
                        ))}
                      </div>
                      )}

                      {/* a külön kért szolgáltatások — ezeket sosem pipálja a csoportgomb */}
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

              {/* ---------- MENNYISÉGEK ---------- */}
              {/* Az ablakmosó folyadék litereit és a kárpittisztítás ülésszámát
                  itt adják meg, nem foglaláskor: akkor még nem tudják.
                  Csak a mérhető tételek: az alkalmi árazásúaknál (polírozás,
                  kátrány) nincs mit beírni, ott az „1 db" csak zaj lenne. */}
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
                        onBlur={async (e) => {
                          const uj = Number(e.target.value)
                          if (!Number.isFinite(uj) || uj === m.quantity) return
                          try {
                            await data.setBookingExtraQty(m.item_id, uj)
                            valtozott.current = true
                            await betolt()
                          } catch (err) {
                            setHiba(err instanceof Error ? err.message : String(err))
                          }
                        }}
                      />
                      <span className="egyseg">
                        {m.price_unit === 'LITER' ? 'liter'
                          : m.price_unit === 'ULES' ? 'ülés'
                          : m.price_unit === 'AJTO' ? 'ajtó' : 'db'}
                      </span>
                      <span className="ar szam">{ft(m.price_huf)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ---------- 3. ÁR ---------- */}
              {/* A felár ide került, nem a foglaláshoz: telefonos foglaláskor
                  még nem látjuk az autót. Itt már készen áll. */}
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
                      value={pct}
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
                      value={fix}
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
                      onChange={(e) => setVegleges(e.target.value)}
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

            <div className="lap-lab">
              <div className="osszeg">
                <span className="ertek">{ft(b.final_price_huf ?? b.estimated_price_huf)}</span>
                <span className="alatta">{b.final_price_huf ? 'végleges' : 'becsült'}</span>
              </div>
              <div className="gombok">
                {!lezart && (
                  <button className="btn" onClick={onSzerkeszt}>
                    Szerkesztés
                  </button>
                )}
                {b.status === 'CONFIRMED' && (
                  <button className="btn" onClick={() => void allapot('NO_SHOW')}>
                    Nem jött el
                  </button>
                )}
                {lezart && (
                  <button className="btn" onClick={() => void allapot('READY')}>
                    Visszanyit
                  </button>
                )}
                {kovetkezo && (
                  <button className="btn btn-fo" onClick={() => void allapot(kovetkezo.to)}>
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
    </div>
  )
}
