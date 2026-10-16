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

const PublikusOldal = lazy(() => import('./features/publikus/PublikusOldal'))

const lemondas = /^\/lemondas(\/|$)/.test(window.location.pathname)
const PUBLIKUS_LAPOK: Record<string, 'fooldal' | 'impresszum' | 'adatvedelem'> = {
  '/publikus': 'fooldal',
  '/impresszum': 'impresszum',
  '/adatvedelem': 'adatvedelem',
}
const publikus = PUBLIKUS_LAPOK[window.location.pathname.replace(/\/+$/, '') || '/'] ?? null

if (!lemondas && !publikus) {
  nagyitasTiltas()
  billentyuzetHelyreallitas()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {lemondas ? (
      <LemondasOldal />
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
