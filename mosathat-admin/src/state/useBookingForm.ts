import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from './AppContext'
import { helyiNap, helyiOra, hibaSzoveg } from '../lib/format'
import type {
  BookingScope, BookingType, ContractKind, Quote, SearchHit, VehicleCategory,
} from '../lib/types'
import type { KeresesMezo } from '../data'
import { URES_CEG, type CegErtek } from '../features/common/Ceg'

interface FormState {
  name: string
  phone: string
  plate: string
  ceg: CegErtek
  category: VehicleCategory
  brand: string
  model: string
  contractKind: ContractKind | null
  packageId: string | null
  scope: BookingScope
  fullService: boolean
  extras: Record<string, number>
  bookingType: BookingType
  date: string
  startTime: string
  dropOffTime: string
  pickUpDate: string
  pickUpTime: string
  tentative: boolean
  flottaDarab: number
  notes: string
}

const URES_URLAP: FormState = {
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
  bookingType: 'LEADOS',
  date: '',
  startTime: '09:00',
  dropOffTime: '08:00',
  pickUpDate: '',
  pickUpTime: '',
  tentative: false,
  flottaDarab: 0,
  notes: '',
}

export function useBookingForm(kezdoNap: string, bookingId?: string | null) {
  const { data, catalog } = useApp()

  const startId = useMemo(
    () => catalog?.packages.find((p) => p.code === 'START')?.id
      ?? catalog?.packages.filter((p) => p.active)[0]?.id
      ?? null,
    [catalog],
  )

  const [f, setF] = useState<FormState>({ ...URES_URLAP, date: kezdoNap, packageId: startId })
  const [talalatok, setTalalatok] = useState<SearchHit[]>([])
  const [valasztott, setValasztott] = useState<SearchHit | null>(null)
  const [keresMezo, setKeresMezo] = useState<KeresesMezo | null>(null)
  const [keres, setKeres] = useState(false)
  const [calc, setCalc] = useState<Quote | null>(null)
  const [mentes, setMentes] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [tolt, setTolt] = useState(false)
  const [ugyfelId, setUgyfelId] = useState<string | null>(null)

  const szerkesztes = Boolean(bookingId)

  useEffect(() => {
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

    let el = true
    setTolt(true)
    Promise.all([data.getBookingFormData(bookingId), data.getBooking(bookingId)])
      .then(([d, nap]) => {
        if (!d || !el) return
        const b = d.booking
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
      .catch((e) => { if (el) setHiba(hibaSzoveg(e)) })
      .finally(() => { if (el) setTolt(false) })
    return () => { el = false }
  }, [kezdoNap, bookingId, data, startId])

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => {
      const uj = { ...p, [k]: v }
      if (k === 'date' && uj.pickUpDate && uj.pickUpDate <= uj.date) uj.pickUpDate = ''
      return uj
    })
  }, [])

  const keresSzoveg =
    keresMezo === 'RENDSZAM' ? f.plate : keresMezo === 'NEV' ? f.name : ''

  useEffect(() => {
    const q = keresSzoveg.trim()
    if (szerkesztes || !keresMezo || q.length < 1) {
      setTalalatok([])
      setKeres(false)
      return
    }
    let el = true
    const idozito = window.setTimeout(async () => {
      setKeres(true)
      try {
        const r = await data.searchCustomers(q, 5, keresMezo)
        if (el) setTalalatok(r)
      } catch {
        if (el) setTalalatok([])
      } finally {
        if (el) setKeres(false)
      }
    }, 220)
    return () => {
      el = false
      window.clearTimeout(idozito)
    }
  }, [keresSzoveg, keresMezo, data, szerkesztes])

  const keresoIras = useCallback((mezo: 'RENDSZAM' | 'NEV', ertek: string) => {
    setKeresMezo(mezo)
    setF((p) => (mezo === 'RENDSZAM' ? { ...p, plate: ertek } : { ...p, name: ertek }))
  }, [])

  const keresoZar = useCallback(() => {
    setKeresMezo(null)
    setTalalatok([])
  }, [])

  const talalatValaszt = useCallback((h: SearchHit) => {
    setValasztott(h)
    setTalalatok([])
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

  const ezcKeri = useCallback((packageIdByCode: Record<string, string>) => {
    const kod = valasztott?.utolso_csomag
    if (!kod) return
    const id = packageIdByCode[kod.toUpperCase()]
    if (id) setF((p) => ({ ...p, packageId: id }))
  }, [valasztott])

  const extrakLista = useMemo(
    () => Object.entries(f.extras)
      .filter(([, q]) => q > 0)
      .map(([extra_id, quantity]) => ({ extra_id, quantity })),
    [f.extras],
  )

  const cegNev = f.ceg.nev.trim()
  const [cegNevKesve, setCegNevKesve] = useState(cegNev)
  useEffect(() => {
    const idozito = window.setTimeout(() => setCegNevKesve(cegNev), 250)
    return () => window.clearTimeout(idozito)
  }, [cegNev])

  const arKerdes = useMemo(
    () => ({
      package_id: f.packageId,
      category: f.category,
      scope: f.scope,
      full_service: f.fullService,
      extras: extrakLista,
      surcharge_pct: 0,
      surcharge_fix: 0,
      booking_type: f.bookingType,
      service_date: f.date,
      company_id: f.ceg.id,
      company_name: cegNevKesve || null,
      customer_id: valasztott?.customer_id ?? ugyfelId,
      vehicle_id: valasztott?.vehicle_id ?? null,
      contract_kind: f.contractKind,
    }),
    [f.packageId, f.category, f.scope, f.fullService, extrakLista, f.bookingType, f.date,
     f.ceg.id, cegNevKesve, valasztott, ugyfelId, f.contractKind],
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

  const szerzodeses = Boolean(calc?.contract_id)

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
  const flottaDarab = flottas ? f.flottaDarab : 0

  const menthetE = useMemo(
    () => Boolean(f.packageId)
      && Boolean(f.plate.trim() || f.name.trim() || f.ceg.nev.trim()),
    [f.packageId, f.plate, f.name, f.ceg.nev],
  )

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
        start_time: varos ? f.startTime || '09:00' : null,
        drop_off_time: varos ? null : f.dropOffTime || '08:00',
        pick_up_date: varos ? null : f.pickUpDate || null,
        pick_up_time: varos ? null : f.pickUpTime || null,
        source: 'TELEFON' as const,
        notes: f.notes.trim() || null,
      }

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
      setHiba(hibaSzoveg(e))
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
  }
}
