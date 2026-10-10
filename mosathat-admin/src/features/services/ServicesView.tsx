import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { useSzeles } from '../../state/useSzeles'
import { CsomagArak, CsomagTartalom, ExtraLista } from './Arlista'

export const KETTO_PX = 1180

export default function ServicesView() {
  const { catalog: k, refreshCatalog } = useApp()
  const [ful, setFul] = useState<'csomagok' | 'tartalom' | 'extrak'>('csomagok')
  const [q, setQ] = useState('')
  const szeles = useSzeles(KETTO_PX)

  useEffect(() => { refreshCatalog().catch(() => {}) }, [refreshCatalog])

  useEffect(() => { if (szeles && ful === 'extrak') setFul('csomagok') }, [szeles, ful])

  if (!k) return <div className="betolt">Betöltés…</div>

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Szolgáltatások</h2>
        <div className="fulek">
          <button className={ful === 'csomagok' ? 'aktiv' : ''} onClick={() => setFul('csomagok')}>
            Csomagok és árak
          </button>
          {!szeles && (
            <button className={ful === 'extrak' ? 'aktiv' : ''} onClick={() => setFul('extrak')}>
              Egyéb szolgáltatások
            </button>
          )}
          <button className={ful === 'tartalom' ? 'aktiv' : ''} onClick={() => setFul('tartalom')}>
            Mi van bennük?
          </button>
        </div>
      </div>

      {ful === 'csomagok' && (
        <div className={szeles ? 'szolg-ketto' : undefined}>
          <div><CsomagArak k={k} /></div>
          {szeles && (
            <div className="szolg-jobb">
              <h3 className="szolg-cim">Egyéb szolgáltatások</h3>
              <ExtraLista k={k} q={q} onQ={setQ} tomor />
            </div>
          )}
        </div>
      )}
      {ful === 'tartalom' && <CsomagTartalom k={k} />}
      {ful === 'extrak' && <ExtraLista k={k} q={q} onQ={setQ} />}
    </div>
  )
}
