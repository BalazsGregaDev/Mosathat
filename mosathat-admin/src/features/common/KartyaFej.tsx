// ---------------------------------------------------------------------------
//  Kártyafejléc — rákattintva nyílik ki a többi adat
//
//  Egy autókozmetikában sok ügyfél, sok autó és sok bérlet van. Ha minden
//  kártya tizenkét soros, a lista végiggörgethetetlen, és pont az vész el
//  benne, amit keresel. Csukva ezért csak az van kint, amivel keresni
//  szoktak; a többi egy kattintásra.
//
//  Maga a fejléc a gomb, nem egy kis nyíl a sarkában: vizes kézzel, tableten
//  egy nagy célpont többet ér egy pontos kicsinél.
//
//  Az állapotot nem szín jelzi, hanem a nyíl iránya — így akkor is látszik,
//  ha valaki nem különbözteti meg a színeket.
// ---------------------------------------------------------------------------

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
