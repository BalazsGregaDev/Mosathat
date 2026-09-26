import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles/tokens.css'
import './styles/base.css'
import './styles/shell.css'
import './styles/day.css'
import './styles/modal.css'
import './styles/oldal.css'
import './styles/attekintes.css'

import { AppProvider } from './state/AppContext'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
