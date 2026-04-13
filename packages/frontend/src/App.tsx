import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard, TrendingUp, Flower2, Settings as SettingsIcon,
  RefreshCw, Download,
} from 'lucide-react'
import { api, type Flower, type Hive, type Season, type Settings as S, type Stats } from './lib/api'
import { Dashboard } from './pages/Dashboard'
import { WeightChange } from './pages/WeightChange'
import { Seasons } from './pages/Seasons'
import { SettingsPage } from './pages/Settings'

type Tab = 'dashboard' | 'weight' | 'seasons' | 'settings'
type Range = '24h' | '7d' | '30d' | 'all'

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [range, setRange] = useState<Range>('7d')
  const [hives, setHives] = useState<Hive[]>([])
  const [hiveId, setHiveId] = useState<string>('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [flowers, setFlowers] = useState<Flower[]>([])
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

  const loadAll = useCallback(async (id?: string) => {
    try {
      const [h, f, s] = await Promise.all([api.hives(), api.flowers(), api.settings()])
      setHives(h)
      setFlowers(f)
      setSettings(s)
      const activeId = id || hiveId || h[0]?.id || ''
      if (!activeId) return
      if (activeId !== hiveId) setHiveId(activeId)
      const [st, se] = await Promise.all([api.stats(activeId), api.seasons(activeId)])
      setStats(st)
      setSeasons(se)
    } catch (e: any) {
      notify('Hiba a betöltéskor: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [hiveId, notify])

  useEffect(() => { loadAll() }, []) // eslint-disable-line

  // Light periodic refresh every 2 minutes
  useEffect(() => {
    const h = window.setInterval(() => { if (hiveId) loadAll(hiveId) }, 120_000)
    return () => window.clearInterval(h)
  }, [hiveId, loadAll])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await api.sync()
      const count = Object.values(res.inserted).reduce((a, b) => a + b, 0)
      notify(count > 0 ? `${count} új mérés` : 'Az adatbázis naprakész')
      await loadAll(hiveId)
    } catch (e: any) {
      notify('Hiba: ' + e.message)
    } finally {
      setSyncing(false)
    }
  }

  async function handleExport() {
    if (!stats) return
    const blob = new Blob([JSON.stringify({ hive: hiveId, exportedAt: Date.now(), stats }, null, 2)],
      { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kaptar-${hiveId}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-slate-300">
        <RefreshCw className="animate-spin mr-3" />
        Betöltés…
      </div>
    )
  }

  const hive = hives.find(h => h.id === hiveId)
  const batteryWarnV = settings ? Number(settings.battery_warn_v) : 5.6

  return (
    <div className="min-h-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-br from-honey-300 to-honey-500 bg-clip-text text-transparent">
            🐝 Kaptár Dashboard
          </h1>
          <p className="text-sm text-slate-400 truncate">
            {hive?.name ?? '—'} · {hive?.id ?? ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hives.length > 1 && (
            <select
              className="input !py-2 !w-auto"
              value={hiveId}
              onChange={e => { setHiveId(e.target.value); loadAll(e.target.value) }}
            >
              {hives.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          )}
          <button className="btn-ghost" onClick={handleExport} title="Export">
            <Download size={18} />
          </button>
          <button className="btn-primary" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Szinkron</span>
          </button>
        </div>
      </header>

      {msg && (
        <div className="mb-4 card px-4 py-2 text-sm text-honey-300 border-honey-700/50 bg-honey-950/30">
          {msg}
        </div>
      )}

      {/* Tabs */}
      <nav className="card flex overflow-x-auto mb-4 p-1">
        {([
          { id: 'dashboard', label: 'Műszerfal', icon: <LayoutDashboard size={16} /> },
          { id: 'weight', label: 'Súlyváltozás', icon: <TrendingUp size={16} /> },
          { id: 'seasons', label: 'Szezonok', icon: <Flower2 size={16} /> },
          { id: 'settings', label: 'Beállítások', icon: <SettingsIcon size={16} /> },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition ${
              tab === t.id ? 'bg-honey-500 text-slate-900' : 'text-slate-300 hover:bg-slate-700/40'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      {/* Time range bar (dashboard/weight only) */}
      {(tab === 'dashboard' || tab === 'weight') && (
        <div className="flex gap-1 mb-4 card p-1 w-fit">
          {(['24h', '7d', '30d', 'all'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                range === r ? 'bg-honey-500 text-slate-900' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r === '24h' ? '24 óra' : r === '7d' ? '7 nap' : r === '30d' ? '30 nap' : 'Mind'}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <main>
        {tab === 'dashboard' && stats && <Dashboard stats={stats} batteryWarnV={batteryWarnV} range={range} />}
        {tab === 'weight' && stats && <WeightChange diffs={stats.daily_diffs} />}
        {tab === 'seasons' && (
          <Seasons
            hiveId={hiveId}
            seasons={seasons}
            flowers={flowers}
            onChange={() => loadAll(hiveId)}
            notify={notify}
          />
        )}
        {tab === 'settings' && hive && settings && (
          <SettingsPage
            hive={hive}
            flowers={flowers}
            settings={settings}
            onChange={() => loadAll(hiveId)}
            notify={notify}
          />
        )}
      </main>

      <footer className="mt-10 text-center text-xs text-slate-500">
        Kaptár Dashboard · PWA · Forrás: kaptargsm.hu
      </footer>
    </div>
  )
}
