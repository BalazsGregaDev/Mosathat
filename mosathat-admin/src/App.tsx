import { useApp } from './state/AppContext'
import LoginScreen from './features/shell/LoginScreen'
import AppShell from './features/shell/AppShell'

export default function App() {
  const { user } = useApp()
  //asd
  return user ? <AppShell /> : <LoginScreen />
}
