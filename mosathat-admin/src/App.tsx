import { useApp } from './state/AppContext'
import LoginScreen from './features/shell/LoginScreen'
import AppShell from './features/shell/AppShell'

export default function App() {
  const { user } = useApp()
  return user ? <AppShell /> : <LoginScreen />
}
