import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, LogOut } from 'lucide-react'
import { api, type Scale, type Settings as S } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ScaleCard } from '../components/ScaleCard'

export function ScalesHome() {
  const { user, logout } = useAuth()
  const [scales, setScales] = useState<Scale[]>([])
  const [settings, setSettings] = useState<S | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const msgTimer = useRef<number | null>(null)

  const notify = useCallback((m: string) => {
    setMsg(m)
    if (msgTimer.current) window.clearTimeout(msgTimer.current)
    msgTimer.current = window.setTimeout(() => setMsg(''), 3500)
  }, [])

  const load = useCallback(async () => {
    try {
      const [s, cfg] = await Promise.all([api.scales(), api.settings()])
      setScales(s)
      setSettings(cfg)
    } catch (e: any) {
      notify('Hiba a betöltéskor: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const h = window.setInterval(load, 120_000)
    return () => window.clearInterval(h)
  }, [load])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await api.sync()
      const count = Object.values(res.inserted).reduce((a, b) => a + b, 0)
      notify(count > 0 ? `${count} új mérés` : 'Az adatbázis naprakész')
      await load()
    } catch (e: any) {
      notify('Hiba: ' + e.message)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-slate-300">
        <RefreshCw className="animate-spin mr-3" /> Betöltés…
      </div>
    )
  }

  const batteryWarnV = settings ? Number(settings.battery_warn_v) : 5.6

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <header className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-br from-honey-300 to-honey-500 bg-clip-text text-transparent">
              🐝 Kaptár Dashboard
            </h1>
            {user && <p className="text-sm text-slate-400">{user.name || user.email}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Szinkron</span>
            </button>
            <button className="btn-ghost" onClick={logout} title="Kijelentkezés">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {msg && (
          <div className="mb-4 card px-4 py-2 text-sm text-honey-300 border-honey-700/50 bg-honey-950/30">
            {msg}
          </div>
        )}

        {scales.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-slate-300">Még nincsenek mérlegek konfigurálva.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scales.map(s => (
              <ScaleCard key={s.id} scale={s} batteryWarnV={batteryWarnV} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
