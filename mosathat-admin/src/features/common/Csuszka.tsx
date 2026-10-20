export default function Csuszka({ be, cimke, tiltva, dolgozik, onValt }: {
  be: boolean
  cimke: string
  tiltva?: boolean
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
