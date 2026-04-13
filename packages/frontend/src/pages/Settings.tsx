import { useState } from 'react'
import { Plus, Trash2, Save, Scale } from 'lucide-react'
import { api, type Flower, type Hive, type Settings as S } from '../lib/api'
import { Modal } from '../components/Modal'

interface Props {
  hive: Hive
  flowers: Flower[]
  settings: S
  onChange: () => void
  notify: (m: string) => void
}

export function SettingsPage({ hive, flowers, settings, onChange, notify }: Props) {
  const [newFlowerName, setNewFlowerName] = useState('')
  const [syncMin, setSyncMin] = useState(settings.sync_interval_minutes)
  const [swarmKg, setSwarmKg] = useState(settings.swarm_alert_kg)
  const [batteryV, setBatteryV] = useState(settings.battery_warn_v)
  const [tareOpen, setTareOpen] = useState(false)
  const [tareTarget, setTareTarget] = useState('')
  const [hiveName, setHiveName] = useState(hive.name)
  const [hiveUrl, setHiveUrl] = useState(hive.source_url)

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="text-lg font-bold mb-1">Kaptár</h2>
        <p className="text-sm text-slate-400 mb-4">A forrás URL-ről parse-olja a backend a méréseket.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Név</label>
            <input className="input" value={hiveName} onChange={e => setHiveName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Forrás URL</label>
            <input className="input" value={hiveUrl} onChange={e => setHiveUrl(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex gap-2 flex-wrap">
          <button
            className="btn-primary"
            onClick={async () => {
              await api.updateHive(hive.id, { name: hiveName, source_url: hiveUrl })
              notify('Kaptár frissítve')
              onChange()
            }}
          >
            <Save size={18} /> Mentés
          </button>
          <button className="btn-ghost" onClick={() => setTareOpen(true)}>
            <Scale size={18} /> Tárázás
          </button>
          <span className="text-sm text-slate-400 self-center">
            Jelenlegi tára-eltolás: <span className="text-slate-200 font-mono">{hive.tare_offset.toFixed(2)} kg</span>
          </span>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold mb-1">Szinkron & riasztások</h2>
        <p className="text-sm text-slate-400 mb-4">A háttérben fut a backend scheduler. A forrás kb. óránként frissül.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Szinkron gyakoriság (perc)</label>
            <input className="input" type="number" min={5} value={syncMin} onChange={e => setSyncMin(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Rajzás-riasztás küszöb (kg)</label>
            <input className="input" type="number" step="0.1" value={swarmKg} onChange={e => setSwarmKg(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Akku figyelmeztetés (V)</label>
            <input className="input" type="number" step="0.1" value={batteryV} onChange={e => setBatteryV(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <button
            className="btn-primary"
            onClick={async () => {
              await api.updateSettings({
                sync_interval_minutes: Number(syncMin),
                swarm_alert_kg: Number(swarmKg),
                battery_warn_v: Number(batteryV),
              })
              notify('Beállítások mentve')
              onChange()
            }}
          >
            <Save size={18} /> Mentés
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold mb-3">Virágok</h2>
        <div className="flex gap-2 mb-4">
          <input
            className="input flex-1"
            placeholder="Új virág neve (pl. Akác)"
            value={newFlowerName}
            onChange={e => setNewFlowerName(e.target.value)}
          />
          <button
            className="btn-primary shrink-0"
            disabled={!newFlowerName.trim()}
            onClick={async () => {
              const name = newFlowerName.trim()
              const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
              await api.createFlower({ id, name })
              setNewFlowerName('')
              notify('Hozzáadva')
              onChange()
            }}
          >
            <Plus size={18} />
          </button>
        </div>
        <ul className="divide-y divide-slate-800">
          {flowers.map(f => (
            <li key={f.id} className="py-2 flex items-center justify-between">
              <span>{f.name}</span>
              <button
                className="text-slate-400 hover:text-red-400"
                onClick={async () => {
                  if (!confirm(`Törlöd: ${f.name}?`)) return
                  await api.deleteFlower(f.id)
                  notify('Törölve')
                  onChange()
                }}
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Modal open={tareOpen} onClose={() => setTareOpen(false)} title="Tárázás / fiók hozzáadás">
        <p className="text-sm text-slate-300 mb-4">
          Add meg, mennyi <b>kell hogy legyen</b> a mérleg súlya jelenleg (pl. új fiók hozzáadása után
          a rendszer újra a korábbi nettó értéket mutassa).
        </p>
        <input
          className="input mb-4"
          type="number"
          step="0.1"
          placeholder="Kívánt nettó súly (kg)"
          value={tareTarget}
          onChange={e => setTareTarget(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setTareOpen(false)}>Mégse</button>
          <button
            className="btn-primary"
            disabled={!tareTarget}
            onClick={async () => {
              await api.tare(hive.id, Number(tareTarget))
              setTareOpen(false)
              setTareTarget('')
              notify('Tárázás mentve')
              onChange()
            }}
          >
            Mentés
          </button>
        </div>
      </Modal>
    </div>
  )
}
