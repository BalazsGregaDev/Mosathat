import { ft } from '../../lib/format'
import { KIND_LABEL, type ContractKind, type ContractPrice, type ContractSize } from '../../lib/types'

// ---------------------------------------------------------------------------
//  Egy szerződés árai, táblázatban
//
//  Csomagonként két sor (normál és nagy méret), két oszlop: a Céges ár (a cég
//  autói) és a Magán ár (a cég dolgozóinak saját autója). Ugyanez a táblázat
//  van a tulajdonos és az alkalmazott képernyőjén — így telefon közben
//  mindketten ugyanazt látják.
//
//  Ahol nincs ár, ott „listaár" áll: arra a kombinációra nincs megállapodás,
//  a foglalás a rendes árlista szerint megy.
// ---------------------------------------------------------------------------

export const MERETEK: ContractSize[] = ['NORMAL', 'NAGY']
export const FAJTAK: ContractKind[] = ['FLOTTA', 'SAJAT']
export const AFA = 0.27

const MERET_ROVID: Record<ContractSize, string> = {
  NORMAL: 'Normál',
  NAGY: 'Nagy',
}

export default function SzerzodesArak({ prices, netto }: {
  prices: ContractPrice[]
  /** A nettó árat is mutassa (a tulajdonosnak — a cégekkel nettóban egyeznek meg). */
  netto?: boolean
}) {
  // A csomagok a szerződésben szereplő sorrendben (a nézet csomag szerint
  // rendez). Csak az, amelyikre van ár.
  const csomagok: { id: string; nev: string }[] = []
  for (const p of prices) {
    if (!csomagok.some((c) => c.id === p.package_id)) {
      csomagok.push({ id: p.package_id, nev: p.package_name })
    }
  }
  if (csomagok.length === 0) {
    return <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>Nincs megállapodott ár.</p>
  }

  const ar = (pk: string, m: ContractSize, f: ContractKind) =>
    prices.find((x) => x.package_id === pk && x.size === m && x.kind === f)

  return (
    <table className="artabla keskeny szerzodes-arak">
      <thead>
        <tr>
          <th />
          {FAJTAK.map((f) => <th key={f}>{KIND_LABEL[f]}</th>)}
        </tr>
      </thead>
      <tbody>
        {csomagok.map((c) => MERETEK.map((m) => (
          <tr key={c.id + m} data-elso={m === 'NORMAL' || undefined}>
            <th scope="row">{c.nev} · {MERET_ROVID[m]}</th>
            {FAJTAK.map((f) => {
              const p = ar(c.id, m, f)
              return (
                <td key={f} className="szam" data-hianyzik={!p || undefined}>
                  {p ? ft(p.price_huf) : <span className="halvany">listaár</span>}
                  {p && netto && (
                    <div className="halk netto">nettó {ft(Math.round(p.price_huf / (1 + AFA)))}</div>
                  )}
                </td>
              )
            })}
          </tr>
        )))}
      </tbody>
    </table>
  )
}
