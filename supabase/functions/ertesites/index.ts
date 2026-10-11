import { aktivDolgozo, cors, json, kell, lehet, szerverKliens, uzlet } from '../_shared/kornyezet.ts'
import { resendKuldes } from '../_shared/resend.ts'
import { sorFeldolgozas } from '../_shared/sor.ts'
import { ujToken } from '../_shared/token.ts'
import type { SorTetel } from '../_shared/tipusok.ts'

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
      async linkMentes(foglalasId, token) {
        const { error } = await db.rpc('lemondo_link_mentes', { p_booking: foglalasId, p_token: token })
        if (error) throw new Error(error.message)
      },
      async eredmeny(id, ok, szolgaltatoId, hiba) {
        const { error } = await db.rpc('ertesites_eredmeny', {
          p_id: id, p_ok: ok, p_provider_id: szolgaltatoId, p_hiba: hiba,
        })
        if (error) throw new Error(error.message)
      },
      kuld: (level) => resendKuldes(resend, level),
      ujToken,
      lemondasAlap: kell('LEMONDAS_URL'),
      uzlet: uzlet(),
    })
    return json(eredmeny)
  } catch (e) {
    return json({ hiba: e instanceof Error ? e.message : String(e) }, 500)
  }
})
