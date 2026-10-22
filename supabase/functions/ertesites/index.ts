import { aktivDolgozo, cors, json, kell, lehet, szerverKliens, uzlet } from '../_shared/kornyezet.ts'
import { resendKuldes } from '../_shared/resend.ts'
import { sorFeldolgozas } from '../_shared/sor.ts'
import type { SorTetel, Uzlet } from '../_shared/tipusok.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

async function uzletAdatai(db: SupabaseClient): Promise<Uzlet> {
  const alap = uzlet()
  const { data } = await db.from('publikus_adatok').select('nev, telefon, irsz, cim, haz').maybeSingle()
  const ertek = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const cim = [ertek(data?.irsz), ertek(data?.cim)].filter(Boolean).join(', ')
  const haz = ertek(data?.haz)
  return {
    nev: ertek(data?.nev) ?? alap.nev,
    telefon: ertek(data?.telefon) ?? alap.telefon,
    cim: cim ? (haz ? `${cim} (${haz})` : cim) : alap.cim,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() })
  if (req.method !== 'POST') return json({ hiba: 'Csak POST kérés.' }, 405)

  try {
    const db = szerverKliens()
    if (!(await aktivDolgozo(db, req.headers.get('Authorization')))) {
      return json({ hiba: 'Ehhez be kell jelentkezni.' }, 403)
    }
    const resend = {
      kulcs: kell('RESEND_API_KEY'),
      felado: kell('EMAIL_FELADO'),
      valaszCim: lehet('EMAIL_VALASZ'),
    }
    const eredmeny = await sorFeldolgozas({
      async atvesz() {
        const { data, error } = await db.rpc('ertesitesek_atvetele', { p_limit: 20 })
        if (error) throw new Error(error.message)
        return (data ?? []) as SorTetel[]
      },
      async eredmeny(id, ok, szolgaltatoId, hiba) {
        const { error } = await db.rpc('ertesites_eredmeny', {
          p_id: id, p_ok: ok, p_provider_id: szolgaltatoId, p_hiba: hiba,
        })
        if (error) throw new Error(error.message)
      },
      kuld: (level) => resendKuldes(resend, level),
      oldalAlap: kell('LEMONDAS_URL'),
      uzlet: await uzletAdatai(db),
    })
    return json(eredmeny)
  } catch (e) {
    return json({ hiba: e instanceof Error ? e.message : String(e) }, 500)
  }
})
