import { type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useAuth } from './lib/auth'
import { Login } from './pages/Login'
import { ScalesHome } from './pages/ScalesHome'
import { ScaleDetail } from './pages/ScaleDetail'

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="h-screen flex items-center justify-center text-slate-300">
      <RefreshCw className="animate-spin mr-3" /> Betöltés…
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<AuthGuard><ScalesHome /></AuthGuard>} />
      <Route path="/scale/:scaleId" element={<AuthGuard><ScaleDetail /></AuthGuard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
