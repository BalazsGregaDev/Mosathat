import type { StaffRow } from '../../lib/types'

export default function KinekValaszto({ id, ertek, dolgozok, sajatId, onValt }: {
  id: string
  ertek: string | null
  dolgozok: StaffRow[]
  sajatId: string
  onValt: (staffId: string | null) => void
}) {
  return (
    <div className="mezo">
      <label htmlFor={id}>Kinek</label>
      <select id={id} className="beviteli" value={ertek ?? ''}
              onChange={(e) => onValt(e.target.value || null)}>
        <option value="">Nekem</option>
        {dolgozok.filter((d) => d.id !== sajatId).map((d) => (
          <option key={d.id!} value={d.id!}>{d.full_name}</option>
        ))}
      </select>
    </div>
  )
}
