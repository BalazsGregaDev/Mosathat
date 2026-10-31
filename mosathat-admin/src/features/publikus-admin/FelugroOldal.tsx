import { useEffect, useMemo, useState } from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import './bejelentes-admin.css'
import { useApp } from '../../state/AppContext'
import { useMentes } from '../../state/useMentes'
import { useMentetlen } from '../../state/useMentetlen'
import { URES_FELUGRO, type Felugro } from '../../lib/bejelentes'
import type { Mod } from '../../lib/arculat'
import type { Nyelv } from '../../lib/nyelv'
import { KoncepcioLap, KoncepcioResz } from '../arculat/Koncepcio'
import { FelugroDoboz } from '../arculat/Bejelentes'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import { TartalomProvider } from '../publikus/tartalom'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import { Elonezet, Mezo, PubFej } from './kozos'

function tisztit(f: Felugro): Felugro {
  return { aktiv: f.aktiv, cim: f.cim, szoveg: f.szoveg, cim_en: f.cim_en, szoveg_en: f.szoveg_en }
}

export default function FelugroOldal() {
  const { data } = useApp()
  const { adat: pub } = usePublikusAdat()
  const [eredeti, setEredeti] = useState<Felugro | null>(null)
  const [f, setF] = useState<Felugro>(URES_FELUGRO)
  const [nyelv, setNyelv] = useState<Nyelv>('hu')
  const [toltHiba, setToltHiba] = useState('')
  const { allapot, fut } = useMentes()

  useEffect(() => {
    let el = true
    data.bejelentesAdat()
      .then((a) => {
        if (!el) return
        const t = tisztit(a.felugro)
        setEredeti(t)
        setF(t)
      })
      .catch((e: unknown) => { if (el) setToltHiba(e instanceof Error ? e.message : String(e)) })
    return () => { el = false }
  }, [data])

  const valtozott = eredeti !== null && JSON.stringify(f) !== JSON.stringify(eredeti)
  useMentetlen(valtozott)
  const minta = useMemo<Felugro>(() => ({ ...f, szoveg: f.szoveg.trim() ? f.szoveg : 'Ide kerül az üzenet szövege.' }), [f])

  if (toltHiba) return <div className="oldal pub-oldal"><p className="pub-hiba">{toltHiba}</p></div>
  if (!pub || eredeti === null) return <div className="betolt">Betöltés…</div>
  const mod: Mod = pub.arculat === '03' && pub.mod ? pub.mod : 'VILAGOS'
  const valt = (patch: Partial<Felugro>) => setF((x) => ({ ...x, ...patch }))
  const hiany = f.aktiv && !f.szoveg.trim()

  return (
    <div className="oldal pub-oldal">
      <PubFej
        cim="Felugró ablak"
        alcim="Fontos bejelentés, ami a publikus oldal megnyitásakor felugrik. A látogató az X-szel vagy a Rendben gombbal zárhatja be."
        linkek={[['Publikus oldal megnyitása', '/publikus']]}
        valtozott={valtozott && !hiany}
        allapot={hiany ? 'A bekapcsolt felugró ablakhoz írd be az üzenetet.' : allapot}
        onElvet={() => setF(eredeti)}
        onMent={() => void fut(async () => {
          await data.felugroMentes({ ...f, cim: f.cim.trim(), szoveg: f.szoveg.trim(), cim_en: f.cim_en.trim(), szoveg_en: f.szoveg_en.trim() })
          const uj = tisztit((await data.bejelentesAdat()).felugro)
          setEredeti(uj)
          setF(uj)
        })}
      />

      <div className="bej-racs">
        <section className="panel">
          <h3>Beállítás</h3>
          <div className="panel-torzs pub-mezok">
            <label className="pub-pipa bej-kapcsolo">
              <input type="checkbox" checked={f.aktiv} onChange={(e) => valt({ aktiv: e.target.checked })} data-mezo="aktiv" />
              <span>
                Bekapcsolva
                <small className="halk">{f.aktiv ? 'Megjelenik a publikus oldalon.' : 'Most nem jelenik meg a publikus oldalon.'}</small>
              </span>
            </label>
            <Mezo cimke="Cím (nem kötelező)">
              <input className="beviteli" value={f.cim} maxLength={120} placeholder="pl. Ünnepi nyitvatartás"
                     onChange={(e) => valt({ cim: e.target.value })} data-mezo="cim" />
            </Mezo>
            <Mezo cimke="Üzenet" sugo="A *csillagok közé* írt szöveg dőlt betűs lesz.">
              <textarea className="beviteli" rows={5} value={f.szoveg} maxLength={2000}
                        onChange={(e) => valt({ szoveg: e.target.value })} data-mezo="szoveg" />
            </Mezo>
            <details className="bej-angol" open={Boolean(f.cim_en || f.szoveg_en) || undefined}>
              <summary>Angolul (nem kötelező)</summary>
              <div className="pub-mezok">
                <Mezo cimke="Cím angolul">
                  <input className="beviteli" value={f.cim_en} maxLength={120} placeholder="e.g. Holiday opening hours"
                         onChange={(e) => valt({ cim_en: e.target.value })} data-mezo="cim_en" />
                </Mezo>
                <Mezo cimke="Üzenet angolul" sugo="Ha üresen marad, az angol oldalon is a magyar szöveg ugrik fel.">
                  <textarea className="beviteli" rows={4} value={f.szoveg_en} maxLength={2000}
                            onChange={(e) => valt({ szoveg_en: e.target.value })} data-mezo="szoveg_en" />
                </Mezo>
              </div>
            </details>
            <p className="halk pub-megjegyzes">
              Minden látogatónak egyszer ugrik fel. Ha bezárta, újra csak akkor látja, ha módosítod a szöveget, vagy kikapcsolod és
              újra bekapcsolod.
            </p>
          </div>
        </section>

        <section className="panel bej-elonezet">
          <h3>
            Előnézet
            <span className="bej-elonezet-eszkoz"><NyelvKapcsolo nyelv={nyelv} onValt={setNyelv} /></span>
          </h3>
          <div className="panel-torzs">
            {!f.aktiv && <p className="halk pub-megjegyzes">Kikapcsolva: így nézne ki, ha bekapcsolnád.</p>}
            <TartalomProvider t={pub.tartalom} lemondasOra={pub.lemondasOra} nyelv={nyelv}>
              <Elonezet szel={1280} keret>
                <div className="bej-felugro-minta">
                  <KoncepcioResz resz="nav" mod={mod} k={pub.katalogus} />
                  <KoncepcioResz resz="hero" mod={mod} k={pub.katalogus} />
                  <div className="bej-felugro-takaro">
                    <KoncepcioLap mod={mod} k={pub.katalogus}>
                      <FelugroDoboz f={minta} nyelv={nyelv} />
                    </KoncepcioLap>
                  </div>
                </div>
              </Elonezet>
            </TartalomProvider>
          </div>
        </section>
      </div>
    </div>
  )
}
