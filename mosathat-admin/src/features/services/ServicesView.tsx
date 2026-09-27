import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { useSzeles } from '../../state/useSzeles'
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
//
//  Széles képernyőn a csomagárak és az egyéb szolgáltatások EGYMÁS MELLETT
//  állnak. Az egyéb szolgáltatások listája két szó és egy ár soronként —
//  külön lapon a fél képernyő üresen maradna, miközben a telefonáláshoz
//  sokszor épp a kettő együtt kell: „a Premium ennyi, a kárpittisztítás
//  külön ennyi".
// ---------------------------------------------------------------------------

/** Ugyanaz a töréspont, mint a CSS-ben (.szolg-ketto). */
export const KETTO_PX = 1180

export default function ServicesView() {
  const { data, catalog } = useApp()
  const [k, setK] = useState<Catalog | null>(catalog)
  const [ful, setFul] = useState<'csomagok' | 'tartalom' | 'extrak'>('csomagok')
  const [q, setQ] = useState('')
  const szeles = useSzeles(KETTO_PX)

  useEffect(() => { data.getCatalog().then(setK) }, [data])

  // Ha az ablak kiszélesedik, miközben az „Egyéb szolgáltatások" fülön
  // állunk, az a fül megszűnik — ilyenkor a tartalma amúgy is látszik a
  // csomagok mellett, oda váltunk.
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
          <div className="szolg-bal"><CsomagArak k={k} /></div>
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
