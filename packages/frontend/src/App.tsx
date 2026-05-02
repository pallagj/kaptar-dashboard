import { type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useAuth } from './lib/auth'
import { getAuthToken, setAuthToken } from './lib/api'
import { Login } from './pages/Login'
import { ScalesHome } from './pages/ScalesHome'
import { ScaleDetail } from './pages/ScaleDetail'
import { GlobalSettings } from './pages/GlobalSettings'

const ADMIN_TOKEN_KEY = 'kaptar_admin_jwt'

function ImpersonateBanner() {
  const { user, refresh } = useAuth()
  const adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY)
  if (!adminToken) return null
  return (
    <div className="sticky top-0 z-50 bg-amber-600 text-white text-sm px-4 py-2 flex items-center justify-between gap-3">
      <span>🔑 <b>{user?.name || user?.email}</b> nevében nézel</span>
      <button
        className="underline font-medium"
        onClick={() => {
          setAuthToken(adminToken)
          sessionStorage.removeItem(ADMIN_TOKEN_KEY)
          refresh()
        }}
      >
        Vissza a saját fiókra
      </button>
    </div>
  )
}

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="h-screen flex items-center justify-center text-slate-300">
      <RefreshCw className="animate-spin mr-3" /> Betöltés…
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return <><ImpersonateBanner />{children}</>
}

export { ADMIN_TOKEN_KEY }

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<AuthGuard><ScalesHome /></AuthGuard>} />
      <Route path="/scale/:scaleId" element={<AuthGuard><ScaleDetail /></AuthGuard>} />
      <Route path="/settings" element={<AuthGuard><GlobalSettings /></AuthGuard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
