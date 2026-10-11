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

export interface SorTetel {
  id: string
  kind: 'BOOKING_CONFIRMED'
  to: string
  lemondas: LemondasAllapot
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
