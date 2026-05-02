import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Flower2, Settings as SettingsIcon, RefreshCw, Download, ArrowLeft } from 'lucide-react'
import { api, type Flower, type Scale, type Season, type Settings as S, type Stats } from '../lib/api'
import { Dashboard } from './Dashboard'
import { Seasons } from './Seasons'
import { SettingsPage } from './Settings'

type Tab = 'dashboard' | 'seasons' | 'settings'
type Range = '24h' | '7d' | '30d' | 'all'

export function ScaleDetail() {
  const { scaleId } = useParams<{ scaleId: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [range, setRange] = useState<Range>('7d')
  const [scale, setScale] = useState<Scale | null>(null)
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

  const load = useCallback(async () => {
    if (!scaleId) return
    try {
      const [allScales, f, s] = await Promise.all([api.scales(), api.flowers(), api.settings()])
      const sc = allScales.find(x => x.id === scaleId)
      if (!sc) { navigate('/'); return }
      setScale(sc)
      setFlowers(f)
      setSettings(s)
      const [st, se] = await Promise.all([api.stats(scaleId), api.seasons(scaleId)])
      setStats(st)
      setSeasons(se)
    } catch (e: any) {
      notify('Hiba a betöltéskor: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [scaleId, navigate, notify])

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

  function handleExport() {
    if (!stats || !scaleId) return
    const blob = new Blob(
      [JSON.stringify({ scale: scaleId, exportedAt: Date.now(), stats }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kaptar-${scaleId}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-slate-300">
        <RefreshCw className="animate-spin mr-3" /> Betöltés…
      </div>
    )
  }

  if (!scale || !settings) return null

  const batteryWarnV = Number(settings.battery_warn_v)

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <header className="flex flex-wrap items-center gap-3 mb-6">
          <button className="btn-ghost" onClick={() => navigate('/')} title="Vissza">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-br from-honey-300 to-honey-500 bg-clip-text text-transparent">
              🐝 {scale.name}
            </h1>
            <p className="text-sm text-slate-400 truncate">{scale.id}</p>
          </div>
          <div className="flex items-center gap-2">
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

        <main>
          {tab === 'dashboard' && stats && (
            <Dashboard stats={stats} batteryWarnV={batteryWarnV} range={range} setRange={setRange} />
          )}
          {tab === 'seasons' && (
            <Seasons
              scaleId={scale.id}
              seasons={seasons}
              flowers={flowers}
              history={stats?.history ?? []}
              onChange={load}
              notify={notify}
            />
          )}
          {tab === 'settings' && (
            <SettingsPage
              scale={scale}
              flowers={flowers}
              settings={settings}
              tareEvents={stats?.tare_events ?? []}
              latestRaw={stats?.latest_raw ?? null}
              onChange={load}
              notify={notify}
            />
          )}
        </main>
      </div>

      <nav
        className="bottom-nav sticky bottom-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-700/50"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-6xl mx-auto flex">
          {([
            { id: 'dashboard', label: 'Műszerfal', icon: <LayoutDashboard size={22} /> },
            { id: 'seasons', label: 'Szezonok', icon: <Flower2 size={22} /> },
            { id: 'settings', label: 'Beállítások', icon: <SettingsIcon size={22} /> },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition ${
                tab === t.id ? 'text-honey-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.icon}
              <span className="text-[11px] font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
