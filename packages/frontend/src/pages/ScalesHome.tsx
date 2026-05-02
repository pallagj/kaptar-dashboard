import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, LogOut, Settings, Plus } from 'lucide-react'
import { api, type Scale, type Settings as S } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ScaleCard } from '../components/ScaleCard'
import { Modal } from '../components/Modal'

export function ScalesHome() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [scales, setScales] = useState<Scale[]>([])
  const [settings, setSettings] = useState<S | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const msgTimer = useRef<number | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [newScaleId, setNewScaleId] = useState('')
  const [newScaleName, setNewScaleName] = useState('')
  const [newScaleType, setNewScaleType] = useState<Scale['source_type']>('kaptargsm')
  const [newScaleUrl, setNewScaleUrl] = useState('')
  const [newScalePhone, setNewScalePhone] = useState('')

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

  function openAdd() {
    setNewScaleId(crypto.randomUUID())
    setNewScaleName('')
    setNewScaleType('kaptargsm')
    setNewScaleUrl('')
    setNewScalePhone('')
    setAddOpen(true)
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
            <button className="btn-primary" onClick={openAdd}>
              <Plus size={18} />
              <span className="hidden sm:inline">Mérleg</span>
            </button>
            <button className="btn-primary" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Szinkron</span>
            </button>
            <button className="btn-ghost" onClick={() => navigate('/settings')} title="Beállítások">
              <Settings size={18} />
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
          <div className="card p-10 text-center space-y-4">
            <p className="text-slate-300">Még nincsenek mérlegek konfigurálva.</p>
            <button className="btn-primary" onClick={openAdd}>
              <Plus size={18} /> Mérleg hozzáadása
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scales.map(s => (
              <ScaleCard key={s.id} scale={s} batteryWarnV={batteryWarnV} />
            ))}
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Mérleg hozzáadása">
        <label className="block text-xs text-slate-400 mb-1">Típus</label>
        <select className="input mb-3" value={newScaleType}
          onChange={e => setNewScaleType(e.target.value as Scale['source_type'])}>
          <option value="kaptargsm">KaptárGSM (automatikus szinkron)</option>
          <option value="sms">SMS beküldés</option>
          <option value="manual">Manuális</option>
        </select>
        <label className="block text-xs text-slate-400 mb-1">Név</label>
        <input className="input mb-3" value={newScaleName}
          onChange={e => setNewScaleName(e.target.value)} placeholder="pl. Első kaptár" />
        {newScaleType === 'kaptargsm' && (
          <>
            <label className="block text-xs text-slate-400 mb-1">Forrás URL</label>
            <input className="input mb-4" value={newScaleUrl}
              onChange={e => setNewScaleUrl(e.target.value)}
              placeholder="https://www.kaptargsm.hu/scale/AZONOSÍTÓ.php" />
          </>
        )}
        {newScaleType === 'sms' && (
          <>
            <label className="block text-xs text-slate-400 mb-1">Feladó telefonszám</label>
            <input className="input mb-4" value={newScalePhone}
              onChange={e => setNewScalePhone(e.target.value)}
              placeholder="+36301234567" />
          </>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setAddOpen(false)}>Mégse</button>
          <button
            className="btn-primary"
            disabled={!newScaleName.trim()}
            onClick={async () => {
              try {
                await api.createScale({
                  id: newScaleId,
                  name: newScaleName.trim(),
                  source_type: newScaleType,
                  source_url: newScaleType === 'kaptargsm' ? newScaleUrl.trim() || undefined : undefined,
                  phone_number: newScaleType === 'sms' ? newScalePhone.trim() || undefined : undefined,
                })
                setAddOpen(false)
                notify('Mérleg hozzáadva')
                await load()
              } catch (e: any) { notify('Hiba: ' + e.message) }
            }}
          >
            Hozzáadás
          </button>
        </div>
      </Modal>
    </div>
  )
}
