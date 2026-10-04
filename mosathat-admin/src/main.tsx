import { StrictMode } from 'react'
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

import { AppProvider } from './state/AppContext'
import { nagyitasTiltas } from './lib/nagyitas'
import { billentyuzetHelyreallitas } from './lib/kepernyo'
import App from './App'

nagyitasTiltas()
billentyuzetHelyreallitas()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
