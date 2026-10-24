import { useEffect, useRef, useState } from 'react'

import '../ceglink/ceglink.css'
import { useApp } from '../../state/AppContext'
import { useKerdes } from '../common/Kerdes'
import { hibaSzoveg, napRovidCim } from '../../lib/format'
import { berletLinkCim, berletLinkLevel, linkCimElotag, vagolapra } from '../../lib/cegLink'
import type { BerletLinkSor } from '../../lib/types'
import QrAblak from '../ceglink/QrAblak'
import LinkCimMezo from '../ceglink/LinkCimMezo'

export default function BerletLink({ customerId, nev, sor, onUj }: {
  customerId: string
  nev: string
  sor: BerletLinkSor | null
  onUj: (s: BerletLinkSor) => void
}) {
  const { data } = useApp()
  const [kerdesAblak, kerdez] = useKerdes()
  const [megy, setMegy] = useState(false)
  const [jelzes, setJelzes] = useState<{ szoveg: string; hiba?: boolean } | null>(null)
  const [qr, setQr] = useState(false)
  const idozito = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(idozito.current), [])

  const link = sor ? berletLinkCim(sor.token) : null

  function jelez(j: { szoveg: string; hiba?: boolean }) {
    window.clearTimeout(idozito.current)
    setJelzes(j)
    idozito.current = window.setTimeout(() => setJelzes(null), 4000)
  }

  async function masol(token: string, uj: boolean) {
    const ok = await vagolapra(berletLinkLevel(nev, berletLinkCim(token)))
    jelez(ok
      ? { szoveg: uj ? 'Link kész, a levél a vágólapon' : 'A levél a vágólapon' }
      : { szoveg: 'Nem sikerült a vágólapra másolni', hiba: true })
  }

  async function general(cim?: string) {
    if (megy) return
    if (sor && !(await kerdez({
      cim: cim ? `Link átírása: ${nev}` : `Új link: ${nev}`,
      szoveg: 'A mostani link azonnal megszűnik, azzal már nem lehet foglalni. Az új link és az ügyfélnek szóló levél a vágólapra kerül.',
      igen: cim ? 'Átírás' : 'Új link', nem: 'Mégsem', veszelyes: true,
    }))) return
    setMegy(true)
    try {
      const token = cim ? await data.berletLinkAtir(customerId, cim) : await data.berletLinkUj(customerId)
      onUj({ customer_id: customerId, token, created_at: new Date().toISOString() })
      await masol(token, true)
    } catch (e) {
      jelez({ szoveg: hibaSzoveg(e), hiba: true })
    } finally {
      setMegy(false)
    }
  }

  return (
    <div className="ceglink-link berlet-link">
      <div className="szakasz-cim">Foglalási link</div>
      {link ? (
        <div className="ceglink-link-sor">
          <a href={link} target="_blank" rel="noopener" className="ceglink-cim">{link}</a>
          <button type="button" className="btn btn-kicsi" disabled={megy}
                  title="Az ügyfélnek szóló levél másolása a linkkel" onClick={() => void masol(sor!.token, false)}>
            Másolás
          </button>
        </div>
      ) : (
        <span className="halk">Még nincs link. Ezen a saját oldalon az ügyfél a bérletére tud időpontot foglalni.</span>
      )}
      <LinkCimMezo id={`bl-${customerId}`} elotag={linkCimElotag('berlet')} ertek={sor?.token ?? null}
                   megy={megy} cimke={`A link egyedi címe: ${nev}`} onMent={(cim) => general(cim)} />
      <div className="ceglink-gombok">
        <button type="button" className={`btn btn-kicsi${link ? '' : ' btn-fo'}`} disabled={megy}
                onClick={() => void general()}>
          {link ? 'Új link' : 'Link készítése'}
        </button>
        {link && <button type="button" className="btn btn-kicsi" onClick={() => setQr(true)}>QR-kód</button>}
        {sor?.created_at && <small className="halk">Készült: {napRovidCim(sor.created_at.slice(0, 10))}</small>}
      </div>
      {jelzes && <output className={jelzes.hiba ? 'ceglink-jelzes hiba' : 'ceglink-jelzes'}>{jelzes.szoveg}</output>}
      {qr && link && (
        <QrAblak cegNev={nev} link={link} onBezar={() => setQr(false)}
                 leiras="Ezzel a kóddal az ügyfél telefonon megnyitja a saját foglalási oldalát." />
      )}
      {kerdesAblak}
    </div>
  )
}
