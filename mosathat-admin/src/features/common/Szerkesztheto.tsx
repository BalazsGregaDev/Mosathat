import { useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
//  Helyben szerkeszthető adat
//
//  Rákattintok az értékre, átírom, Enter. Nincs külön szerkesztő ablak,
//  nincs Mentés gomb, nincs „biztos?".
//
//  Három szabály tartja használhatóan:
//
//  1. **Escape visszavon.** Enélkül a véletlen kattintás után nem lehet
//     kilépni anélkül, hogy valamit elrontanánk.
//  2. **A mentés a kilépéskor történik** (blur vagy Enter). Minden
//     billentyűleütés után menteni annyi kérést jelentene, hogy a lassú
//     hálózaton összekeverednének a válaszok.
//  3. **Ha a mentés hibára fut, a mező NYITVA marad** a beírt értékkel.
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
  zarolt,
  ures = '—',
  utotag,
  sor,
}: {
  cimke: string
  /** A megjelenített és szerkesztett érték. Üres is lehet. */
  ertek: string | null | undefined
  onMent: (uj: string) => Promise<void>
  tipus?: Tipus
  /** Ha meg van adva, legördülő lesz belőle beviteli mező helyett. */
  valaszthato?: Valaszthato[]
  /** Lezárt foglalásnál nem szerkeszthető — ilyenkor csak szöveg. */
  zarolt?: boolean
  /** Mi álljon ott, ha üres az érték. */
  ures?: string
  /** Az érték után álló halk kiegészítés (pl. „· 2 óra"). */
  utotag?: React.ReactNode
  /** Több soros szöveg (megjegyzés). */
  sor?: number
}) {
  const [nyitva, setNyitva] = useState(false)
  const [piszkozat, setPiszkozat] = useState('')
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const mezo = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (nyitva) mezo.current?.focus()
  }, [nyitva])

  function nyit() {
    if (zarolt || megy) return
    setPiszkozat(ertek ?? '')
    setHiba(null)
    setNyitva(true)
  }

  async function ment() {
    const uj = piszkozat.trim()
    if (uj === (ertek ?? '').trim()) { setNyitva(false); return }
    setMegy(true)
    try {
      await onMent(uj)
      setNyitva(false)
      setHiba(null)
    } catch (e) {
      // Nyitva marad a beírt értékkel — így nem vész el, amit begépelt.
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMegy(false)
    }
  }

  function billentyu(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); setNyitva(false); setHiba(null) }
    if (e.key === 'Enter' && !sor) { e.preventDefault(); void ment() }
  }

  if (!nyitva) {
    const uresE = !ertek || ertek.trim() === ''
    // Legördülőnél a tárolt érték egy kód vagy azonosító ("SZEMELYAUTO", egy
    // uuid). Megjeleníteni azt kell, amit a felhasználó választott volna:
    // a feliratot. Enélkül az adatlapon nyers adatbázisérték látszana.
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
    className: 'beviteli',
    value: piszkozat,
    disabled: megy,
    onKeyDown: billentyu,
    onBlur: () => void ment(),
    'aria-label': cimke,
  }

  return (
    <div className="adatsor szerk-sor szerk-nyitva">
      <span className="szerk-cimke">{cimke}</span>
      <span className="ertek">
        {valaszthato ? (
          <select {...kozos}
                  onChange={(e) => setPiszkozat(e.target.value)}
                  onBlur={undefined}>
            {valaszthato.map((v) => (
              <option key={v.ertek} value={v.ertek}>{v.cimke}</option>
            ))}
          </select>
        ) : sor ? (
          <textarea {...kozos} rows={sor}
                    onChange={(e) => setPiszkozat(e.target.value)} />
        ) : (
          <input {...kozos}
                 type={TIPUS_INPUT[tipus]}
                 inputMode={TIPUS_MODE[tipus]}
                 className={`beviteli${tipus === 'rendszam' ? ' beviteli-rendszam' : ''}`}
                 onChange={(e) => setPiszkozat(e.target.value)} />
        )}

        {/* A legördülőnél a blur nem jó mentési pont: a lenyitás maga is
            elveszi a fókuszt. Ezért ott külön gomb zárja le. */}
        {valaszthato && (
          <button className="btn btn-kicsi" disabled={megy}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void ment()}>
            {megy ? '…' : 'Kész'}
          </button>
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
