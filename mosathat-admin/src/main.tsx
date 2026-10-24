import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

import './styles/tokens.css'
import './styles/base.css'
import './styles/shell.css'
import './styles/day.css'
import './styles/modal.css'
import './styles/oldal.css'
import './styles/attekintes.css'
import './styles/naptar.css'
import './styles/arpanel.css'
import './styles/igazolo.css'
import './styles/foglalas.css'
import './styles/keres.css'

import { nagyitasTiltas } from './lib/nagyitas'
import { billentyuzetHelyreallitas } from './lib/kepernyo'
import { berletLinkToken, cegLinkToken } from './lib/cegLink'

const App = lazy(() => import('./App'))
const PublikusOldal = lazy(() => import('./features/publikus/PublikusOldal'))
const CegFoglalasOldal = lazy(() => import('./features/publikus/CegFoglalasOldal'))
const BerletFoglalasOldal = lazy(() => import('./features/publikus/BerletFoglalasOldal'))
const FoglalasomOldal = lazy(() => import('./features/publikus/FoglalasomOldal'))

const ceges = /^\/ceg(\/|$)/.test(window.location.pathname)
const berletes = /^\/berlet(\/|$)/.test(window.location.pathname)
const foglalasom = /^\/foglalas(\/|$)/.test(window.location.pathname)
const foglalasomToken = /^\/foglalas\/([a-f0-9]{32})\/?$/.exec(window.location.pathname)?.[1] ?? null
const PUBLIKUS_LAPOK: Record<string, 'fooldal' | 'gyik' | 'impresszum' | 'adatvedelem'> = {
  '/publikus': 'fooldal',
  '/gyik': 'gyik',
  '/impresszum': 'impresszum',
  '/adatvedelem': 'adatvedelem',
}
const publikus = PUBLIKUS_LAPOK[window.location.pathname.replace(/\/+$/, '') || '/'] ?? null

if (publikus || ceges || berletes || foglalasom) {
  document.querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content')
} else {
  nagyitasTiltas()
  billentyuzetHelyreallitas()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {foglalasom ? (
      <Suspense fallback={null}>
        <FoglalasomOldal token={foglalasomToken} />
      </Suspense>
    ) : berletes ? (
      <Suspense fallback={null}>
        <BerletFoglalasOldal token={berletLinkToken(window.location.pathname)} />
      </Suspense>
    ) : ceges ? (
      <Suspense fallback={null}>
        <CegFoglalasOldal token={cegLinkToken(window.location.pathname)} />
      </Suspense>
    ) : publikus ? (
      <Suspense fallback={null}>
        <PublikusOldal lap={publikus} />
      </Suspense>
    ) : (
      <Suspense fallback={<div className="betolt" style={{ paddingTop: '22vh' }}>Betöltés…</div>}>
        <App />
      </Suspense>
    )}
  </StrictMode>,
)
