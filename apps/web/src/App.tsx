import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AuthPage } from './pages/AuthPage'
import { BoardPage } from './pages/BoardPage'
import { DashboardPage } from './pages/DashboardPage'
import { AccountPage } from './pages/AccountPage'

export function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="center-screen"><div className="loader" /><p>Ouverture de Spletch!…</p></div>

  return (
    <Routes>
      <Route path="/connexion" element={user ? <Navigate to="/" replace /> : <AuthPage mode="login" />} />
      <Route path="/inscription" element={user ? <Navigate to="/" replace /> : <AuthPage mode="register" />} />
      <Route path="/board/:boardId" element={<BoardPage />} />
      <Route path="/compte" element={user ? <AccountPage /> : <Navigate to="/connexion" replace />} />
      <Route path="/" element={user ? <DashboardPage /> : <Navigate to="/connexion" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
