// ---------------------------------------------------------------------------
//  Kétállású csúszka: bal oldali szó — csúszka — jobb oldali szó
//
//  Nem be/ki kapcsoló, hanem két egyenrangú állás közti váltás (pl. Bruttó /
//  Nettó). Ezért a sáv mindig színes (egyik állás sem „kikapcsolt"), és a két
//  szó közül az éppen érvényes vastag. Bárhová kattintva a másikra vált.
//
//  A képernyőolvasónak: kapcsoló (switch), ami akkor „be", ha a JOBB oldali
//  állás érvényes — a cimke ezt mondja el (pl. „Nettó árak megadása").
// ---------------------------------------------------------------------------

export default function KetallasuCsuszka({ bal, jobb, jobbra, cimke, onValt }: {
  /** A bal oldali állás neve (pl. „Bruttó"). */
  bal: string
  /** A jobb oldali állás neve (pl. „Nettó"). */
  jobb: string
  /** A jobb oldali állás érvényes-e most. */
  jobbra: boolean
  /** Mit kapcsol — a képernyőolvasó ezt mondja ki. */
  cimke: string
  onValt: (jobbra: boolean) => void
}) {
  return (
    <button
      type="button"
      className="csuszka ketallasu"
      role="switch"
      aria-checked={jobbra}
      aria-label={cimke}
      data-be={jobbra || undefined}
      onClick={() => onValt(!jobbra)}
    >
      <span className="oldal" data-aktiv={!jobbra}>{bal}</span>
      <span className="csuszka-sav" aria-hidden="true"><span className="csuszka-fej" /></span>
      <span className="oldal" data-aktiv={jobbra}>{jobb}</span>
    </button>
  )
}
