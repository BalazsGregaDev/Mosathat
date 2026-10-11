import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import type { Uzlet } from './tipusok.ts'

export function kell(nev: string): string {
  const v = Deno.env.get(nev)?.trim()
  if (!v) throw new Error(`Hiányzik a(z) ${nev} beállítás (supabase secrets set ${nev}=...).`)
  return v
}

export function lehet(nev: string, alap: string | null = null): string | null {
  const v = Deno.env.get(nev)?.trim()
  return v ? v : alap
}

export function uzlet(): Uzlet {
  return {
    nev: lehet('UZLET_NEV', 'Mosathat')!,
    telefon: lehet('UZLET_TELEFON', '+36 1 506 0420')!,
    cim: lehet('UZLET_CIM'),
  }
}

export function szerverKliens(): SupabaseClient {
  return createClient(kell('SUPABASE_URL'), kell('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function aktivDolgozo(db: SupabaseClient, authorization: string | null): Promise<boolean> {
  const jwt = (authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return false
  const { data: belepes } = await db.auth.getUser(jwt)
  if (!belepes.user) return false
  const { data: dolgozo } = await db.from('staff').select('active').eq('id', belepes.user.id).maybeSingle()
  return dolgozo?.active === true
}

export function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': lehet('ENGEDETT_ORIGIN', '*')!,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
}

export function json(adat: unknown, statusz = 200): Response {
  return new Response(JSON.stringify(adat), {
    status: statusz,
    headers: {
      ...cors(),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
