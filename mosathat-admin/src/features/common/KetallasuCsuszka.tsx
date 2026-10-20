export default function KetallasuCsuszka({ bal, jobb, jobbra, cimke, onValt }: {
  bal: string
  jobb: string
  jobbra: boolean
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
