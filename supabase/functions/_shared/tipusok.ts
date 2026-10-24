export type Allapot = 'LEMONDHATO' | 'LEJART' | 'LEMONDVA' | 'NEM_LEMONDHATO' | 'ISMERETLEN'

export interface Foglalas {
  id: string
  service_date: string
  booking_type: 'VAROS' | 'LEADOS' | 'TOBBNAPOS' | 'HOZOMVISZEM'
  status: string
  start_at: string | null
  drop_off_at: string | null
  pick_up_at: string | null
  planned_duration_minutes: number
  scope: 'TELJES' | 'KULSO' | 'BELSO'
  full_service: boolean
  full_service_nev: string | null
  estimated_price_huf: number | null
  berlet?: boolean
  notes: string | null
  customer_name: string
  plate_raw: string
  brand: string | null
  model: string | null
  category: 'SZEMELYAUTO' | 'SUV' | 'KISBUSZ'
  package_name: string | null
  extras_summary: string | null
}

export interface LemondasAllapot {
  allapot: Allapot
  statusz?: string
  kezdes?: string
  hatarido?: string
  lemondas_ora?: number
  lemondva?: string | null
  most_mondta_le?: boolean
  foglalas?: Foglalas
}

export type OldalAllapot =
  | 'KERES' | 'VISSZAIGAZOLVA' | 'KESZ' | 'ATVEVE' | 'NEM_FERT_BE'
  | 'LEMONDVA' | 'ELUTASITVA' | 'NEM_JOTT' | 'LEJART' | 'ISMERETLEN'

export interface FoglalasKep {
  nap: string
  tipus: 'VAROS' | 'LEADOS' | 'HOZOMVISZEM'
  kezdes: string | null
  hozas: string | null
  kesz: string | null
  elvitel_nap: string | null
  elvitel: string | null
  csomag: string | null
  csomag_en: string | null
  full_service: boolean
  terjedelem: 'TELJES' | 'KULSO' | 'BELSO'
  kategoria: 'SZEMELYAUTO' | 'SUV' | 'KISBUSZ'
  extrak: { nev: string; nev_en: string; db: number }[]
  rendszam: string
  marka: string | null
  modell: string | null
  ar?: number | null
  berlet?: boolean
}

export interface ModositasiKerelem {
  uzenet: string
  mikor: string
  elintezve: string | null
}

export interface FoglalasomAdat {
  allapot: OldalAllapot
  nyelv?: 'hu' | 'en'
  nev?: string
  ceges?: boolean
  most?: FoglalasKep
  eredeti?: FoglalasKep
  ar?: {
    becsult: number | null
    vegleges: number | null
    felar_indok: string | null
    kimaradt: string | null
    kimaradt_huf: number | null
    berlet?: boolean
  } | null
  kesz_ig?: string | null
  atveve?: string | null
  lejar?: string | null
  lemondhato?: boolean
  lemondas_hatarido?: string | null
  modosithato?: boolean
  nyitott_kerelem?: number
  kerelmek?: ModositasiKerelem[]
}

export interface SorTetel {
  id: string
  kind: 'BOOKING_CONFIRMED' | 'CAR_READY'
  to: string
  link: string | null
  nyelv: 'hu' | 'en'
  lemondas: LemondasAllapot
  oldal: FoglalasomAdat
}

export interface Uzlet {
  nev: string
  telefon: string
  cim: string | null
}

export interface Level {
  cimzett: string
  targy: string
  html: string
  szoveg: string
}

export interface KuldesEredmeny {
  kuldve: number
  hibas: number
  hibak: string[]
}
