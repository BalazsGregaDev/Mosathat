const ZONA = 'Europe/Budapest'

export const KATEGORIA: Record<string, string> = {
  SZEMELYAUTO: 'Személyautó',
  SUV: 'SUV / Egyterű',
  KISBUSZ: 'Kisbusz / Furgon',
}

export const TERJEDELEM: Record<string, string> = {
  TELJES: 'Teljes',
  KULSO: 'Csak kívül',
  BELSO: 'Csak belül',
}

const napFormatum = new Intl.DateTimeFormat('hu-HU', {
  timeZone: ZONA, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
})

const rovidNapFormatum = new Intl.DateTimeFormat('hu-HU', {
  timeZone: ZONA, month: 'short', day: 'numeric', weekday: 'long',
})

const oraFormatum = new Intl.DateTimeFormat('hu-HU', {
  timeZone: ZONA, hour: 'numeric', minute: '2-digit',
})

const kulcsFormatum = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
})

function delben(nap: string): Date {
  return new Date(`${nap.slice(0, 10)}T12:00:00Z`)
}

export function napSzoveg(nap: string): string {
  return napFormatum.format(delben(nap))
}

export function rovidNap(iso: string): string {
  return rovidNapFormatum.format(new Date(iso))
}

export function ora(iso: string): string {
  return oraFormatum.format(new Date(iso))
}

export function helyiNap(iso: string): string {
  return kulcsFormatum.format(new Date(iso))
}

export function ft(n: number): string {
  return `${new Intl.NumberFormat('hu-HU').format(Math.round(n))} Ft`
}

export function idotartam(perc: number): string {
  const o = Math.floor(perc / 60)
  const p = perc % 60
  if (o === 0) return `${p} perc`
  if (p === 0) return `${o} óra`
  return `${o} óra ${p} perc`
}

export function plusPerc(iso: string, perc: number): string {
  return new Date(new Date(iso).getTime() + perc * 60000).toISOString()
}

export function auto(f: { plate_raw: string; brand: string | null; model: string | null }): string {
  const tipus = [f.brand, f.model].filter(Boolean).join(' ')
  return tipus ? `${f.plate_raw.toUpperCase()} · ${tipus}` : f.plate_raw.toUpperCase()
}

export function szolgaltatas(f: {
  package_name: string | null; full_service: boolean; full_service_nev: string | null; scope: string; category: string
}): string {
  const csomag = f.package_name ?? 'Egyedi munka'
  const fs = f.full_service ? ` + ${f.full_service_nev ?? 'Full Service'}` : ''
  return `${csomag}${fs} · ${TERJEDELEM[f.scope] ?? f.scope} · ${KATEGORIA[f.category] ?? f.category}`
}

export function idopontSorok(f: {
  service_date: string; booking_type: string; start_at: string | null; drop_off_at: string | null;
  pick_up_at: string | null; planned_duration_minutes: number
}): [string, string][] {
  const sorok: [string, string][] = [['Nap', napSzoveg(f.service_date)]]
  if (f.booking_type === 'VAROS' && f.start_at) {
    const vege = plusPerc(f.start_at, f.planned_duration_minutes)
    sorok.push(['Kezdés', `${ora(f.start_at)} (megvárod)`])
    sorok.push(['Várható vége', ora(vege)])
    return sorok
  }
  if (f.drop_off_at) sorok.push(['Hozd az autót', ora(f.drop_off_at)])
  if (f.pick_up_at) {
    const masnap = helyiNap(f.pick_up_at) !== f.service_date.slice(0, 10)
    sorok.push(masnap
      ? ['Elviheted', `${rovidNap(f.pick_up_at)}, ${ora(f.pick_up_at)}`]
      : ['Elkészül', ora(f.pick_up_at)])
  } else {
    sorok.push(['Elkészül', 'aznap, zárásig'])
  }
  return sorok
}
