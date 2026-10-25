import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { CsomagArak, CsomagTartalom, ExtraLista } from './Arlista'
import Szakasz from './Szakasz'

export default function ServicesView() {
  const { catalog: k, refreshCatalog } = useApp()
  const [ful, setFul] = useState<'csomagok' | 'tartalom'>('csomagok')
  const [q, setQ] = useState('')

  useEffect(() => { refreshCatalog().catch(() => {}) }, [refreshCatalog])

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
        </div>
      </div>

      {ful === 'csomagok' && (
        <div className="szolg-szakaszok">
          <CsomagArak k={k} szakaszos />
          <Szakasz nev="egyeb" cim="Egyéb szolgáltatások" mellett={`${k.extras.length} szolgáltatás`}>
            <ExtraLista k={k} q={q} onQ={setQ} />
          </Szakasz>
        </div>
      )}
      {ful === 'tartalom' && <CsomagTartalom k={k} />}
    </div>
  )
}
