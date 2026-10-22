const ZONA = 'Europe/Budapest'

export type Nyelv = 'hu' | 'en'

const KATEGORIAK: Record<Nyelv, Record<string, string>> = {
  hu: { SZEMELYAUTO: 'Személyautó', SUV: 'SUV / Egyterű', KISBUSZ: 'Kisbusz / Furgon' },
  en: { SZEMELYAUTO: 'Passenger car', SUV: 'SUV / MPV', KISBUSZ: 'Minibus / Van' },
}

const TERJEDELMEK: Record<Nyelv, Record<string, string>> = {
  hu: { TELJES: 'Teljes', KULSO: 'Csak kívül', BELSO: 'Csak belül' },
  en: { TELJES: 'Inside and out', KULSO: 'Exterior only', BELSO: 'Interior only' },
}

export const KATEGORIA = KATEGORIAK.hu
export const TERJEDELEM = TERJEDELMEK.hu

const LOKAL: Record<Nyelv, string> = { hu: 'hu-HU', en: 'en-GB' }

function formatumok(nyelv: Nyelv) {
  const l = LOKAL[nyelv]
  return {
    nap: new Intl.DateTimeFormat(l, { timeZone: ZONA, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
    rovid: new Intl.DateTimeFormat(l, { timeZone: ZONA, month: 'short', day: 'numeric', weekday: 'long' }),
    ora: new Intl.DateTimeFormat(l, { timeZone: ZONA, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }),
    szam: new Intl.NumberFormat(l),
  }
}

const FORMATUMOK: Record<Nyelv, ReturnType<typeof formatumok>> = { hu: formatumok('hu'), en: formatumok('en') }

const kulcsFormatum = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
})

function delben(nap: string): Date {
  return new Date(`${nap.slice(0, 10)}T12:00:00Z`)
}

export function helyiNap(iso: string): string {
  return kulcsFormatum.format(new Date(iso))
}

export function plusPerc(iso: string, perc: number): string {
  return new Date(new Date(iso).getTime() + perc * 60000).toISOString()
}

export interface Formazo {
  nyelv: Nyelv
  napSzoveg(nap: string): string
  rovidNap(iso: string): string
  ora(iso: string): string
  ft(n: number): string
  idotartam(perc: number): string
  auto(f: { plate_raw: string; brand: string | null; model: string | null }): string
  szolgaltatas(f: {
    package_name: string | null; full_service: boolean; full_service_nev: string | null; scope: string; category: string
  }): string
  idopontSorok(f: {
    service_date: string; booking_type: string; start_at: string | null; drop_off_at: string | null;
    pick_up_at: string | null; planned_duration_minutes: number
  }): [string, string][]
}

export function formazo(nyelv: Nyelv = 'hu'): Formazo {
  const f = FORMATUMOK[nyelv]
  const en = nyelv === 'en'
  const ora = (iso: string) => f.ora.format(new Date(iso))
  const rovidNap = (iso: string) => f.rovid.format(new Date(iso))
  const napSzoveg = (nap: string) => f.nap.format(delben(nap))
  return {
    nyelv,
    napSzoveg,
    rovidNap,
    ora,
    ft: (n) => `${f.szam.format(Math.round(n))} Ft`,
    idotartam(perc) {
      const o = Math.floor(perc / 60)
      const p = perc % 60
      if (en) {
        if (o === 0) return `${p} min`
        if (p === 0) return `${o} h`
        return `${o} h ${p} min`
      }
      if (o === 0) return `${p} perc`
      if (p === 0) return `${o} óra`
      return `${o} óra ${p} perc`
    },
    auto(x) {
      const tipus = [x.brand, x.model].filter(Boolean).join(' ')
      return tipus ? `${x.plate_raw.toUpperCase()} · ${tipus}` : x.plate_raw.toUpperCase()
    },
    szolgaltatas(x) {
      const csomag = x.package_name ?? (en ? 'Custom job' : 'Egyedi munka')
      const fs = x.full_service ? ` + ${x.full_service_nev ?? 'Full Service'}` : ''
      return `${csomag}${fs} · ${TERJEDELMEK[nyelv][x.scope] ?? x.scope} · ${KATEGORIAK[nyelv][x.category] ?? x.category}`
    },
    idopontSorok(x) {
      const sorok: [string, string][] = [[en ? 'Day' : 'Nap', napSzoveg(x.service_date)]]
      if (x.booking_type === 'VAROS' && x.start_at) {
        const vege = plusPerc(x.start_at, x.planned_duration_minutes)
        sorok.push([en ? 'Start' : 'Kezdés', `${ora(x.start_at)} ${en ? '(you wait)' : '(megvárod)'}`])
        sorok.push([en ? 'Expected finish' : 'Várható vége', ora(vege)])
        return sorok
      }
      if (x.drop_off_at) {
        sorok.push(x.booking_type === 'HOZOMVISZEM'
          ? [en ? 'We collect your car' : 'Érte megyünk', ora(x.drop_off_at)]
          : [en ? 'Drop-off' : 'Hozd az autót', ora(x.drop_off_at)])
      }
      if (x.pick_up_at) {
        const masnap = helyiNap(x.pick_up_at) !== x.service_date.slice(0, 10)
        if (x.booking_type === 'HOZOMVISZEM') {
          sorok.push([en ? 'We bring it back' : 'Visszavisszük',
            masnap ? `${rovidNap(x.pick_up_at)}, ${ora(x.pick_up_at)}` : ora(x.pick_up_at)])
        } else {
          sorok.push(masnap
            ? [en ? 'Collection' : 'Elviheted', `${rovidNap(x.pick_up_at)}, ${ora(x.pick_up_at)}`]
            : [en ? 'Ready by' : 'Elkészül', ora(x.pick_up_at)])
        }
      } else {
        sorok.push([en ? 'Ready by' : 'Elkészül', en ? 'the same day, by closing time' : 'aznap, zárásig'])
      }
      return sorok
    },
  }
}

const HU = formazo('hu')

export const napSzoveg = HU.napSzoveg
export const rovidNap = HU.rovidNap
export const ora = HU.ora
export const ft = HU.ft
export const idotartam = HU.idotartam
export const auto = HU.auto
export const szolgaltatas = HU.szolgaltatas
export const idopontSorok = HU.idopontSorok
