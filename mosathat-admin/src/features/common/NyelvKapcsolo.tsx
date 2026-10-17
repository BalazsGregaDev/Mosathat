import { useId } from 'react'

import './nyelv-kapcsolo.css'
import type { Nyelv } from '../../lib/nyelv'

function MagyarZaszlo() {
  return (
    <svg className="nyelv-zaszlo" viewBox="0 0 30 20" aria-hidden="true" focusable="false">
      <rect width="30" height="20" fill="#477050" />
      <rect width="30" height="13.34" fill="#ffffff" />
      <rect width="30" height="6.67" fill="#ce2939" />
    </svg>
  )
}

function AngolZaszlo() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg className="nyelv-zaszlo" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <clipPath id={`k${id}`}><path d="M0,0 v30 h60 v-30 z" /></clipPath>
      <clipPath id={`a${id}`}><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <g clipPath={`url(#k${id})`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#a${id})`} stroke="#c8102e" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#ffffff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  )
}

export default function NyelvKapcsolo({ nyelv, onValt, cimke }: {
  nyelv: Nyelv
  onValt: (n: Nyelv) => void
  cimke?: string
}) {
  const en = nyelv === 'en'
  return (
    <button type="button" role="switch" aria-checked={en} className="nyelv-kapcsolo" data-nyelv={nyelv}
            aria-label={cimke ? `${cimke}: English` : 'English'}
            title={en ? 'Magyar nyelv' : 'English version'}
            onClick={() => onValt(en ? 'hu' : 'en')}>
      <span className="nyelv-csuszka" aria-hidden="true" />
      <span className="nyelv-fel" data-aktiv={!en || undefined}><MagyarZaszlo />HU</span>
      <span className="nyelv-fel" data-aktiv={en || undefined}>EN<AngolZaszlo /></span>
    </button>
  )
}
