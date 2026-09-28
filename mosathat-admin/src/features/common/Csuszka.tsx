// ---------------------------------------------------------------------------
//  Be/Ki csúszka
//
//  Miért nem sima checkbox: itt a kapcsoló AZONNAL hat — nincs alatta „Mentés"
//  gomb. A csúszka ezt mondja el formájával, a pipa nem: a pipánál a szem
//  űrlapot keres, amit még el kell küldeni.
//
//  A szó („Be" / „Ki") azért van kiírva a csúszka mellé, mert csak a
//  gomb helyzetéből olvasni az állapotot egy táblázat sorában bizonytalan —
//  és színvakság mellett a zöld/szürke különbség kevés.
// ---------------------------------------------------------------------------

export default function Csuszka({ be, cimke, tiltva, dolgozik, onValt }: {
  be: boolean
  /** Mit kapcsol — a képernyőolvasó ezt mondja ki. */
  cimke: string
  tiltva?: boolean
  /** Amíg a mentés tart: nem kattintható, de nem is „tiltott" kinézetű. */
  dolgozik?: boolean
  onValt: (uj: boolean) => void
}) {
  return (
    <button
      type="button"
      className="csuszka"
      role="switch"
      aria-checked={be}
      aria-label={cimke}
      data-be={be || undefined}
      disabled={tiltva || dolgozik}
      onClick={() => onValt(!be)}
    >
      <span className="csuszka-sav" aria-hidden="true"><span className="csuszka-fej" /></span>
      <span className="csuszka-szo">{be ? 'Be' : 'Ki'}</span>
    </button>
  )
}
