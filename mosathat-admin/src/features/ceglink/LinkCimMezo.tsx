import { useEffect, useState } from 'react'

import { linkCimNorm } from '../../lib/cegLink'
import { useMentetlen } from '../../state/useMentetlen'

export default function LinkCimMezo({ id, elotag, ertek, megy, cimke, onMent }: {
  id: string
  elotag: string
  ertek: string | null
  megy: boolean
  cimke: string
  onMent: (cim: string) => Promise<void>
}) {
  const [szoveg, setSzoveg] = useState(ertek ?? '')
  useEffect(() => { setSzoveg(ertek ?? '') }, [ertek])

  const cim = linkCimNorm(szoveg, true)
  const valtozott = szoveg !== (ertek ?? '')
  const menthato = cim.length >= 3 && cim !== (ertek ?? '') && !megy
  useMentetlen(valtozott)

  function mentes() {
    if (menthato) void onMent(cim)
  }

  const tipp = cim.length < 3
    ? 'Legalább 3 karakter: kisbetű, szám vagy kötőjel.'
    : [
        ertek ? 'Mentés után a mostani link megszűnik.' : 'Ezzel a címmel készül el a link.',
        cim.length < 10 ? 'A rövid cím könnyen kitalálható.' : null,
      ].filter(Boolean).join(' ')

  return (
    <div className="linkcim">
      <label htmlFor={id} className="linkcim-cimke">Egyedi cím</label>
      <div className="linkcim-sor">
        <span className="linkcim-elotag" aria-hidden="true" title={elotag}><bdi>{elotag}</bdi></span>
        <input id={id} className="linkcim-bevitel" value={szoveg} maxLength={64}
               aria-label={cimke}
               placeholder={ertek ? undefined : 'üresen véletlen'}
               spellCheck={false} autoCapitalize="none" autoCorrect="off" autoComplete="off"
               onChange={(e) => setSzoveg(linkCimNorm(e.target.value))}
               onKeyDown={(e) => {
                 if (e.key === 'Enter') { e.preventDefault(); mentes() }
                 if (e.key === 'Escape' && valtozott) { e.stopPropagation(); setSzoveg(ertek ?? '') }
               }} />
      </div>
      {valtozott && (
        <div className="ceglink-gombok">
          <small className="halk">{tipp}</small>
          <button type="button" className="btn btn-kicsi" onClick={() => setSzoveg(ertek ?? '')}>Elvetés</button>
          <button type="button" className="btn btn-kicsi btn-fo" disabled={!menthato} onClick={mentes}>Mentés</button>
        </div>
      )}
    </div>
  )
}
