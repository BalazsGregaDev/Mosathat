export default function KartyaFej({ nyitva, onValt, children }: {
  nyitva: boolean
  onValt: () => void
  children: React.ReactNode
}) {
  return (
    <h3 className="kartya-fej">
      <button type="button" className="kartya-nyito" aria-expanded={nyitva} onClick={onValt}>
        <span className="cim">{children}</span>
        <span className="nyil" aria-hidden="true">›</span>
        <span className="csakolvaso">
          {nyitva ? 'további adatok elrejtése' : 'további adatok megjelenítése'}
        </span>
      </button>
    </h3>
  )
}
