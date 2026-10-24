import type { LemondasAllapot } from '../../../supabase/functions/_shared/tipusok.ts'

export interface LemondasValasz extends LemondasAllapot {
  telefon?: string
  uzlet?: string
  hiba?: string
}

function lemondasVegpont(): string | null {
  const alap = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\s+/g, '').replace(/\/+$/, '')
  return alap ? `${alap}/functions/v1/lemondas` : null
}

async function keres(url: string, init?: RequestInit): Promise<LemondasValasz> {
  let valasz: Response
  try {
    valasz = await fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer', ...init })
  } catch {
    throw new Error('Nincs kapcsolat a szerverrel. Ellenőrizd az internetet, és próbáld újra.')
  }
  const adat = await valasz.json().catch(() => null) as LemondasValasz | null
  if (!valasz.ok || !adat) {
    throw new Error(adat?.hiba ?? 'Átmeneti hiba történt, kérjük, próbáld újra pár perc múlva.')
  }
  return adat
}

export function lemondasLekerdezes(token: string): Promise<LemondasValasz> {
  const vegpont = lemondasVegpont()
  if (!vegpont) return Promise.reject(new Error('A lemondás csak éles módban működik (hiányzik a VITE_SUPABASE_URL).'))
  return keres(`${vegpont}?t=${encodeURIComponent(token)}`)
}

export function lemondasVegrehajtas(token: string): Promise<LemondasValasz> {
  const vegpont = lemondasVegpont()
  if (!vegpont) return Promise.reject(new Error('A lemondás csak éles módban működik (hiányzik a VITE_SUPABASE_URL).'))
  return keres(vegpont, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: token }),
  })
}
