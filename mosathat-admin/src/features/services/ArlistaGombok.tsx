export type ArlistaFul = 'csomagok' | 'extrak'

export default function ArlistaGombok({ ertek, onValt, rovid }: {
  ertek: ArlistaFul | null
  onValt: (f: ArlistaFul | null) => void
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
          onClick={() => onValt(ertek === id ? null : id)}
        >
          {cimke}
        </button>
      ))}
    </div>
  )
}
