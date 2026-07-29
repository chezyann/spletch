import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ensureCsrf, type User } from '../lib/api'

type AuthContextValue = {
  user: User | null
  loading: boolean
  login: (login: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  async function refresh() {
    try { setUser((await api<{ user: User }>('/api/me')).user) }
    catch { setUser(null) }
  }
  useEffect(() => {
    ensureCsrf().then(refresh).finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user, loading, refresh,
    async login(loginValue, password) {
      const result = await api<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ login: loginValue, password }) })
      setUser(result.user)
    },
    async register(email, username, password) {
      const result = await api<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, username, password }) })
      setUser(result.user)
    },
    async logout() {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
      setUser(null)
    },
  }), [loading, user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider manquant')
  return value
}
