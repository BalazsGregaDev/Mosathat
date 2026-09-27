import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import type { Catalog } from '../../data'
import { CsomagArak, CsomagTartalom, ExtraLista } from './Arlista'

// ---------------------------------------------------------------------------
//  Szolgáltatások — alkalmazotti nézet
//
//  Ez nem a szerkesztő képernyő letiltott gombokkal. Az árakat az alkalmazott
//  nem állítja, tehát nincs miért ott lennie a harminc beviteli mezőnek, még
//  szürkén sem: a szürke gomb csak azt üzeni, hogy „ezt elronthattad volna".
//
//  Ami helyette van: árlista. Pontosan az, amit telefon közben meg kell
//  nézni — mennyibe kerül és mennyi ideig tart. Ugyanez a tartalom nyílik
//  fel a foglalás mellé a lebegő ablakban is (lásd ArlistaPanel).
// ---------------------------------------------------------------------------

export default function ServicesView() {
  const { data, catalog } = useApp()
  const [k, setK] = useState<Catalog | null>(catalog)
  const [ful, setFul] = useState<'csomagok' | 'tartalom' | 'extrak'>('csomagok')
  const [q, setQ] = useState('')

  useEffect(() => { data.getCatalog().then(setK) }, [data])

  if (!k) return <div className="betolt">Betöltés…</div>

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Szolgáltatások</h2>
        <div className="fulek">
          <button className={ful === 'csomagok' ? 'aktiv' : ''} onClick={() => setFul('csomagok')}>
            Csomagok és árak
          </button>
          <button className={ful === 'tartalom' ? 'aktiv' : ''} onClick={() => setFul('tartalom')}>
            Mi van bennük?
          </button>
          <button className={ful === 'extrak' ? 'aktiv' : ''} onClick={() => setFul('extrak')}>
            Egyéb szolgáltatások
          </button>
        </div>
      </div>

      {ful === 'csomagok' && <CsomagArak k={k} />}
      {ful === 'tartalom' && <CsomagTartalom k={k} />}
      {ful === 'extrak'   && <ExtraLista k={k} q={q} onQ={setQ} />}
    </div>
  )
}
