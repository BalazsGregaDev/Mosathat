import type { StandingCar } from '../../lib/types'

// A napok óta nálunk álló autók (kereskedős munkák). Ezeken jellemzően
// nyitvatartási időn kívül dolgozunk, ezért nem az órasávban a helyük —
// de a szem elől sem szabad elveszniük.

function hatralevo(s: StandingCar): string {
  if (s.days_left === null || s.days_left === undefined) return '—'
  if (s.days_left < 0) return `${Math.abs(s.days_left)} napja lejárt`
  if (s.days_left === 0) return 'ma'
  if (s.days_left === 1) return 'holnap'
  return `${s.days_left} nap`
}

export default function StandingCars({
  lista,
  onMegnyit,
}: {
  lista: StandingCar[]
  onMegnyit: (id: string) => void
}) {
  if (lista.length === 0) return null

  return (
    <div className="panel">
      <h3>
        Nálunk álló autók
        <span className="szam" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {lista.length}
        </span>
      </h3>
      <div>
        {lista.map((s) => (
          <button className="allo" key={s.id} data-surgos={s.urgent} onClick={() => onMegnyit(s.id)}>
            <div style={{ minWidth: 0 }}>
              <div className="rendszam">{s.plate_raw}</div>
              <div className="halk" style={{ fontSize: 'var(--m-xs)' }}>
                {[s.brand, s.model].filter(Boolean).join(' ')}
                {s.company_name && ` · ${s.company_name}`}
              </div>
              <div className="halvany" style={{ fontSize: 'var(--m-xs)' }}>
                {s.package_name} · {s.tasks_done}/{s.tasks_total} kész · {s.days_in}. napja itt
              </div>
            </div>
            <span className="hatra">{hatralevo(s)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
