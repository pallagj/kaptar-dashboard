import { useState } from 'react'
import { Plus, Trash2, Scale, Pencil, History } from 'lucide-react'
import { api, type Flower, type Hive, type Settings as S, type TareEvent } from '../lib/api'
import { Modal } from '../components/Modal'
import { fmtDate } from '../lib/format'

interface Props {
  hive: Hive
  flowers: Flower[]
  settings: S
  tareEvents: TareEvent[]
  latestRaw: number | null
  onChange: () => void
  notify: (m: string) => void
}

export function SettingsPage({ hive, flowers, settings, tareEvents, latestRaw, onChange, notify }: Props) {
  const [newFlowerName, setNewFlowerName] = useState('')
  const [tareOpen, setTareOpen] = useState(false)
  const [tareRaw, setTareRaw] = useState('')
  const [tareTarget, setTareTarget] = useState('')
  const [tareNote, setTareNote] = useState('')

  function openTare() {
    setTareRaw(latestRaw !== null ? latestRaw.toFixed(2) : '')
    setTareTarget('')
    setTareNote('')
    setTareOpen(true)
  }

  const [hiveOpen, setHiveOpen] = useState(false)
  const [hiveName, setHiveName] = useState(hive.name)
  const [hiveUrl, setHiveUrl] = useState(hive.source_url)

  const [alertsOpen, setAlertsOpen] = useState(false)
  const [syncMin, setSyncMin] = useState(String(settings.sync_interval_minutes))
  const [swarmKg, setSwarmKg] = useState(String(settings.swarm_alert_kg))
  const [batteryV, setBatteryV] = useState(String(settings.battery_warn_v))

  function openHiveEdit() {
    setHiveName(hive.name)
    setHiveUrl(hive.source_url)
    setHiveOpen(true)
  }

  function openAlertsEdit() {
    setSyncMin(String(settings.sync_interval_minutes))
    setSwarmKg(String(settings.swarm_alert_kg))
    setBatteryV(String(settings.battery_warn_v))
    setAlertsOpen(true)
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex items-start justify-between mb-3 gap-3">
          <div>
            <h2 className="text-lg font-bold">Kaptár</h2>
            <p className="text-sm text-slate-400">A forrás URL-ről parse-olja a backend a méréseket.</p>
          </div>
          <button className="btn-ghost shrink-0" onClick={openHiveEdit} title="Szerkesztés" aria-label="Szerkesztés">
            <Pencil size={16} />
          </button>
        </div>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          <Field label="Név" value={hive.name} />
          <Field label="Forrás URL" value={hive.source_url} mono />
          <Field label="Tára-eltolás" value={`${hive.tare_offset.toFixed(2)} kg`} mono />
        </dl>
        <div className="mt-4">
          <button className="btn-ghost" onClick={openTare}>
            <Scale size={18} /> Tárázás
          </button>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <History size={18} className="text-slate-400" />
          <h2 className="text-lg font-bold">Tára történet</h2>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Minden tárázás az adott időponttól érvényes — a korábbi mérések nettó értékét nem írja át.
          Ha törölsz egy eseményt, az akkori „eltolás" visszavonódik a múltra.
        </p>
        {tareEvents.length === 0 ? (
          <p className="text-sm text-slate-400">Még nincs tára-esemény rögzítve.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-3 py-2 text-left text-slate-300">Mikor</th>
                <th className="px-3 py-2 text-right text-slate-300">Cél nettó</th>
                <th className="px-3 py-2 text-right text-slate-300">Eltolás</th>
                <th className="px-3 py-2 text-left text-slate-300">Megjegyzés</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {[...tareEvents].reverse().map(ev => (
                <tr key={ev.id} className="border-b border-slate-800">
                  <td className="px-3 py-2">{fmtDate(ev.timestamp)}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {ev.target_net !== null ? `${ev.target_net.toFixed(2)} kg` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{ev.offset.toFixed(2)} kg</td>
                  <td className="px-3 py-2 text-slate-400">{ev.note ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="text-slate-400 hover:text-red-400"
                      title="Esemény törlése"
                      onClick={async () => {
                        if (!confirm('Biztosan törlöd ezt a tára-eseményt? Az utána készült mérések nettó értéke a korábbi offsethez igazodik.')) return
                        await api.deleteTareEvent(ev.id)
                        notify('Tára-esemény törölve')
                        onChange()
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card p-5">
        <div className="flex items-start justify-between mb-3 gap-3">
          <div>
            <h2 className="text-lg font-bold">Szinkron & riasztások</h2>
            <p className="text-sm text-slate-400">A háttérben fut a backend scheduler. A forrás kb. óránként frissül.</p>
          </div>
          <button className="btn-ghost shrink-0" onClick={openAlertsEdit} title="Szerkesztés" aria-label="Szerkesztés">
            <Pencil size={16} />
          </button>
        </div>
        <dl className="grid sm:grid-cols-3 gap-3 text-sm">
          <Field label="Szinkron gyakoriság" value={`${settings.sync_interval_minutes} perc`} mono />
          <Field label="Rajzás-riasztás küszöb" value={`${settings.swarm_alert_kg} kg`} mono />
          <Field label="Akku figyelmeztetés" value={`${settings.battery_warn_v} V`} mono />
        </dl>
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
                  if (!confirm(`Biztosan törlöd a(z) "${f.name}" virágot?`)) return
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

      <Modal open={hiveOpen} onClose={() => setHiveOpen(false)} title="Kaptár szerkesztése">
        <label className="block text-xs text-slate-400 mb-1">Név</label>
        <input className="input mb-3" value={hiveName} onChange={e => setHiveName(e.target.value)} />
        <label className="block text-xs text-slate-400 mb-1">Forrás URL</label>
        <input className="input mb-4" value={hiveUrl} onChange={e => setHiveUrl(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setHiveOpen(false)}>Mégse</button>
          <button
            className="btn-primary"
            onClick={async () => {
              await api.updateHive(hive.id, { name: hiveName, source_url: hiveUrl })
              setHiveOpen(false)
              notify('Kaptár frissítve')
              onChange()
            }}
          >
            Mentés
          </button>
        </div>
      </Modal>

      <Modal open={alertsOpen} onClose={() => setAlertsOpen(false)} title="Szinkron & riasztások szerkesztése">
        <label className="block text-xs text-slate-400 mb-1">Szinkron gyakoriság (perc)</label>
        <input className="input mb-3" type="number" min={5} value={syncMin} onChange={e => setSyncMin(e.target.value)} />
        <label className="block text-xs text-slate-400 mb-1">Rajzás-riasztás küszöb (kg)</label>
        <input className="input mb-3" type="number" step="0.1" value={swarmKg} onChange={e => setSwarmKg(e.target.value)} />
        <label className="block text-xs text-slate-400 mb-1">Akku figyelmeztetés (V)</label>
        <input className="input mb-4" type="number" step="0.1" value={batteryV} onChange={e => setBatteryV(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setAlertsOpen(false)}>Mégse</button>
          <button
            className="btn-primary"
            onClick={async () => {
              await api.updateSettings({
                sync_interval_minutes: Number(syncMin),
                swarm_alert_kg: Number(swarmKg),
                battery_warn_v: Number(batteryV),
              })
              setAlertsOpen(false)
              notify('Beállítások mentve')
              onChange()
            }}
          >
            Mentés
          </button>
        </div>
      </Modal>

      <Modal open={tareOpen} onClose={() => setTareOpen(false)} title="Tárázás / fiók hozzáadás">
        <p className="text-sm text-slate-300 mb-4">
          A múltbeli mérések <b>nem</b> módosulnak — az új eltolás innentől érvényes.
          Ha a mérleg azóta változott hogy az utolsó adat beérkezett (pl. most raktál rá fiókot),
          írd át a „Jelenlegi bruttó"-t arra amit tényleg kijelez a mérleg.
        </p>
        <label className="block text-xs text-slate-400 mb-1">
          Jelenlegi bruttó (kg) {latestRaw !== null && <span className="text-slate-500">— utolsó mért: {latestRaw.toFixed(2)}</span>}
        </label>
        <input
          className="input mb-3"
          type="number"
          step="0.1"
          placeholder="mit mutat most a mérleg"
          value={tareRaw}
          onChange={e => setTareRaw(e.target.value)}
        />
        <label className="block text-xs text-slate-400 mb-1">Kívánt nettó súly (kg)</label>
        <input
          className="input mb-3"
          type="number"
          step="0.1"
          placeholder="mennyi legyen kijelezve"
          value={tareTarget}
          onChange={e => setTareTarget(e.target.value)}
        />
        {tareRaw && tareTarget && (
          <p className="text-xs text-slate-400 mb-3">
            Új eltolás: <span className="font-mono text-slate-200">{(Number(tareRaw) - Number(tareTarget)).toFixed(2)} kg</span>
          </p>
        )}
        <label className="block text-xs text-slate-400 mb-1">Megjegyzés (opcionális)</label>
        <input
          className="input mb-4"
          placeholder="pl. új fiók hozzáadása"
          value={tareNote}
          onChange={e => setTareNote(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setTareOpen(false)}>Mégse</button>
          <button
            className="btn-primary"
            disabled={!tareTarget || !tareRaw}
            onClick={async () => {
              const raw = Number(tareRaw)
              const tgt = Number(tareTarget)
              if (!confirm(`Tárázás: bruttó ${raw.toFixed(2)} kg → nettó ${tgt.toFixed(2)} kg (eltolás ${(raw - tgt).toFixed(2)} kg). Folytatod?`)) return
              await api.tare(hive.id, tgt, raw, tareNote.trim() || undefined)
              setTareOpen(false)
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

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-400 mb-1">{label}</dt>
      <dd className={`text-slate-200 break-all ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
