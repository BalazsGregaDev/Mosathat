import { useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
//  Aláírás a képernyőn, ujjal (vagy egérrel, tollal)
//
//  Egy fehér mező: aki átveszi az autót, ujjal aláírja. A rajzból PNG kép
//  lesz (csak maga az aláírás, az üres széle levágva), ez kerül a Word lap
//  Aláírás oszlopába.
//
//  Ha már van mentett aláírás, azt mutatja; az „Újra aláírás" gombbal lehet
//  újat kérni (a régi csak mentéskor cserélődik). A „Törlés" üresre teszi —
//  akkor a Wordben üres marad a cella, és kinyomtatva papíron aláírható.
//
//  Miért pointer események: ugyanaz a kód kezeli az ujjat, az egeret és a
//  tollat. A `touch-action: none` (CSS) miatt a mezőn húzott ujj nem görgeti
//  a lapot — különben aláírás közben elcsúszna az egész ablak.
// ---------------------------------------------------------------------------

const MAGASSAG = 150      // a mező magassága (CSS px)
const KEP_MAX_SZEL = 600  // a mentett kép legfeljebb ilyen széles (képpont)

/**
 * A rajzból csak az aláírást tartjuk meg, a körülötte lévő üres részt
 * levágjuk (kis szegéllyel), és legfeljebb 600 képpont szélesre kicsinyítjük.
 *
 * Miért: a vászon széles és alacsony; egy kis aláírás a közepén levágás
 * nélkül a Word cellájában apró pötty lenne a sok üres hely között. Így a
 * kép az aláírás maga — a cellában és a lap kis előnézetében is jól látszik,
 * és a mentett adat is kisebb.
 *
 * Ha a vászon üres, null-t ad.
 */
function levagott(c: HTMLCanvasElement): string | null {
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const { width: w, height: h } = c
  const px = ctx.getImageData(0, 0, w, h).data
  // A rajzolt pontok határai (ahol a képpont nem átlátszó).
  let bal = w, jobb = -1, fent = h, lent = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 0) {
        if (x < bal) bal = x
        if (x > jobb) jobb = x
        if (y < fent) fent = y
        if (y > lent) lent = y
      }
    }
  }
  if (jobb < 0) return null
  // Egy kis szegély, hogy a vonal ne érjen a kép széléig.
  const sz = Math.round(6 * (window.devicePixelRatio || 1))
  bal = Math.max(0, bal - sz); fent = Math.max(0, fent - sz)
  jobb = Math.min(w - 1, jobb + sz); lent = Math.min(h - 1, lent + sz)
  const kw = jobb - bal + 1
  const kh = lent - fent + 1
  const arany = Math.min(1, KEP_MAX_SZEL / kw)
  const ki = document.createElement('canvas')
  ki.width = Math.max(1, Math.round(kw * arany))
  ki.height = Math.max(1, Math.round(kh * arany))
  ki.getContext('2d')?.drawImage(c, bal, fent, kw, kh, 0, 0, ki.width, ki.height)
  return ki.toDataURL('image/png')
}

export default function AlairasRajzolo({
  ertek,
  onValt,
  zarolt,
}: {
  /** A mentett aláírás (data URL), vagy null. */
  ertek: string | null
  /** Új kép (data URL), vagy null, ha törölték. */
  onValt: (kep: string | null) => void
  /** Lezárt lapnál csak megnézni lehet. */
  zarolt?: boolean
}) {
  const vaszon = useRef<HTMLCanvasElement>(null)
  const rajzol = useRef(false)
  const utolso = useRef<{ x: number; y: number } | null>(null)
  // Rajzolunk-e most (új aláírás), vagy a mentett képet mutatjuk.
  const [rajzMod, setRajzMod] = useState(!ertek)
  const [ures, setUres] = useState(true)

  // A vászon a képernyő sűrűségéhez igazodik (telefonon 2-3×), különben a
  // vonal recésen, homályosan látszana.
  useEffect(() => {
    if (!rajzMod) return
    const c = vaszon.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    c.width = Math.round(w * dpr)
    c.height = Math.round(MAGASSAG * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
    setUres(true)
  }, [rajzMod])

  function pont(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function le(e: React.PointerEvent<HTMLCanvasElement>) {
    if (zarolt) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    rajzol.current = true
    utolso.current = pont(e)
    // Egy koppintás is hagyjon nyomot (pont), ne csak a húzás.
    const ctx = e.currentTarget.getContext('2d')
    if (ctx && utolso.current) {
      ctx.beginPath()
      ctx.arc(utolso.current.x, utolso.current.y, 1.2, 0, Math.PI * 2)
      ctx.fillStyle = '#111'
      ctx.fill()
    }
  }

  function mozog(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!rajzol.current || !utolso.current) return
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const p = pont(e)
    ctx.beginPath()
    ctx.moveTo(utolso.current.x, utolso.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    utolso.current = p
  }

  function fel() {
    if (!rajzol.current) return
    rajzol.current = false
    utolso.current = null
    setUres(false)
    // Minden vonás után elküldjük a képet: így a „Mentés" mindig a
    // legfrissebbet viszi, külön „Kész" gomb nélkül.
    const c = vaszon.current
    if (c) onValt(levagott(c))
  }

  function torol() {
    const c = vaszon.current
    const ctx = c?.getContext('2d')
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height)
    setUres(true)
    onValt(null)
  }

  // --- a mentett aláírás ---------------------------------------------------
  if (!rajzMod && ertek) {
    return (
      <div className="alairas">
        <div className="alairas-kep">
          <img src={ertek} alt="Aláírás" />
        </div>
        {!zarolt && (
          <div className="alairas-gombok">
            <button type="button" className="btn btn-kicsi" onClick={() => setRajzMod(true)}>
              Újra aláírás
            </button>
            <button type="button" className="btn btn-kicsi btn-veszelyes"
                    onClick={() => { onValt(null); setRajzMod(true) }}>
              Aláírás törlése
            </button>
          </div>
        )}
      </div>
    )
  }

  if (zarolt) {
    return <div className="alairas-ures halvany">nincs aláírva</div>
  }

  // --- rajzolás ------------------------------------------------------------
  return (
    <div className="alairas">
      <canvas
        ref={vaszon}
        className="alairas-vaszon"
        style={{ height: MAGASSAG }}
        aria-label="Aláírás: írj alá ujjal ebben a mezőben"
        onPointerDown={le}
        onPointerMove={mozog}
        onPointerUp={fel}
        onPointerCancel={fel}
      />
      <div className="alairas-gombok">
        <span className="halk" style={{ fontSize: 'var(--m-xs)' }}>
          {ures ? 'Írj alá ujjal a fenti mezőben.' : 'Aláírva.'}
        </span>
        <button type="button" className="btn btn-kicsi" onClick={torol} disabled={ures}>
          Újra
        </button>
      </div>
    </div>
  )
}
