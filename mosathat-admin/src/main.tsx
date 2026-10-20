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
import './styles/lemondas.css'

import { AppProvider } from './state/AppContext'
import { nagyitasTiltas } from './lib/nagyitas'
import { billentyuzetHelyreallitas } from './lib/kepernyo'
import App from './App'
import LemondasOldal from './features/publikus/LemondasOldal'
import { cegLinkToken } from './lib/cegLink'

const PublikusOldal = lazy(() => import('./features/publikus/PublikusOldal'))
const CegFoglalasOldal = lazy(() => import('./features/publikus/CegFoglalasOldal'))

const lemondas = /^\/lemondas(\/|$)/.test(window.location.pathname)
const ceges = /^\/ceg(\/|$)/.test(window.location.pathname)
const PUBLIKUS_LAPOK: Record<string, 'fooldal' | 'impresszum' | 'adatvedelem'> = {
  '/publikus': 'fooldal',
  '/impresszum': 'impresszum',
  '/adatvedelem': 'adatvedelem',
}
const publikus = PUBLIKUS_LAPOK[window.location.pathname.replace(/\/+$/, '') || '/'] ?? null

if (!lemondas && !publikus && !ceges) {
  nagyitasTiltas()
  billentyuzetHelyreallitas()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {lemondas ? (
      <LemondasOldal />
    ) : ceges ? (
      <Suspense fallback={null}>
        <CegFoglalasOldal token={cegLinkToken(window.location.pathname)} />
      </Suspense>
    ) : publikus ? (
      <Suspense fallback={null}>
        <PublikusOldal lap={publikus} />
      </Suspense>
    ) : (
      <AppProvider>
        <App />
      </AppProvider>
    )}
  </StrictMode>,
)
