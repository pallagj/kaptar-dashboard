import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Bell, BellOff } from 'lucide-react'
import { api, getAuthToken, setAuthToken, type Flower, type Settings as S } from '../lib/api'
import { useAuth } from '../lib/auth'
import { getPushStatus, subscribe as pushSubscribe, unsubscribe as pushUnsubscribe } from '../lib/push'
import { ADMIN_TOKEN_KEY } from '../App'

export function GlobalSettings() {
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [settings, setSettings] = useState<S | null>(null)
  const [flowers, setFlowers] = useState<Flower[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const [syncMin, setSyncMin] = useState('')
  const [swarmKg, setSwarmKg] = useState('')
  const [batteryV, setBatteryV] = useState('')
  const [newFlowerName, setNewFlowerName] = useState('')

  const [pushStatus, setPushStatus] = useState<Awaited<ReturnType<typeof getPushStatus>> | 'loading'>('loading')
  const [pushBusy, setPushBusy] = useState(false)

  function notify(m: string) {
    setMsg(m)
    setTimeout(() => setMsg(''), 3500)
  }

  async function load() {
    try {
      const [s, f] = await Promise.all([api.settings(), api.flowers()])
      setSettings(s)
      setFlowers(f)
      setSyncMin(s.sync_interval_minutes)
      setSwarmKg(s.swarm_alert_kg)
      setBatteryV(s.battery_warn_v)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { getPushStatus().then(setPushStatus) }, [])

  if (loading) return null

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 w-full max-w-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">
        <header className="flex items-center gap-3">
          <button className="btn-ghost" onClick={() => navigate('/')}><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-xl font-bold">Beállítások</h1>
            {user && <p className="text-xs text-slate-400">{user.email}</p>}
          </div>
        </header>

        {msg && (
          <div className="card px-4 py-2 text-sm text-honey-300 border-honey-700/50 bg-honey-950/30">{msg}</div>
        )}

        {/* Szinkron & riasztások */}
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-4">Szinkron &amp; riasztások</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Szinkron gyakoriság</label>
              <select className="input" value={syncMin} onChange={e => setSyncMin(e.target.value)}>
                <option value="15">15 perc</option>
                <option value="30">30 perc</option>
                <option value="60">1 óra</option>
                <option value="120">2 óra</option>
                <option value="360">6 óra</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">A rendszer 15 percenként ellenőrzi, hogy lejárt-e az intervallum.</p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Rajzás-riasztás küszöb (kg)</label>
              <input className="input" type="number" step="0.1" value={swarmKg} onChange={e => setSwarmKg(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Akku figyelmeztetés (V)</label>
              <input className="input" type="number" step="0.1" value={batteryV} onChange={e => setBatteryV(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={async () => {
              await api.updateSettings({
                sync_interval_minutes: Number(syncMin),
                swarm_alert_kg: Number(swarmKg),
                battery_warn_v: Number(batteryV),
              })
              notify('Beállítások mentve')
              load()
            }}>
              Mentés
            </button>
          </div>
        </section>

        {/* Push értesítések */}
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Bell size={18} className="text-slate-400" />
            <h2 className="text-lg font-bold">Értesítések</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Push értesítés rajzás-gyanús súlyesés esetén. iOS-en csak telepített PWA-ként működik.
          </p>
          {pushStatus === 'loading' && <p className="text-sm text-slate-400">Állapot lekérdezése…</p>}
          {pushStatus === 'unsupported' && <p className="text-sm text-amber-300">A böngésző nem támogatja a push értesítéseket.</p>}
          {pushStatus === 'denied' && <p className="text-sm text-red-300">Az értesítések letiltva. Engedélyezd a rendszerbeállításokban.</p>}
          {(pushStatus === 'default' || pushStatus === 'not_subscribed') && (
            <button className="btn-primary" disabled={pushBusy} onClick={async () => {
              setPushBusy(true)
              try { await pushSubscribe(); notify('Értesítések bekapcsolva'); setPushStatus(await getPushStatus()) }
              catch (e: any) { notify('Hiba: ' + e.message) }
              finally { setPushBusy(false) }
            }}>
              <Bell size={18} /> Értesítések bekapcsolása
            </button>
          )}
          {pushStatus === 'subscribed' && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-emerald-400 self-center">● Bekapcsolva</span>
              <button className="btn-ghost" disabled={pushBusy} onClick={async () => {
                try { const r = await api.pushTest(); notify(r.sent > 0 ? 'Teszt elküldve' : 'Nincs aktív feliratkozás') }
                catch (e: any) { notify('Hiba: ' + e.message) }
              }}>Teszt</button>
              <button className="btn-ghost" disabled={pushBusy} onClick={async () => {
                if (!confirm('Kikapcsolod a push értesítéseket?')) return
                setPushBusy(true)
                try { await pushUnsubscribe(); notify('Kikapcsolva'); setPushStatus(await getPushStatus()) }
                catch (e: any) { notify('Hiba: ' + e.message) }
                finally { setPushBusy(false) }
              }}><BellOff size={18} /> Kikapcsolás</button>
            </div>
          )}
        </section>

        {/* Admin */}
        {user?.email === 'pallagj@gmail.com' && (
          <AdminSection notify={notify} navigate={navigate} refresh={refresh} />
        )}

        {/* Virágok */}
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-3">Virágok katalógus</h2>
          <div className="flex gap-2 mb-4">
            <input
              className="input flex-1"
              placeholder="Új virág neve (pl. Akác)"
              value={newFlowerName}
              onChange={e => setNewFlowerName(e.target.value)}
            />
            <button className="btn-primary shrink-0" disabled={!newFlowerName.trim()}
              onClick={async () => {
                const name = newFlowerName.trim()
                const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
                await api.createFlower({ id, name })
                setNewFlowerName('')
                notify('Virág hozzáadva')
                load()
              }}>
              <Plus size={18} />
            </button>
          </div>
          <ul className="divide-y divide-slate-800">
            {flowers.map(f => (
              <li key={f.id} className="py-2 flex items-center justify-between">
                <span>{f.name}</span>
                <button className="text-slate-400 hover:text-red-400" onClick={async () => {
                  if (!confirm(`Törlöd a(z) "${f.name}" virágot?`)) return
                  await api.deleteFlower(f.id)
                  notify('Törölve')
                  load()
                }}><Trash2 size={18} /></button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function AdminSection({
  notify,
  navigate,
  refresh,
}: {
  notify: (m: string) => void
  navigate: (path: string) => void
  refresh: () => Promise<void>
}) {
  const [users, setUsers] = useState<{ id: number; email: string; name: string }[]>([])

  useEffect(() => {
    api.adminUsers().then(setUsers).catch((e: any) => notify('Admin hiba: ' + e.message))
  }, [])

  return (
    <section className="card p-5 border border-amber-700/40">
      <h2 className="text-lg font-bold text-amber-400 mb-3">Admin — impersonálás</h2>
      <ul className="divide-y divide-slate-800">
        {users.filter(u => u.email !== 'pallagj@gmail.com').map(u => (
          <li key={u.id} className="py-2 flex items-center justify-between gap-3">
            <div>
              <span className="text-slate-200">{u.name || '—'}</span>
              <span className="text-xs text-slate-500 ml-2">{u.email}</span>
            </div>
            <button
              className="btn-ghost text-amber-400 shrink-0"
              onClick={async () => {
                const adminToken = getAuthToken()!
                sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken)
                const res = await api.adminImpersonate(u.id)
                setAuthToken(res.token)
                await refresh()
                navigate('/')
              }}
            >
              Belépés nevében
            </button>
          </li>
        ))}
        {users.filter(u => u.email !== 'pallagj@gmail.com').length === 0 && (
          <li className="py-2 text-sm text-slate-500">Még nincs más felhasználó.</li>
        )}
      </ul>
    </section>
  )
}
