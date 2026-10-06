import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
//  Lejárt belépés („JWT expired") — egy csendes újrapróbálás
//
//  A belépés tokenje egy óráig érvényes. A Supabase kliense lejárat előtt
//  magától cserél — de csak ha fut. Ha a tablet aludt, vagy a böngésző a
//  háttérbe tette a lapot, ez a csere elmaradhat, és az első kérés ébredés
//  után „JWT expired" hibával jön vissza. Ugyanez történik, ha a tablet órája
//  pár percet késik: a kliens még érvényesnek hiszi a tokent, a szerver már
//  nem.
//
//  Ezt a felhasználó eddig úgy oldotta meg, hogy frissítette az oldalt.
//  Most a kliens teszi meg helyette:
//
//      kérés → 401 „JWT expired" → új token kérése → UGYANAZ a kérés újra
//
//  Csak egyszer próbál újra. Ha az új token sem jó (pl. a belépés napok óta
//  lejárt), a hiba megy tovább, és újra be kell lépni.
//
//  A Supabase belépési végpontjait (/auth/v1/) nem érinti: azoknak a 401
//  mást jelent (rossz jelszó), és a tokencsere maga is ott fut.
// ---------------------------------------------------------------------------

export function tokenFetch(kliens: () => SupabaseClient): typeof fetch {
  // Ha egyszerre több kérés fut bele a lejárt tokenbe (a napi nézet öt
  // kérést indít egyszerre), csak EGY tokencsere menjen.
  let folyamatban: Promise<string | null> | null = null
  const ujToken = () => {
    folyamatban ??= kliens().auth.refreshSession()
      .then(({ data }) => data.session?.access_token ?? null)
      .catch(() => null)
      .finally(() => { setTimeout(() => { folyamatban = null }, 1000) })
    return folyamatban
  }

  return async (input, init) => {
    const valasz = await fetch(input, init)
    if (valasz.status !== 401) return valasz

    const cim = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (cim.includes('/auth/v1/')) return valasz

    // Tényleg a token a baj? (A PostgREST „JWT expired"-et ír, kódja PGRST301/303.)
    const szoveg = await valasz.clone().text().catch(() => '')
    if (!/jwt|PGRST30/i.test(szoveg)) return valasz

    const token = await ujToken()
    if (!token) return valasz

    const fejlec = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    fejlec.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers: fejlec })
  }
}
