import { useCallback, useEffect, useRef, useState } from 'react'

import { billentyuzetTakarit } from '../../lib/billentyuzet'

// ---------------------------------------------------------------------------
//  Helyben szerkeszthető adat
//
//  Rákattintok az értékre, átírom, Enter. Nincs külön szerkesztő ablak,
//  nincs Mentés gomb, nincs „biztos?".
//
//  Négy szabály tartja használhatóan:
//
//  1. **Escape visszavon.** Enélkül a véletlen kattintás után nem lehet
//     kilépni anélkül, hogy valamit elrontanánk.
//  2. **A mellé kattintás ment.** Nem csak a mezőből kilépés: bárhova
//     kattintok a mezőn kívül, a beírt érték elmegy. Ez azért kell külön,
//     mert a foglalási ablak a háttérre kattintásra bezárul — és a bezárás
//     hamarabb futna le, mint a mező mentése. Így a mentés indul előbb.
//  3. **A választható értékek gombok, nem legördülő lista.** Egy legördülő
//     három kattintás (nyit, választ, zár), a gomb egy. Telefonálás közben
//     ez a különbség érezhető.
//
//     Hogy a gombsor rögtön látszik-e, az a képernyőtől függ. Egy megnyitott
//     foglalásnál igen (`gombok`): ott négy ilyen sor van, és számít a
//     másodperc. Egy harminc autós listában nem: ott ugyanez háromszor
//     harminc gomb lenne, és az már nem gyorsabb, csak zajosabb — ott a
//     gombsor a kattintásra jelenik meg.
//  4. **Ha a mentés hibára fut, a mező NYITVA marad** a beírt értékkel.
//     A legrosszabb, amit tehetne: bezárul, visszaáll a régi érték, és
//     valahol megjelenik egy piros felirat, amit senki nem néz meg.
//
//  Ami nem változott, azt el sem küldjük: a felesleges mentés
//  újraszámoltatná az árat és az időt.
// ---------------------------------------------------------------------------

type Tipus = 'szoveg' | 'telefon' | 'email' | 'szam' | 'ido' | 'datum' | 'rendszam'

export interface Valaszthato {
  ertek: string
  cimke: string
}

