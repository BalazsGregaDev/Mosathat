import type { Mod } from '../../lib/arculat'
import type { Bejelentes } from '../../lib/bejelentes'
import { KoncepcioLap, KoncepcioResz } from '../arculat/Koncepcio'
import { FelugroDoboz } from '../arculat/Bejelentes'
import { TartalomProvider } from '../publikus/tartalom'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import Idozitesek, { type Valt } from './Idozitesek'
import { Elonezet, Mezo } from './kozos'

function urlap(v: Bejelentes, valt: Valt) {
  return (
    <>
      <Mezo cimke="Cím (nem kötelező)">
        <input className="beviteli" value={v.cim} maxLength={120} placeholder="pl. Ünnepi nyitvatartás"
               onChange={(e) => valt({ cim: e.target.value })} data-mezo="cim" />
      </Mezo>
      <Mezo cimke="Üzenet" sugo="A *csillagok közé* írt szöveg dőlt betűs lesz.">
        <textarea className="beviteli" rows={5} value={v.szoveg} maxLength={2000}
                  onChange={(e) => valt({ szoveg: e.target.value })} data-mezo="szoveg" />
      </Mezo>
      <details className="bej-angol" open={Boolean(v.cim_en || v.szoveg_en) || undefined}>
        <summary>Angolul (nem kötelező)</summary>
        <div className="pub-mezok">
          <Mezo cimke="Cím angolul">
            <input className="beviteli" value={v.cim_en} maxLength={120} placeholder="e.g. Holiday opening hours"
                   onChange={(e) => valt({ cim_en: e.target.value })} data-mezo="cim_en" />
          </Mezo>
          <Mezo cimke="Üzenet angolul" sugo="Ha üresen marad, az angol oldalon is a magyar szöveg ugrik fel.">
            <textarea className="beviteli" rows={4} value={v.szoveg_en} maxLength={2000}
                      onChange={(e) => valt({ szoveg_en: e.target.value })} data-mezo="szoveg_en" />
          </Mezo>
        </div>
      </details>
      <p className="halk pub-megjegyzes">
        Minden látogatónak egyszer ugrik fel. Ha bezárta, újra csak akkor látja, ha módosítod a szöveget, vagy kikapcsolod és
        újra bekapcsolod. Ha csak az időpontot módosítod, nem ugrik fel újra.
      </p>
    </>
  )
}

export default function FelugroOldal() {
  const { adat: pub } = usePublikusAdat()
  if (!pub) return <div className="betolt">Betöltés…</div>
  const mod: Mod = pub.arculat === '03' && pub.mod ? pub.mod : 'VILAGOS'

  return (
    <Idozitesek
      tipus="FELUGRO"
      cim="Felugró ablak"
      alcim="Fontos bejelentés, ami a publikus oldal megnyitásakor felugrik. Előre több is beállítható, mindegyik a saját időszakában: egyszerre mindig csak egy látszik."
      ujFelirat="+ Új felugró ablak"
      tartalomHiba={(v) => (v.szoveg.trim() ? null : 'Írd be az üzenetet.')}
      urlap={urlap}
      elonezet={(v, nyelv) => (
        <TartalomProvider t={pub.tartalom} lemondasOra={pub.lemondasOra} nyelv={nyelv}>
          <Elonezet szel={1280} keret>
            <div className="bej-felugro-minta">
              <KoncepcioResz resz="nav" mod={mod} k={pub.katalogus} />
              <KoncepcioResz resz="hero" mod={mod} k={pub.katalogus} />
              <div className="bej-felugro-takaro">
                <KoncepcioLap mod={mod} k={pub.katalogus}>
                  <FelugroDoboz f={{ ...v, szoveg: v.szoveg.trim() ? v.szoveg : 'Ide kerül az üzenet szövege.' }} nyelv={nyelv} />
                </KoncepcioLap>
              </div>
            </div>
          </Elonezet>
        </TartalomProvider>
      )}
    />
  )
}
