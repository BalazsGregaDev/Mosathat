import { useLayoutEffect, useRef } from 'react'

interface Nyitott {
  d: HTMLDialogElement
  esc: { current?: () => void }
}

const nyitottak: Nyitott[] = []

function billentyu(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  const felso = nyitottak[nyitottak.length - 1]
  if (!felso) return
  e.preventDefault()
  felso.esc.current?.()
}

export default function Ablak({
  osztaly = 'fedo',
  cimke,
  cimkeId,
  leirasId,
  szerep,
  onEsc,
  onHatter,
  children,
}: {
  osztaly?: string
  cimke?: string
  cimkeId?: string
  leirasId?: string
  szerep?: 'alertdialog'
  onEsc?: () => void
  onHatter?: (ablak: HTMLDialogElement) => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const esc = useRef(onEsc)
  const hatter = useRef(onHatter)
  useLayoutEffect(() => {
    esc.current = onEsc
    hatter.current = onHatter
  })

  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    const elozo = document.activeElement
    d.setAttribute('autofocus', '')
    if (!d.open) d.showModal()
    const kezdo = d.querySelector<HTMLElement>('[data-autofocus]')
    if (kezdo) kezdo.focus({ preventScroll: true })
    else if (elozo instanceof HTMLElement && elozo !== d && d.contains(elozo)) elozo.focus({ preventScroll: true })
    else d.focus({ preventScroll: true })

    const en: Nyitott = { d, esc }
    nyitottak.push(en)
    if (nyitottak.length === 1) document.addEventListener('keydown', billentyu)

    const elnyel = (e: KeyboardEvent) => { if (e.key === 'Escape') e.preventDefault() }
    const eger = (e: MouseEvent) => { if (e.target === d) hatter.current?.(d) }
    const megse = (e: Event) => {
      if (!e.cancelable) return
      e.preventDefault()
      esc.current?.()
    }
    const lezarult = () => {
      if (d.open || !d.isConnected) return
      d.showModal()
      esc.current?.()
    }
    d.addEventListener('keydown', elnyel, true)
    d.addEventListener('mousedown', eger)
    d.addEventListener('cancel', megse)
    d.addEventListener('close', lezarult)
    return () => {
      d.removeEventListener('keydown', elnyel, true)
      d.removeEventListener('mousedown', eger)
      d.removeEventListener('cancel', megse)
      d.removeEventListener('close', lezarult)
      const i = nyitottak.indexOf(en)
      if (i >= 0) nyitottak.splice(i, 1)
      if (nyitottak.length === 0) document.removeEventListener('keydown', billentyu)
      if (d.open) d.close()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className={osztaly}
      tabIndex={-1}
      role={szerep}
      aria-label={cimke}
      aria-labelledby={cimkeId}
      aria-describedby={leirasId}
    >
      {children}
    </dialog>
  )
}
