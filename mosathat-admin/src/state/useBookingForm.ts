import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from './AppContext'
import { maStr, percIdo, helyiNap, helyiOra } from '../lib/format'
import type {
  BookingScope, BookingType, ContractKind, Quote, SearchHit, VehicleCategory,
} from '../lib/types'
import type { KeresesMezo } from '../data'
import { URES_CEG, type CegErtek } from '../features/common/Ceg'

// ---------------------------------------------------------------------------
//  A foglalási űrlap állapota — felvitelhez ÉS szerkesztéshez.
//
//  Ugyanaz az űrlap szolgálja mindkettőt. Nem kényelmi döntés: ha két külön
//  űrlap lenne, előbb-utóbb eltérnének, és a szerkesztésből kimaradna egy
//  mező, amit a felvitelbe közben hozzáadtunk.
//
//  Ami magyarázatot érdemel:
//
//  1. AZONNALI KERESÉS A MEZŐKBŐL. Nincs külön kereső doboz: maga a Rendszám
//     és a Név mező keres, az első karaktertől. A rendszám a rendszámok közt,
//     a név a személy- és cégnevek közt — ugyanaz a két betű mást jelent a
//     kettőben. Ha ismerjük az autót, egy koppintás kitölti a többi mezőt;
//     ha nem, a beírt szöveg a helyén marad, nincs mit újra begépelni.
//
//  2. ÉLŐ ÁR ÉS IDŐ. Minden kattintás után újraszámol, de nem itt, hanem az
//     adatbázisban (quote_booking). Ugyanaz a függvény állítja össze a
//     tételeket, ami a mentéskor — szerződéses árral, Flotta/Saját szerint,
//     hozom-viszem fuvarral. Az űrlap nem mutathat mást, mint ami elmentődik.
//
//  3. A CSOMAG AZ EGYETLEN KÖTELEZŐ. Alapból a Start van kiválasztva, és
//     csomag nélkül nem lehet menteni. Ezen kívül elég a rendszám VAGY a név
//     VAGY a cég: a foglalást fel kell tudni venni akkor is, ha az ügyfél épp
//     az autópályán beszél és nem tudja a rendszámot.
//
//  4. HOZZA ÉS VISZI, NAPPAL. Ha a Viszi napja későbbi, a foglalás többnapos —
//     ezt a dátum mondja meg, nem külön gomb. Így egy hozom-viszem autó is
//     maradhat két napig.
// ---------------------------------------------------------------------------

export interface FormState {
  // ügyfél
  name: string
  phone: string
  plate: string
  ceg: CegErtek
  // jármű
  category: VehicleCategory
  brand: string
  model: string
  /** Csak szerződéses cégnél számít: a cég autója, vagy a dolgozó sajátja. */
  contractKind: ContractKind | null
  // szolgáltatás
  packageId: string | null
  scope: BookingScope
  fullService: boolean
  extras: Record<string, number>
  // mikor
  bookingType: BookingType
  /** A Hozza napja — a foglalás napja. */
  date: string
  startTime: string
  dropOffTime: string
  /** A Viszi napja. Üres: ugyanaz a nap. */
  pickUpDate: string
  pickUpTime: string
  /** Kérdőjeles: itt hagyja, de csak feltételesen vállaltuk (ha befér). */
  tentative: boolean
  /**
   * Flottás csoport: hány autó (0 = rendes, egy autós foglalás). Csak
   * „Flottás autók" szerződésű cégnél, az „Autó hozzáadása" gombbal nő.
   */
  flottaDarab: number
  // egyéb
  notes: string
}

export const URES_URLAP: FormState = {
  name: '',
  phone: '',
  plate: '',
  ceg: URES_CEG,
  category: 'SZEMELYAUTO',
  brand: '',
  model: '',
  contractKind: null,
  packageId: null,
  scope: 'TELJES',
  fullService: false,
  extras: {},
  // "Itt hagyja" az alapértelmezett, mert ez a gyakoribb eset
  bookingType: 'LEADOS',
  date: maStr(),
  startTime: '09:00',
  dropOffTime: '08:00',
  pickUpDate: '',
  pickUpTime: '',
  tentative: false,
  flottaDarab: 0,
  notes: '',
}

