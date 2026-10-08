import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { useMentetlen } from '../../state/useMentetlen'
import { ft, helyiNap, helyiOra, idosav, idotartam } from '../../lib/format'
import {
  CATEGORY_LABEL, NEXT_STATUS, SCOPE_LABEL, TYPE_LABEL,
  type BookingExtraRow, type BookingScope, type BookingTask, type BookingType,
  type DayBooking, type MunkalapFokusz, type ServiceArea, type VehicleCategory,
} from '../../lib/types'
import Szerkesztheto, { type Valaszthato } from '../common/Szerkesztheto'
import Sugo from '../common/Sugo'
import IdoMezo from '../common/IdoMezo'
import { useKerdes, type KerdesBeallitas } from '../common/Kerdes'
import { ALLAPOT_KERDES, NEM_FERT_BE_KERDES, TORLES_KERDES } from '../common/kerdesek'
import Csuszka from '../common/Csuszka'
import Kerdojel from '../day/Kerdojel'
import { CegValaszto, URES_CEG, useCegEgyeztetes, type CegErtek } from '../common/Ceg'
import { EGYSEG } from '../services/Arlista'
import FlottaMunkalap from './FlottaMunkalap'
import IgazoloGomb, { igazoloKell } from '../igazolo/IgazoloGomb'
import { useIgazoloKapu } from '../igazolo/useIgazoloKapu'
import { useKeszAblak } from './KeszAblak'

// A legördülők tartalma. A feliratok ugyanabból a szótárból jönnek, mint
// mindenhol máshol — így nem lehet két különböző neve ugyanannak.
const KATEGORIAK: Valaszthato[] = (['SZEMELYAUTO', 'SUV', 'KISBUSZ'] as VehicleCategory[])
  .map((v) => ({ ertek: v, cimke: CATEGORY_LABEL[v] }))

const TERJEDELMEK: Valaszthato[] = (['TELJES', 'KULSO', 'BELSO'] as BookingScope[])
  .map((v) => ({ ertek: v, cimke: SCOPE_LABEL[v] }))

// A „Többnapos" nem külön típus többé: a Viszi napja dönti el. Ha a Viszi
// későbbi napra esik, a foglalás többnapos — leadós és hozom-viszem is lehet.
const TIPUSOK: Valaszthato[] = (['VAROS', 'LEADOS', 'HOZOMVISZEM'] as BookingType[])
  .map((v) => ({ ertek: v, cimke: TYPE_LABEL[v] }))

