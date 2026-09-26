// ---------------------------------------------------------------------------
//  Az árlistát nyitó gombok
//
//  Három helyen kellenek: az Időpontok fejlécében, a megnyitott munkalap
//  tetején, és az új időpont ablakának a tetején. Mindhárom ugyanaz az
//  állapot — ha külön lennének megírva, előbb-utóbb az egyik máshova
//  mutatna, vagy nem látszana rajta, hogy éppen nyitva van.
//
//  Miért kell a foglalási ablakokba is: amikor az ablak nyitva van, a
//  mögötte lévő fejléc nem kattintható — pont akkor nem, amikor a legjobban
//  kell. Az ügyfél a telefonban akkor kérdez rá az árra, amikor már félig
//  kitöltötted a foglalást.
// ---------------------------------------------------------------------------

export type ArlistaFul = 'csomagok' | 'extrak'

export default function ArlistaGombok({ ertek, onValt, rovid }: {
  ertek: ArlistaFul | null
  onValt: (f: ArlistaFul | null) => void
  /** Szűk helyen (ablakfejlécben) rövidebb felirat. */
  rovid?: boolean
}) {
  const gombok: [ArlistaFul, string][] = rovid
    ? [['csomagok', 'Csomagok'], ['extrak', 'Egyéb']]
    : [['csomagok', 'Csomagok'], ['extrak', 'Egyéb szolgáltatások']]

  return (
    <div className={`arlista-gombok${rovid ? ' rovid' : ''}`}>
      {gombok.map(([id, cimke]) => (
        <button
          key={id}
          type="button"
          className={ertek === id ? 'aktiv' : ''}
          aria-pressed={ertek === id}
          // Ugyanaz a gomb be is zárja: telefonálás közben az egér amúgy is
          // ott van, nem kell az X-hez visszamenni.
          onClick={() => onValt(ertek === id ? null : id)}
        >
          {cimke}
        </button>
      ))}
    </div>
  )
}
