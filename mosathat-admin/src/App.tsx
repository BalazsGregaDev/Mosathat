import { Component, type ReactNode } from 'react'

import { useApp } from './state/AppContext'
import LoginScreen from './features/shell/LoginScreen'
import AppShell from './features/shell/AppShell'

class HibaHatar extends Component<{ children: ReactNode }, { hiba: Error | null }> {
  state: { hiba: Error | null } = { hiba: null }

  static getDerivedStateFromError(hiba: Error) {
    return { hiba }
  }

  render() {
    if (!this.state.hiba) return this.props.children
    return (
      <div style={{ maxWidth: 560, margin: '18vh auto', padding: 24, display: 'grid', gap: 12 }}>
        <div className="hibauzenet">Váratlan hiba történt: {this.state.hiba.message}</div>
        <button type="button" className="btn btn-fo" onClick={() => window.location.reload()}>
          Újratöltés
        </button>
      </div>
    )
  }
}

export default function App() {
  const { user } = useApp()
  return <HibaHatar>{user ? <AppShell /> : <LoginScreen />}</HibaHatar>
}