// Szerződéses cégnél: a cég autója vagy a dolgozó saját autója.
const JARMU_TIPUSOK: Valaszthato[] = [
  { ertek: 'FLOTTA', cimke: 'Flotta' },
  { ertek: 'SAJAT', cimke: 'Saját' },
]

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
  fokusz,
  egyedi,
}: {
  bookingId: string
  onBezar: () => void
  /** Átvált a szerkesztő űrlapra — ugyanarra, amivel a foglalás készült. */
  onSzerkeszt: () => void
  /** Az árlistát nyitó gombok. A héj adja át, mert ő tartja az állapotot. */
  arlistaGombok?: React.ReactNode
  /** Nyitva az árlista: ilyenkor ez az ablak a bal oldalra húzódik. */
  osztott?: boolean
  /** A „Figyelmet igényel" listából: melyik mező nyíljon rögtön írásra. */
  fokusz?: MunkalapFokusz
  /**
   * Flottás autónál is ennek az EGY autónak a munkalapja (a csoport
   * munkalapjának „Részletek" gombja nyitja így). Nélküle flottás autónál a
   * csoport munkalapja nyílik.
   */
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

  // Élő frissítés: ha a nyitott foglalást közben egy másik eszközön átírják
  // (pl. a telefonon Start → Premium), a munkalap is frissül. De csak akkor,
  // ha itt épp nem gépel senki: a meg nem mentett megjegyzést, vagy egy
  // éppen kitöltött mezőt nem írjuk felül.
  const megjMentveRef = useRef(megjMentve)
  useEffect(() => { megjMentveRef.current = megjMentve }, [megjMentve])
  useEffect(() => data.subscribe(() => {
    const aktiv = document.activeElement
    // (a pipa is „input", de az nem gépelés)
    const gepel = (aktiv instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(aktiv.type))
      || aktiv instanceof HTMLTextAreaElement
      || aktiv instanceof HTMLSelectElement
    if (megjMentveRef.current && !gepel) void betolt()
  }), [data, betolt])

  const bezar = useCallback(() => {
    if (valtozott.current) refresh()
    onBezar()
  }, [onBezar, refresh])

  // Flottás csoportnál a csoport munkalapja kezeli az Escape-et (és a
  // „Részletek" ablakét) — ez az ablak ilyenkor nem zár be magától.
  const csoportNezet = Boolean(b?.fleet_group) && !egyedi
  useEffect(() => {
    if (csoportNezet) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && bezar()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [bezar, csoportNezet])

  // --- állapotból adódó zárolás ----------------------------------------------

  const lezart = b?.status === 'COMPLETED'
  const megerkezett = b ? ['ARRIVED', 'IN_PROGRESS', 'READY'].includes(b.status) : false
  // Kész van után a lista áll: ami üresen maradt, az KIMARADT (és nem számít
  // bele az árba). Javítani a Visszanyit gombbal lehet.
  const keszVolt = b ? ['READY', 'COMPLETED'].includes(b.status) : false
  const listaNyitva = megerkezett && !keszVolt
  // A „kimaradt" jelölés a pontokon (nem fért be autónál nincs: ott semmi
  // sem készült el, az a lényeg).
  const kimaradtJel = keszVolt && !b?.not_fitted

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
    // Kész autónál a Kívül is pontonként látszik, ha valami kimaradt belőle.
    const kulsoKimaradt = keszVolt && lista.some((t) => t.area === 'KULSO' && t.source === 'PACKAGE' && !t.done)
    return [
      mk('KULSO', 'Kívül', 'KULSO', kulsoKimaradt),
      mk('BELSO', 'Belül', 'BELSO', true),
      mk('EGYEB', 'Csomagon kívül', null, true),
    ].filter((cs) => cs.csomag.length + cs.extra.length > 0)
  }, [lista, keszVolt])

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

  // A kérdést a hívó adja meg, nem az állapot: a „Kész van" és a
  // „Visszanyit" ugyanoda (READY) visz, de csak az elsőnél kell
  // megkérdezni, hogy „Biztosan elkészült?".
  //
  // Az állapot azonnal átvált az ablakban, a mentés utána megy; az ablak
  // nyitva marad, és nem tölt újra. A napi lista bezáráskor csendben
  // frissül — a kártya a helyén marad.
  async function allapot(cel: Parameters<typeof data.setStatus>[1], k?: KerdesBeallitas) {
    if (k && !(await kerdez(k))) return
    valtozott.current = true
    setB((x) => (x ? { ...x, status: cel } : x))
    try {
      await data.setStatus(bookingId, cel)
      await betolt()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      await betolt()
    }
  }

  // A következő lépés. Igazolólapos cég autójánál (mint a napi kártyán):
  //   Kész van  → utána rögtön megnyílik a lap sora, aláíratni;
  //   Átvette   → csak ha a sor már ki van töltve (különben előbb azt nyitja).
  async function kovetkezoLepes(cel: Parameters<typeof data.setStatus>[1]) {
    if (!b) return
    const lapos = igazoloKell(b)
    try {
      if (lapos && cel === 'COMPLETED' && !(await kapu.atadhato(b.id))) return
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      return
    }
    if (cel === 'READY') {
      // „Kész van": a munkalistás ablak kérdez és ment (ami kimaradt, nem
      // számít bele az árba). Mégse esetén nem történt semmi.
      const eredmeny = await keszVan(b.id, (b.plate_raw ?? '').toUpperCase())
      if (!eredmeny) return
      valtozott.current = true
      await betolt()
    } else {
      const k = ALLAPOT_KERDES[cel]
      if (k && !(await kerdez(k))) return
      await allapot(cel)
    }
    if (lapos && cel === 'READY') {
      try {
        await kapu.alairat(b.id,
          'Az autó elkészült. Átadáskor írasd alá az igazolólapot (km, név, aláírás). '
          + 'Ha most nem, az Átvette gombnál újra előjön.')
      } catch (e) {
        setHiba(e instanceof Error ? e.message : String(e))
      }
    }
  }

  // Kérdőjeles be/ki: azonnal átvált, a mentés utána megy.
  async function kerdojelValt(uj: boolean) {
    if (!b) return
    valtozott.current = true
    setB((x) => (x ? { ...x, tentative: uj } : x))
    try {
      await data.setTentative(b.id, uj)
    } catch (e) {
      setB((x) => (x ? { ...x, tentative: !uj } : x))
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  // „Nem fért be": a kérdőjeles autó lezárása 0 Ft-tal.
  async function nemFertBe() {
    if (!b || !(await kerdez(NEM_FERT_BE_KERDES(b)))) return
    valtozott.current = true
    try {
      await data.notFitted(b.id)
      await betolt()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  async function visszanyit() {
    if (!b) return
    valtozott.current = true
    try {
      await data.reopenBooking(b.id)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
    await betolt()
  }

  async function lemond() {
    if (!b) return
    await allapot('CANCELLED_BY_CUSTOMER', TORLES_KERDES(b))
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
  //
  // A „változott" jelzés a mentés ELŐTT áll be: ha valaki átírja az órát, és
  // rögtön a Bezárás gombra bök, a bezárás hamarabb fut le, mint ahogy a
  // mentés visszaér — a napi nézetnek akkor is frissülnie kell.
  const mezoMent = useCallback(async (patch: Record<string, unknown>) => {
    valtozott.current = true
    await data.patchBooking(bookingId, patch)
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

  const varos = b?.booking_type === 'VAROS'
  const tobbnapos = b ? b.last_day.slice(0, 10) > b.service_date.slice(0, 10) : false

  const kovetkezo = b ? NEXT_STATUS[b.status] : undefined
  const lemondott = b ? ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP'].includes(b.status) : false
  // Lemondani addig lehet, amíg a munka nincs lezárva. Ha már elkészült az
  // autó, az nem lemondás — az egy elvégzett munka.
  const lemondhato = b ? !lezart && !lemondott && b.status !== 'NO_SHOW' : false
  const keszLista = lista.filter((t) => t.done).length

  // Flottás autó: a csoport munkalapja nyílik (egy cég, egy idő, több autó).
  // Onnan a „Részletek" gomb ennek az ablaknak az egyedi változatát nyitja.
  if (b?.fleet_group && !egyedi) {
    return (
      <FlottaMunkalap
        groupId={b.fleet_group}
        onBezar={onBezar}
        reszletek={(id, bezarReszlet) => (
          <BookingDetail key={id} bookingId={id} egyedi onBezar={bezarReszlet}
                         onSzerkeszt={onSzerkeszt} arlistaGombok={arlistaGombok} />
        )}
      />
    )
  }

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
                  {b.plate_raw?.toUpperCase()} <Kerdojel b={b} />
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
                  kezdetbenNyitva={fokusz === 'telefon'}
                  onMent={(v) => mezoMent({ customer_phone: v })}
                  utotag={b.customer_phone && (
                    <a href={`tel:${b.customer_phone}`} className="hivas"
                       title="Hívás">Hívás</a>
                  )} />

                <CegSor b={b} zarolt={lezart} onMent={mezoMent} />

                {/* Szerződéses / bérletes cég autója: a cég havi igazolólapjának
                    sora (km, név, aláírás). A cég mellett áll, mert a céghez
                    tartozik — a munkalap lábába nem fért volna el egy sorban. */}
                {igazoloKell(b) && (
                  <div className="adatsor">
                    <span>Igazolólap</span>
                    <span className="ertek">
                      <IgazoloGomb bookingId={b.id} className="btn btn-kicsi" felirat="Kitöltés, aláírás" />
                    </span>
                  </div>
                )}

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

                {/* ---------- Hozza / Viszi ----------
                    Mindkettő nappal és órával. Ha a Viszi napja későbbi, a
                    foglalás többnapos: minden napján ott lesz a napi nézetben.
                    Megvárja esetén nincs külön Viszi: akkor viszi, amikor kész. */}
                <NapOraSor
                  cimke="Hozza"
                  nap={b.service_date.slice(0, 10)}
                  ora={helyiOra(varos ? b.start_at : b.drop_off_at)}
                  zarolt={lezart}
                  onMent={(m) => mezoMent({
                    ...(m.nap !== undefined ? { service_date: m.nap } : {}),
                    ...(m.ora !== undefined ? { [varos ? 'start_time' : 'drop_off_time']: m.ora } : {}),
                  })} />

                {varos ? (
                  <div className="adatsor">
                    <span>Viszi</span>
                    <span className="ertek">
                      {b.start_at && b.planned_duration_minutes > 0
                        ? <>megvárja, kb. {idosav(b.start_at, b.planned_duration_minutes).split('–')[1]?.trim()}-kor kész</>
                        : <span className="halvany">megvárja</span>}
                    </span>
                  </div>
                ) : (
                  <NapOraSor
                    cimke="Viszi"
                    // A régi „Több napos" foglalásnál a határidő a Viszi.
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

                {/* Kérdőjeles: itt hagyják, de csak feltételesen vállaltuk el
                    (ha befér, megcsináljuk). Utólag is be- és kikapcsolható. */}
                <div className="adatsor">
                  <span>Kérdőjeles</span>
                  <span className="ertek kerdojel-sor">
                    <Csuszka be={b.tentative} cimke="Kérdőjeles (feltételesen vállalt)"
                             tiltva={lezart} onValt={(uj) => void kerdojelValt(uj)} />
                    <span className="halk">ha befér, megcsináljuk, ha nem, nem</span>
                    {/* „Nem fért be" bármelyik autónál (túlvállalás). Kérdőjelesnél
                        a lábban is ott van; itt, hogy a láb gombsora ne nőjön. */}
                    {lemondhato && !b.tentative && (
                      <button type="button" className="btn btn-kicsi btn-kerdojel"
                              onClick={() => void nemFertBe()}>
                        Nem fért be
                      </button>
                    )}
                  </span>
                </div>

                <Szerkesztheto
                  cimke="Méret" ertek={b.category} zarolt={lezart}
                  valaszthato={KATEGORIAK} gombok
                  onMent={(v) => mezoMent({ category: v })} />

                {/* Csak ha a foglalás szerződéses áron megy: a cég autója
                    (céges ár) vagy a dolgozó saját autója (magán ár). */}
                {b.contract_kind && (
                  <Szerkesztheto
                    cimke="Jármű típus" ertek={b.contract_kind} zarolt={lezart}
                    valaszthato={JARMU_TIPUSOK} gombok
                    onMent={(v) => mezoMent({ contract_kind: v })} />
                )}

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
                      <div className="extra-tetel" key={e.id}
                           data-kert={kertExtrak.has(e.id)}>
                        {/* A név és a pipa egy címkében: a névre kattintás is
                            pipál. A súgó viszont KÍVÜL van rajta, különben a
                            leírás megnyitása felvenné a szolgáltatást. */}
                        <label className="extra-valaszt">
                          <input type="checkbox"
                                 checked={kertExtrak.has(e.id)}
                                 disabled={extraMegy}
                                 onChange={() => void extraBillent(e.id)} />
                          <span className="nev">{e.name}</span>
                        </label>
                        {/* Aminek nincs ára, az nulla forintot ad a foglaláshoz.
                            Ezt ki kell mondani: telefon közben a „—" jelenthetné
                            azt is, hogy ingyen van. */}
                        <span className={`ar szam${
                          !e.requires_quote && !e.price_huf ? ' nincs-ar' : ''}`}>
                          {e.requires_quote ? 'egyedi'
                            : e.price_huf ? ft(e.price_huf) : 'nincs ár'}
                          {e.price_unit !== 'ALKALOM' && !e.requires_quote && e.price_huf
                            ? ` / ${EGYSEG[e.price_unit]}` : ''}
                        </span>
                        {e.description?.trim() && (
                          <Sugo cim={e.name} szoveg={e.description} />
                        )}
                      </div>
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
                  cimke="Típus"
                  // A régi „Többnapos" foglalás leadósként jelenik meg — hogy
                  // többnapos, azt már a Viszi napja mutatja.
                  ertek={b.booking_type === 'TOBBNAPOS' ? 'LEADOS' : b.booking_type}
                  zarolt={lezart}
                  valaszthato={TIPUSOK} gombok
                  onMent={(v) => mezoMent({ booking_type: v })} />

                {/* A szerződésben megállapodott fuvardíj. Csak hozom-viszem
                    foglalásnál, és csak ha a cégnek van rá élő szerződése.
                    Az összeg BENNE van a lenti árban (külön tételként) — itt
                    azért áll, hogy látsszon, miből jön ki a végösszeg. */}
                {b.pickup_fee_huf != null && (
                  <div className="adatsor">
                    <span>Fuvar</span>
                    <span className="ertek">
                      {ft(b.pickup_fee_huf)}
                      <span className="halk"> · benne az árban</span>
                    </span>
                  </div>
                )}

                {/* A tervezett munkaidő: a csomag, a méret és az egyéb
                    szolgáltatások összege. Nem szerkeszthető — abból jön ki,
                    amit fent kiválasztottak. */}
                <div className="adatsor">
                  <span>Munkaóra</span>
                  <span className="ertek">
                    {b.planned_duration_minutes > 0
                      ? idotartam(b.planned_duration_minutes)
                      : <span className="halvany">nincs megadva</span>}
                  </span>
                </div>
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

                {/* Kész van után: ami kimaradt, és mennyivel lett kevesebb az ár. */}
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
                            {kimaradtJel && !t.done && <span className="kimaradt-cimke">kimaradt</span>}
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

            {/* A láb két sorból áll, és telefonon tényleg két sor lesz belőle.
                Fent az ár és a hozzá tartozó Szerkesztés — ez a kettő egy
                gondolat: ennyibe kerül, és itt tudod átírni. Lent a munka
                haladása: Törlés, a következő állapot, Bezárás.

                Egy sorban ez a hat gomb telefonon nem fért ki: a jobb szélen
                lévők egyszerűen lelógtak a képernyőről. */}
            <div className="lap-lab munkalap-lab">
              <div className="lab-fent">
                <div className="osszeg">
                  <span className="ertek">{ft(b.final_price_huf ?? b.estimated_price_huf)}</span>
                  <span className="alatta">{b.final_price_huf ? 'végleges' : 'becsült'}</span>
                </div>
                {!lezart && (
                  <button className="btn" onClick={onSzerkeszt}>
                    Szerkesztés
                  </button>
                )}
              </div>
              <div className="gombok">
                {b.status === 'CONFIRMED' && (
                  <button className="btn" onClick={() => void allapot('NO_SHOW')}>
                    Nem jött el
                  </button>
                )}
                {/* Lemondás. A foglalás sora MEGMARAD — egyrészt mert a
                    lemondások száma üzleti adat, másrészt mert egy véletlen
                    lemondás így visszavonható. A nap kapacitásából viszont
                    azonnal kiesik, tehát az időpont újra kiadható.
                    Az ügyfél és az autó adata sem vész el: azok külön sorok,
                    és akkor is megmaradnak, ha ez volt az első foglalása. */}
                {lemondhato && b.tentative && (
                  <button className="btn btn-kerdojel" onClick={() => void nemFertBe()}>
                    Nem fért be
                  </button>
                )}
                {lemondhato && (
                  <button className="btn btn-veszelyes"
                          onClick={() => void lemond()}>
                    Törlés
                  </button>
                )}
                {lemondott && (
                  <button className="btn" onClick={() => void allapot('CONFIRMED')}>
                    Mégis jön
                  </button>
                )}
                {/* Visszanyit: Kész van-ból és lezártból is a Kész van ELŐTTI
                    állapotba (pl. Dolgozunk), és a „Kész van"-kor magától
                    kipipált munkapontok pipája is lekerül — a kézzel
                    kipipáltak maradnak. */}
                {(lezart || b.status === 'READY') && (
                  <button className="btn" onClick={() => void visszanyit()}>
                    Visszanyit
                  </button>
                )}
                {kovetkezo && (
                  <button className="btn btn-fo"
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
      {kerdesAblak}
      {keszAblak}
      {kapuAblak}
    </div>
  )
}


// ---------------------------------------------------------------------------
//  Hozza / Viszi sor: nap és óra egymás mellett
// ---------------------------------------------------------------------------
//
//  Itt nem „kattints rá az átíráshoz" van, mint a többi adatnál, hanem a két
//  mező mindig nyitva áll: a nap és az óra a leggyakrabban átírt adat
//  („mégis csütörtökön hozza"), és a dátumválasztó amúgy is egy külön
//  kattintás.
//
//  Mentés: a mezőből kilépéskor, vagy ha a változás után egy kis ideig nem
//  nyúlnak hozzá. Az utóbbi a telefon miatt kell: ott a dátumválasztó
//  bezárása után a mező fókuszban marad, és a kilépés csak a következő
//  koppintásnál jönne. A várakozás pedig azért, mert asztali gépen a dátumot
//  számjegyenként is be lehet gépelni — egy félig beírt évszámot (0202)
//  nem szabad elmenteni.

const VARAKOZAS_MS = 900

function NapOraSor({
  cimke,
  nap,
  ora,
  minNap,
  zarolt,
  oraUres,
  utotag,
  onMent,
}: {
  cimke: string
  nap: string
  /** "08:00", vagy üres, ha nincs megbeszélve. */
  ora: string
  minNap?: string
  zarolt: boolean
  oraUres?: string
  utotag?: React.ReactNode
  onMent: (m: { nap?: string; ora?: string }) => Promise<void>
}) {
  const [napP, setNapP] = useState(nap)
  const [oraP, setOraP] = useState(ora)
  const [hiba, setHiba] = useState<string | null>(null)
  const idozito = useRef<number | undefined>(undefined)
  // Ami utoljára elment (vagy betöltődött): ehhez mérjük, van-e mit menteni.
  const mentett = useRef({ nap, ora })

  // Ha kívülről változik (mentés után újratöltés, másik gépen módosították),
  // a mezők is követik.
  useEffect(() => {
    setNapP(nap); setOraP(ora)
    mentett.current = { nap, ora }
  }, [nap, ora])

  useEffect(() => () => window.clearTimeout(idozito.current), [])

  async function ment(ujNap: string, ujOra: string) {
    window.clearTimeout(idozito.current)
    const m: { nap?: string; ora?: string } = {}
    // Csak a teljes, értelmes dátum mehet el (2000 utáni év).
    if (ujNap !== mentett.current.nap && /^(2\d{3})-\d{2}-\d{2}$/.test(ujNap)) m.nap = ujNap
    if (ujOra !== mentett.current.ora && (ujOra === '' || /^\d{2}:\d{2}$/.test(ujOra))) m.ora = ujOra
    if (m.nap === undefined && m.ora === undefined) return
    mentett.current = { nap: m.nap ?? mentett.current.nap, ora: m.ora ?? mentett.current.ora }
    try {
      await onMent(m)
      setHiba(null)
    } catch (e) {
      // A mező a beírt értéken marad, hogy lássa, mit nem fogadott el.
      mentett.current = { nap, ora }
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  function kesobb(ujNap: string, ujOra: string) {
    window.clearTimeout(idozito.current)
    idozito.current = window.setTimeout(() => void ment(ujNap, ujOra), VARAKOZAS_MS)
  }

  if (zarolt) {
    return (
      <div className="adatsor">
        <span>{cimke}</span>
        <span className="ertek">
          {nap.replaceAll('-', '. ')}. {ora || <span className="halvany">{oraUres ?? '—'}</span>}
          {utotag}
        </span>
      </div>
    )
  }

  return (
    <div className="adatsor szerk-sor napora-adat">
      <span className="szerk-cimke">{cimke}</span>
      <span className="ertek">
        <span className="napora-mezok">
          <input type="date" className="beviteli" aria-label={`${cimke} napja`}
                 value={napP} min={minNap}
                 onChange={(e) => { setNapP(e.target.value); kesobb(e.target.value, oraP) }}
                 onBlur={() => void ment(napP, oraP)} />
          <IdoMezo ariaLabel={`${cimke} órája`} cim={`${cimke} — óra`}
                   value={oraP} placeholder={oraUres} torolheto={Boolean(oraUres)}
                   onChange={(v) => { setOraP(v); kesobb(napP, v) }}
                   onKesz={(v) => void ment(napP, v)} />
          {utotag}
        </span>
        {hiba && <div className="szerk-hiba">{hiba}</div>}
      </span>
    </div>
  )
}

/** Hány napot fog át a foglalás, a Hozza és a Viszi napját is beleszámolva. */
function napokSzama(elso: string, utolso: string): number {
  const a = Date.parse(`${elso.slice(0, 10)}T12:00:00Z`)
  const z = Date.parse(`${utolso.slice(0, 10)}T12:00:00Z`)
  return Math.round((z - a) / 86_400_000) + 1
}


// ---------------------------------------------------------------------------
//  Cég sor: kereső, és mentés előtt egyeztetés a hasonló nevekkel
// ---------------------------------------------------------------------------
//
//  Ugyanaz a kereső, mint az új időpontnál. Ha a listából választanak, az
//  rögtön elmegy. Ha gépelnek, kilépéskor megy: előtte az adatbázis
//  összeveti a meglévő cégekkel, és ha nagyon hasonló van, rákérdez.
//  Üresre törölve a foglalás ügyfele leválik a cégről.

function CegSor({
  b,
  zarolt,
  onMent,
}: {
  b: DayBooking
  zarolt: boolean
  onMent: (patch: Record<string, unknown>) => Promise<void>
}) {
  const [nyitva, setNyitva] = useState(false)
  const [ertek, setErtek] = useState<CegErtek>(URES_CEG)
  const [hiba, setHiba] = useState<string | null>(null)
  const [cegAblak, cegEgyeztet] = useCegEgyeztetes()
  // A friss érték a kilépéskor futó mentésnek (a kattintás és a kilépés
  // ugyanabban a pillanatban jön, a state még a régi lehet).
  const friss = useRef<CegErtek>(URES_CEG)
  // Egyszerre egy mentés: a listából választás és az utána jövő kilépés ne
  // menjen el kétszer. Escape-nél pedig a kilépés ne mentsen.
  const megy = useRef(false)
  const megse = useRef(false)

  useEffect(() => {
    if (nyitva) document.getElementById('munkalap-ceg')?.focus()
  }, [nyitva])

  function nyit() {
    if (zarolt) return
    const kezdo = { id: b.company_id, nev: b.company_name ?? '' }
    setErtek(kezdo)
    friss.current = kezdo
    megse.current = false
    setHiba(null)
    setNyitva(true)
  }

  function valt(uj: CegErtek) {
    setErtek(uj)
    friss.current = uj
    // Listából választott: nincs mit egyeztetni, mehet.
    if (uj.id) void ment(uj)
  }

  async function ment(e: CegErtek) {
    if (megy.current || megse.current) return
    const nev = e.nev.trim()
    const regiNev = (b.company_name ?? '').trim()

    // Nem változott semmi: csak bezárjuk.
    if ((e.id && e.id === b.company_id) || (!e.id && nev === '' && !b.company_id)
        || (!e.id && nev === regiNev && b.company_id)) {
      setNyitva(false)
      return
    }

    megy.current = true
    try {
      const c = await cegEgyeztet({ id: e.id, nev })
      if (c === null) return                 // „Erre gondoltál?" — Escape: marad nyitva
      if (c.id && c.id === b.company_id) { setNyitva(false); return }
      await onMent(c.id
        ? { company_id: c.id }
        : { company_id: null, company_name: c.nev })
      setHiba(null)
      setNyitva(false)
    } catch (err) {
      setHiba(err instanceof Error ? err.message : String(err))
    } finally {
      megy.current = false
    }
  }

  if (!nyitva) {
    return (
      <div className="adatsor szerk-sor">
        <span className="szerk-cimke">Cég</span>
        <span className="ertek">
          {zarolt ? (
            <span className={b.company_name ? undefined : 'halvany'}>{b.company_name || 'nincs'}</span>
          ) : (
            <button type="button" className={`szerk-ertek${b.company_name ? '' : ' ures'}`}
                    onClick={nyit} title="Kattints az átíráshoz">
              {b.company_name || 'nincs'}
            </button>
          )}
          {b.contract_kind && <span className="cimke-pill szerzodes-pill">szerződés</span>}
        </span>
        {cegAblak}
      </div>
    )
  }

  return (
    <div className="adatsor szerk-sor szerk-nyitva"
         onKeyDownCapture={(e) => {
           if (e.key === 'Escape') { megse.current = true; setNyitva(false) }
         }}>
      <span className="szerk-cimke">Cég</span>
      <span className="ertek">
        <CegValaszto inputId="munkalap-ceg" ertek={ertek} onValt={valt}
                     onKilep={() => void ment(friss.current)} />
        {hiba && <div className="szerk-hiba">{hiba}</div>}
      </span>
      {cegAblak}
    </div>
  )
}