/** "2026-09-26T06:00:00Z" → "08:00" budapesti időben, az űrlap mezőjéhez. */
export function useBookingForm(nyitottE: boolean, kezdoNap: string, bookingId?: string | null) {
  const { data, catalog } = useApp()

  // A Start az alap. A katalógusból jön, mert a csomagok azonosítója nem
  // beégetett érték — ha egyszer átneveznék, akkor is a legkisebb csomag.
  const startId = useMemo(
    () => catalog?.packages.find((p) => p.code === 'START')?.id
      ?? catalog?.packages.filter((p) => p.active)[0]?.id
      ?? null,
    [catalog],
  )

  const [f, setF] = useState<FormState>({ ...URES_URLAP, date: kezdoNap, packageId: startId })
  const [talalatok, setTalalatok] = useState<SearchHit[]>([])
  const [valasztott, setValasztott] = useState<SearchHit | null>(null)
  /** Melyik mezőbe gépelnek most: ez alatt jelenik meg a találatlista. */
  const [keresMezo, setKeresMezo] = useState<KeresesMezo | null>(null)
  const [keres, setKeres] = useState(false)
  const [calc, setCalc] = useState<Quote | null>(null)
  const [mentes, setMentes] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [tolt, setTolt] = useState(false)
  /** Szerkesztésnél a foglalás ügyfele — az árazás a cégét ebből is tudja. */
  const [ugyfelId, setUgyfelId] = useState<string | null>(null)

  const szerkesztes = Boolean(bookingId)

  // --- nyitáskor: tiszta lap vagy a meglévő foglalás betöltése --------------

  useEffect(() => {
    if (!nyitottE) return
    setHiba(null)
    setTalalatok([])
    setValasztott(null)
    setKeresMezo(null)
    setUgyfelId(null)

    if (!bookingId) {
      setF({ ...URES_URLAP, date: kezdoNap, packageId: startId })
      setCalc(null)
      return
    }

    setTolt(true)
    // A kérdőjelet a nap nézetéből olvassuk (a szerkesztő adatai közt nincs).
    Promise.all([data.getBookingFormData(bookingId), data.getBooking(bookingId)])
      .then(([d, nap]) => {
        if (!d) return
        const b = d.booking
        // A Viszi: az átvétel, régi „Több napos" foglalásnál a határidő.
        const viszi = b.pick_up_at ?? b.deadline_at
        const vissziNap = helyiNap(viszi)
        setUgyfelId(d.customer.id)
        setF({
          name: d.customer.name === 'Névtelen' ? '' : d.customer.name,
          phone: d.customer.phone === '—' ? '' : d.customer.phone,
          plate: d.vehicle.plate_raw === '—' ? '' : d.vehicle.plate_raw,
          ceg: d.company
            ? { id: d.company.id, nev: d.company.name }
            : { id: null, nev: d.customer.company_name ?? '' },
          category: d.vehicle.category,
          brand: d.vehicle.brand ?? '',
          model: d.vehicle.model ?? '',
          contractKind: b.contract_kind ?? d.vehicle.contract_kind ?? null,
          packageId: b.package_id,
          scope: b.scope,
          fullService: b.full_service,
          extras: Object.fromEntries(
            d.extras.filter((e) => e.extra_id).map((e) => [e.extra_id, Number(e.quantity) || 1]),
          ),
          // A „Több napos" gomb megszűnt: a régi ilyen foglalás „Itt hagyja"
          // lesz, a határidő pedig a Viszi. Az adatbázis ugyanúgy kezeli.
          bookingType: b.booking_type === 'TOBBNAPOS' ? 'LEADOS' : b.booking_type,
          date: b.service_date.slice(0, 10),
          startTime: helyiOra(b.start_at) || '09:00',
          dropOffTime: helyiOra(b.drop_off_at) || '08:00',
          pickUpDate: vissziNap && vissziNap !== b.service_date.slice(0, 10) ? vissziNap : '',
          pickUpTime: helyiOra(viszi),
          tentative: nap?.tentative ?? false,
          flottaDarab: 0,
          notes: b.notes ?? '',
        })
      })
      .catch((e) => setHiba(e instanceof Error ? e.message : String(e)))
      .finally(() => setTolt(false))
  }, [nyitottE, kezdoNap, bookingId, data, startId])

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => {
      const uj = { ...p, [k]: v }
      // Ha a Hozza napja a Viszi mögé kerül, a Viszi vele jön — különben a
      // foglalás egy pillanatra „visszafelé" tartana, és nem lehetne menteni.
      if (k === 'date' && uj.pickUpDate && uj.pickUpDate <= uj.date) uj.pickUpDate = ''
      return uj
    })
  }, [])

  // --- 1. azonnali keresés ---------------------------------------------------
  // Az első karaktertől indul, 220 ms csend után. Szerkesztéskor nincs rá
  // szükség: ott már tudjuk, kiről van szó.

  const idozito = useRef<number | undefined>(undefined)

  // A keresett szöveg abból a mezőből jön, amelyikbe épp gépelnek. Ha
  // egyikbe sem (mert még hozzá se nyúltak, vagy már választottak a
  // listából), nincs keresés és nincs lista sem.
  const keresSzoveg =
    keresMezo === 'RENDSZAM' ? f.plate : keresMezo === 'NEV' ? f.name : ''

  useEffect(() => {
    if (szerkesztes || !keresMezo) {
      setTalalatok([])
      return
    }
    window.clearTimeout(idozito.current)
    const q = keresSzoveg.trim()
    if (q.length < 1) {
      setTalalatok([])
      return
    }
    idozito.current = window.setTimeout(async () => {
      setKeres(true)
      try {
        setTalalatok(await data.searchCustomers(q, 5, keresMezo))
      } catch {
        setTalalatok([])
      } finally {
        setKeres(false)
      }
    }, 220)
    return () => window.clearTimeout(idozito.current)
  }, [keresSzoveg, keresMezo, data, szerkesztes])

  /**
   * A Rendszám és a Név mező írása. Az érték ugyanúgy az űrlapra kerül, mint
   * bármelyik másik mezőé — a keresés csak MELLÉKESEN indul el. Ezért marad
   * ott, amit beírtál, akkor is, ha nincs találat.
   */
  const keresoIras = useCallback((mezo: 'RENDSZAM' | 'NEV', ertek: string) => {
    setKeresMezo(mezo)
    setF((p) => (mezo === 'RENDSZAM' ? { ...p, plate: ertek } : { ...p, name: ertek }))
  }, [])

  /** A találatlista bezárása választás nélkül (pl. Escape). */
  const keresoZar = useCallback(() => {
    setKeresMezo(null)
    setTalalatok([])
  }, [])

  /**
   * Találat kiválasztása: az ügyfél és az autó adatai betöltődnek — a cég is,
   * mégpedig a meglévő céghez kötve. A csomag NEM: most mást is kérhet.
   */
  const talalatValaszt = useCallback((h: SearchHit) => {
    setValasztott(h)
    setTalalatok([])
    // A keresés leáll: a mezőkbe most éppen mi írtunk bele, azt nem kell
    // újra megkeresni — különben a lista rögtön vissza is nyílna.
    setKeresMezo(null)
    setF((p) => ({
      ...p,
      name: h.customer_name === 'Névtelen' ? '' : h.customer_name,
      phone: h.customer_phone === '—' ? '' : h.customer_phone,
      plate: h.plate_raw === '—' ? '' : h.plate_raw,
      ceg: h.company_id ? { id: h.company_id, nev: h.company_name ?? '' } : URES_CEG,
      category: h.category,
      brand: h.brand ?? '',
      model: h.model ?? '',
      contractKind: h.contract_kind ?? null,
    }))
  }, [])

  /** "Ezt kéri" — a korábbi munka csomagja átkerül az űrlapra. */
  const ezcKeri = useCallback((packageIdByCode: Record<string, string>) => {
    const kod = valasztott?.utolso_csomag
    if (!kod) return
    // Az utolso_csomag a csomag NEVE (Start / Premium / Elit), a kód nagybetűs.
    const id = packageIdByCode[kod.toUpperCase()]
    if (id) setF((p) => ({ ...p, packageId: id }))
  }, [valasztott])

  // --- 2. élő ár és idő ------------------------------------------------------

  const extrakLista = useMemo(
    () => Object.entries(f.extras)
      .filter(([, q]) => q > 0)
      .map(([extra_id, quantity]) => ({ extra_id, quantity })),
    [f.extras],
  )

  const arKerdes = useMemo(
    () => ({
      package_id: f.packageId,
      category: f.category,
      scope: f.scope,
      full_service: f.fullService,
      extras: extrakLista,
      // A felárak NEM itt vannak: telefonos foglaláskor még nem látjuk az
      // autót. A munkalapon kerülnek be, amikor a kocsi már készen áll.
      surcharge_pct: 0,
      surcharge_fix: 0,
      booking_type: f.bookingType,
      service_date: f.date,
      // A szerződéses árhoz a cég kell: a kiválasztott, a beírt név, vagy
      // a meglévő ügyfélé.
      company_id: f.ceg.id,
      company_name: f.ceg.nev.trim() || null,
      customer_id: valasztott?.customer_id ?? ugyfelId,
      vehicle_id: valasztott?.vehicle_id ?? null,
      contract_kind: f.contractKind,
    }),
    [f.packageId, f.category, f.scope, f.fullService, extrakLista, f.bookingType, f.date,
     f.ceg.id, f.ceg.nev, valasztott, ugyfelId, f.contractKind],
  )

  useEffect(() => {
    if (!arKerdes.package_id && arKerdes.extras.length === 0) {
      setCalc(null)
      return
    }
    let el = true
    data
      .quoteBooking(arKerdes)
      .then((r) => el && setCalc(r))
      .catch(() => el && setCalc(null))
    return () => {
      el = false
    }
  }, [arKerdes, data])

  /** Van-e a cégnek élő szerződése — csak ilyenkor kell Flotta / Saját. */
  const szerzodeses = Boolean(calc?.contract_id)

  // „Flottás autók" a cég szerződésében: ekkor jelenik meg az „Autó
  // hozzáadása" gomb (csak új foglalásnál). A szerződés azonosítója az
  // árajánlatból jön, a kapcsolót külön kérdezzük le.
  const [flottas, setFlottas] = useState(false)
  const szerzodesId = calc?.contract_id ?? null
  useEffect(() => {
    let el = true
    if (!szerzodesId || bookingId) { setFlottas(false); return }
    data.contractIsFleet(szerzodesId)
      .then((v) => { if (el) setFlottas(v) })
      .catch(() => { if (el) setFlottas(false) })
    return () => { el = false }
  }, [data, szerzodesId, bookingId])
  // Ha a cég már nem flottás (pl. másik céget írtak be), a darabszám nullázódik.
  const flottaDarab = flottas ? f.flottaDarab : 0

  // --- 3. mentés -------------------------------------------------------------

  // A csomag kötelező (a Start az alap); ezen felül elég, ha valamiről
  // tudjuk, kiről van szó.
  const menthetE = useMemo(
    () => Boolean(f.packageId)
      && Boolean(f.plate.trim() || f.name.trim() || f.ceg.nev.trim()),
    [f.packageId, f.plate, f.name, f.ceg.nev],
  )

  /**
   * Mentés. A cég egyeztetése (azonos / hasonló név) a hívó dolga, mert ahhoz
   * kérdezni kell a felhasználót; az eredményt itt kapjuk meg.
   */
  const ment = useCallback(async (ceg: CegErtek = f.ceg): Promise<string | null> => {
    setMentes(true)
    setHiba(null)
    try {
      const varos = f.bookingType === 'VAROS'
      const input = {
        package_id: f.packageId,
        category: f.category,
        scope: f.scope,
        full_service: f.fullService,
        extras: extrakLista,
        surcharge_pct: 0,
        surcharge_fix: 0,
        customer_id: valasztott?.customer_id ?? null,
        customer_name: f.name.trim(),
        customer_phone: f.phone.trim(),
        // A cég: ha ki van választva, az azonosítója dönt; ha csak név, az
        // adatbázis a névkulcs alapján köti meglévőhöz vagy hoz létre újat.
        // Az üres company_id szerkesztésnél azt jelenti: nincs cég.
        company_id: ceg.id,
        company_name: ceg.nev.trim() || null,
        contract_kind: szerzodeses ? (f.contractKind ?? 'FLOTTA') : null,
        vehicle_id: valasztott?.vehicle_id ?? null,
        plate_raw: f.plate.trim(),
        brand: f.brand.trim() || null,
        model: f.model.trim() || null,
        seats: null,
        booking_type: f.bookingType,
        service_date: f.date,
        // Megvárja esetén kell kezdés; a mező sosem üres, mert van
        // alapértelmezése — így a "semmi nem kötelező" nem ütközik az
        // adatbázis szabályával.
        start_time: varos ? f.startTime || '09:00' : null,
        drop_off_time: varos ? null : f.dropOffTime || '08:00',
        pick_up_date: varos ? null : f.pickUpDate || null,
        pick_up_time: varos ? null : f.pickUpTime || null,
        source: 'TELEFON' as const,
        notes: f.notes.trim() || null,
      }

      // A kérdőjel külön hívással megy (a foglalás mentése után): új
      // foglalásnál csak ha be van kapcsolva, módosításnál mindig.
      // Flottás csoport: N autó, rendszám és Hozza óra nélkül, egy végső
      // időponttal (pick_up_time) — az adatbázis bontja autókra.
      if (!bookingId && flottaDarab > 0) {
        return await data.createFleetBooking({
          ...input,
          booking_type: f.bookingType === 'VAROS' ? 'LEADOS' : f.bookingType,
          plate_raw: '',
          vehicle_id: null,
          start_time: null,
          drop_off_time: null,
          pick_up_date: null,
          pick_up_time: f.pickUpTime || null,
        }, flottaDarab)
      }

      if (bookingId) {
        await data.updateBooking(bookingId, input)
        await data.setTentative(bookingId, f.tentative)
        return bookingId
      }
      const id = await data.createBooking(input)
      if (f.tentative) await data.setTentative(id, true)
      return id
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setMentes(false)
    }
  }, [data, f, extrakLista, valasztott, bookingId, szerzodeses, flottaDarab])

  return {
    f, set, calc, menthetE, ment, mentes, hiba, setHiba, tolt, szerkesztes, szerzodeses,
    flottas, flottaDarab,
    talalatok, keres, keresMezo, keresoIras, keresoZar,
    valasztott, talalatValaszt, ezcKeri,
    percIdo, // a komponensnek is kell
  }
}
