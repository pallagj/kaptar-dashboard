import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getAuthToken, setAuthToken, setUnauthorizedHandler, type User } from './api'

interface AuthState {
  user: User | null
  loading: boolean
  login: (id_token: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setUnauthorizedHandler(() => { setUser(null) })
    const tok = getAuthToken()
    if (!tok) { setLoading(false); return }
    api.me()
      .then(u => setUser(u))
      .catch(() => { setAuthToken(null); setUser(null) })
      .finally(() => setLoading(false))
  }, [])

  async function login(id_token: string) {
    const res = await api.authGoogle(id_token)
    setAuthToken(res.token)
    setUser(res.user)
  }

  function logout() {
    setAuthToken(null)
    setUser(null)
  }

  async function refresh() {
    const u = await api.me()
    setUser(u)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
