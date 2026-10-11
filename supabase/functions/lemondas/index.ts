import { cors, json, szerverKliens, uzlet } from '../_shared/kornyezet.ts'
import { TOKEN_MINTA } from '../_shared/token.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ hiba: 'Nem támogatott kérés.' }, 405)

  const token = req.method === 'GET'
    ? new URL(req.url).searchParams.get('t')
    : ((await req.json().catch(() => ({}))) as { t?: string }).t ?? null

  const u = uzlet()
  const kiegeszites = { telefon: u.telefon, uzlet: u.nev }

  if (!token || !TOKEN_MINTA.test(token)) {
    return json({ allapot: 'ISMERETLEN', ...kiegeszites })
  }

  try {
    const fuggveny = req.method === 'POST' ? 'lemondas_vegrehajt' : 'lemondas_allapot'
    const { data, error } = await szerverKliens().rpc(fuggveny, { p_token: token })
    if (error) throw new Error(error.message)
    return json({ ...(data as Record<string, unknown>), ...kiegeszites })
  } catch (e) {
    console.error('lemondas', e)
    return json({ hiba: 'Átmeneti hiba történt, kérjük, próbáld újra pár perc múlva.', ...kiegeszites }, 500)
  }
})