export default function Szerkesztheto({
  cimke,
  ertek,
  onMent,
  tipus = 'szoveg',
  valaszthato,
  gombok,
  zarolt,
  ures = '—',
  utotag,
  sor,
  kezdetbenNyitva,
}: {
  cimke: string
  /** A megjelenített és szerkesztett érték. Üres is lehet. */
  ertek: string | null | undefined
  onMent: (uj: string) => Promise<void>
  tipus?: Tipus
  /** Ha meg van adva, gombsor lesz belőle beviteli mező helyett. */
  valaszthato?: Valaszthato[]
  /** A gombsor rögtön látszik, nem kattintásra nyílik. Egy megnyitott
   *  foglalásnál igen, egy hosszú listában nem. */
  gombok?: boolean
  /** Lezárt foglalásnál nem szerkeszthető — ilyenkor csak szöveg. */
  zarolt?: boolean
  /** Mi álljon ott, ha üres az érték. */
  ures?: string
  /** Az érték után álló halk kiegészítés (pl. „· 2 óra"). */
  utotag?: React.ReactNode
  /** Több soros szöveg (megjegyzés). */
  sor?: number
  /**
   * Szerkesztésre nyitva jelenik meg, a meglévő érték kijelölve. A „Figyelmet
   * igényel" listából jövet: „nincs telefonszám" → a mezőbe rögtön írni lehet.
   */
  kezdetbenNyitva?: boolean
}) {
  const [nyitva, setNyitva] = useState(Boolean(kezdetbenNyitva && !zarolt))
  const [piszkozat, setPiszkozat] = useState(kezdetbenNyitva ? (ertek ?? '') : '')
  // Csak az első, kívülről kért nyitásnál jelöljük ki a szöveget: ha később
  // valaki rákattint, ott tartja a kurzort, ahová bökött.
  const kijelol = useRef(Boolean(kezdetbenNyitva))
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const mezo = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const doboz = useRef<HTMLDivElement>(null)
  // A piszkozat friss értéke a dokumentumszintű figyelőnek: az a függvény
  // egyszer jön létre, a beírt szöveg viszont minden leütésnél változik.
  const friss = useRef('')

  useEffect(() => { friss.current = piszkozat }, [piszkozat])
  useEffect(() => {
    if (!nyitva) return
    mezo.current?.focus()
    if (kijelol.current) {
      kijelol.current = false
      mezo.current?.select()
      // A telefon billentyűzete már az ideiglenes mezőn fent van (lásd
      // billentyuzet.ts) — most, hogy a valódi mezőé a fókusz, az eltűnhet.
      billentyuzetTakarit()
    }
  }, [nyitva])

  function nyit() {
    if (zarolt || megy) return
    setPiszkozat(ertek ?? '')
    setHiba(null)
    setNyitva(true)
  }

  const ment = useCallback(async (uj: string) => {
    const v = uj.trim()
    if (v === (ertek ?? '').trim()) { setNyitva(false); return }
    setMegy(true)
    try {
      await onMent(v)
      setNyitva(false)
      setHiba(null)
    } catch (e) {
      // Nyitva marad a beírt értékkel — így nem vész el, amit begépelt.
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMegy(false)
    }
  }, [ertek, onMent])

  // Mentés a mezőn kívüli kattintásra. A pointerdown a legkorábbi esemény,
  // ami a kattintásból keletkezik — hamarabb fut le, mint a foglalási ablak
  // háttérre-kattintás kezelője, így a mentés akkor is elindul, ha az ablak
  // közben bezárul.
  // A beírt szöveget a mezőből kilépés menti (onBlur) — ez a böngésző saját
  // működése, és mindig helyes. A gombsor viszont nem kap fókuszt, azt
  // külön be kell csukni, ha valaki mellé kattint.
  useEffect(() => {
    if (!nyitva || !valaszthato) return
    const kint = (ev: PointerEvent) => {
      if (doboz.current?.contains(ev.target as Node)) return
      setNyitva(false)   // a választás maga a mentés — itt nincs mit menteni
    }
    document.addEventListener('pointerdown', kint, true)
    return () => document.removeEventListener('pointerdown', kint, true)
  }, [nyitva, valaszthato])

  function billentyu(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); setNyitva(false); setHiba(null) }
    if (e.key === 'Enter' && !sor) { e.preventDefault(); void ment(piszkozat) }
  }

  // --- választható értékek: gombsor, egy kattintás ---------------------------
  if (valaszthato && !zarolt && (gombok || nyitva)) {
    return (
      <div className={`adatsor szerk-sor valaszto-sor${nyitva ? ' szerk-nyilt' : ''}`}
           ref={doboz}>
        <span className="szerk-cimke">{cimke}</span>
        <span className="ertek">
          <div className="ertek-gombok">
            {valaszthato.map((v) => (
              <button
                key={v.ertek}
                type="button"
                className={v.ertek === (ertek ?? '') ? 'aktiv' : ''}
                aria-pressed={v.ertek === (ertek ?? '')}
                disabled={megy}
                onClick={() => { setNyitva(false); void ment(v.ertek) }}
              >
                {v.cimke}
              </button>
            ))}
          </div>
          {hiba && <div className="szerk-hiba">{hiba}</div>}
        </span>
      </div>
    )
  }

  if (!nyitva) {
    const uresE = !ertek || ertek.trim() === ''
    const mutat = valaszthato
      ? (valaszthato.find((v) => v.ertek === (ertek ?? ''))?.cimke ?? ures)
      : (uresE ? ures : ertek)
    const halvanyE = uresE || (valaszthato && mutat === ures)

    return (
      <div className="adatsor szerk-sor">
        <span className="szerk-cimke">{cimke}</span>
        <span className="ertek">
          {zarolt ? (
            <span className={halvanyE ? 'halvany' : undefined}>{mutat}</span>
          ) : (
            <button type="button" className={`szerk-ertek${halvanyE ? ' ures' : ''}`}
                    onClick={nyit} title="Kattints az átíráshoz">
              {mutat}
            </button>
          )}
          {utotag}
        </span>
      </div>
    )
  }

  const kozos = {
    ref: mezo as never,
    value: piszkozat,
    disabled: megy,
    onKeyDown: billentyu,
    onBlur: () => void ment(piszkozat),
    'aria-label': cimke,
  }

  return (
    <div className="adatsor szerk-sor szerk-nyitva" ref={doboz}>
      <span className="szerk-cimke">{cimke}</span>
      <span className="ertek">
        {sor ? (
          <textarea {...kozos} className="beviteli" rows={sor}
                    onChange={(e) => setPiszkozat(e.target.value)} />
        ) : (
          <input {...kozos}
                 type={TIPUS_INPUT[tipus]}
                 inputMode={TIPUS_MODE[tipus]}
                 className={`beviteli${tipus === 'rendszam' ? ' beviteli-rendszam' : ''}`}
                 onChange={(e) => setPiszkozat(e.target.value)} />
        )}
        {hiba && <div className="szerk-hiba">{hiba}</div>}
      </span>
    </div>
  )
}

const TIPUS_INPUT: Record<Tipus, string> = {
  szoveg: 'text', telefon: 'tel', email: 'email', szam: 'number',
  ido: 'time', datum: 'date', rendszam: 'text',
}

const TIPUS_MODE: Record<Tipus, 'text' | 'tel' | 'email' | 'numeric'> = {
  szoveg: 'text', telefon: 'tel', email: 'email', szam: 'numeric',
  ido: 'text', datum: 'text', rendszam: 'text',
}
