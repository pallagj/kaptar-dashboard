import { useEffect, useState } from 'react'
import { Plus, Trash2, Scale, Pencil, History, Bell, BellOff } from 'lucide-react'
import { api, type Flower, type Hive, type Settings as S, type TareEvent } from '../lib/api'
import { Modal } from '../components/Modal'
import { fmtDate } from '../lib/format'
import { getPushStatus, subscribe as pushSubscribe, unsubscribe as pushUnsubscribe } from '../lib/push'

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
  const [tarePre, setTarePre] = useState('')
  const [tarePost, setTarePost] = useState('')
  const [tareTarget, setTareTarget] = useState('')
  const [tareAdvanced, setTareAdvanced] = useState(false)
  const [tareNote, setTareNote] = useState('')

  function openTare() {
    setTarePre(latestRaw !== null ? latestRaw.toFixed(2) : '')
    setTarePost('')
    setTareTarget('')
    setTareAdvanced(false)
    setTareNote('')
    setTareOpen(true)
  }

  const [pushStatus, setPushStatus] = useState<Awaited<ReturnType<typeof getPushStatus>> | 'loading'>('loading')
  const [pushBusy, setPushBusy] = useState(false)
  useEffect(() => { getPushStatus().then(setPushStatus) }, [])
  async function refreshPushStatus() { setPushStatus(await getPushStatus()) }

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
        <div className="flex items-center gap-2 mb-1">
          <Bell size={18} className="text-slate-400" />
          <h2 className="text-lg font-bold">Értesítések</h2>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Push értesítés a telefonra, ha a scraper rajzás-gyanús súlyesést érzékel.
          iOS-en csak akkor működik, ha a webapp a kezdőképernyőre telepítve van (✓).
        </p>
        {pushStatus === 'loading' && <p className="text-sm text-slate-400">Állapot lekérdezése…</p>}
        {pushStatus === 'unsupported' && (
          <p className="text-sm text-amber-300">A böngésző nem támogatja a push értesítéseket.</p>
        )}
        {pushStatus === 'denied' && (
          <p className="text-sm text-red-300">
            Az értesítések letiltva. A rendszer beállításaiban engedélyezd újra.
          </p>
        )}
        {(pushStatus === 'default' || pushStatus === 'not_subscribed') && (
          <button
            className="btn-primary"
            disabled={pushBusy}
            onClick={async () => {
              setPushBusy(true)
              try {
                await pushSubscribe()
                notify('Értesítések bekapcsolva')
                await refreshPushStatus()
              } catch (e: any) {
                notify('Hiba: ' + e.message)
              } finally { setPushBusy(false) }
            }}
          >
            <Bell size={18} /> Értesítések bekapcsolása
          </button>
        )}
        {pushStatus === 'subscribed' && (
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-emerald-400 self-center">● Bekapcsolva</span>
            <button
              className="btn-ghost"
              disabled={pushBusy}
              onClick={async () => {
                try {
                  const res = await api.pushTest()
                  notify(res.sent > 0 ? 'Teszt üzenet elküldve' : 'Nincs aktív feliratkozás')
                } catch (e: any) { notify('Hiba: ' + e.message) }
              }}
            >
              Teszt értesítés
            </button>
            <button
              className="btn-ghost"
              disabled={pushBusy}
              onClick={async () => {
                if (!confirm('Biztosan kikapcsolod a push értesítéseket?')) return
                setPushBusy(true)
                try {
                  await pushUnsubscribe()
                  notify('Értesítések kikapcsolva')
                  await refreshPushStatus()
                } catch (e: any) { notify('Hiba: ' + e.message) }
                finally { setPushBusy(false) }
              }}
            >
              <BellOff size={18} /> Kikapcsolás
            </button>
          </div>
        )}
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

      <Modal open={tareOpen} onClose={() => setTareOpen(false)} title="Fiók hozzáadása / eltávolítása">
        <p className="text-sm text-slate-300 mb-2">
          Amikor új fiókot raksz fel vagy veszel le, a mérleg bruttó értéke megugrik / leesik,
          de ez <b>nem méz</b>. Írd be a mérleg értékét közvetlenül a művelet <b>ELŐTT</b> és
          <b> UTÁN</b> — a rendszer úgy számolja az új tárát, hogy a nettó (mézgyűjtés) görbe
          folytonos maradjon.
        </p>
        <p className="text-sm text-amber-300/90 mb-4">
          Pörgetéskor <b>ne</b> használd ezt — ott szándékos, hogy a nettó leessen.
        </p>
        <label className="block text-xs text-slate-400 mb-1">
          Bruttó a művelet ELŐTT (kg)
          {latestRaw !== null && <span className="text-slate-500"> — utolsó mért: {latestRaw.toFixed(2)}</span>}
        </label>
        <input
          className="input mb-3"
          type="number"
          step="0.1"
          placeholder="mit mutatott a mérleg közvetlenül előtte"
          value={tarePre}
          onChange={e => setTarePre(e.target.value)}
        />
        <label className="block text-xs text-slate-400 mb-1">Bruttó a művelet UTÁN (kg)</label>
        <input
          className="input mb-3"
          type="number"
          step="0.1"
          placeholder="mit mutat most a mérleg"
          value={tarePost}
          onChange={e => setTarePost(e.target.value)}
        />
        {(() => {
          const pre = Number(tarePre)
          const post = Number(tarePost)
          if (!tarePre || !tarePost || !isFinite(pre) || !isFinite(post)) return null
          const preNet = pre - hive.tare_offset
          const boxDelta = post - pre
          const target = tareAdvanced && tareTarget ? Number(tareTarget) : preNet
          const newOffset = post - target
          return (
            <div className="text-xs text-slate-400 mb-3 space-y-1 rounded-lg bg-slate-800/50 p-3">
              <div>Fiók súlya (bruttó különbség): <span className="font-mono text-slate-200">{boxDelta >= 0 ? '+' : ''}{boxDelta.toFixed(2)} kg</span></div>
              <div>Nettó a művelet előtt: <span className="font-mono text-slate-200">{preNet.toFixed(2)} kg</span></div>
              <div>Nettó a művelet után (cél): <span className="font-mono text-slate-200">{target.toFixed(2)} kg</span></div>
              <div>Új tára-eltolás: <span className="font-mono text-slate-200">{newOffset.toFixed(2)} kg</span></div>
            </div>
          )
        })()}
        <button
          type="button"
          className="text-xs text-slate-400 hover:text-slate-200 mb-2"
          onClick={() => setTareAdvanced(v => !v)}
        >
          {tareAdvanced ? '▾' : '▸'} Haladó — cél nettó felülírása (kalibráció)
        </button>
        {tareAdvanced && (
          <>
            <p className="text-xs text-slate-500 mb-1">
              Csak akkor írd át, ha explicit 0-ra vagy más értékre kalibrálod (pl. szezonkezdés, tudod hogy most 0 kg méz van).
            </p>
            <input
              className="input mb-3"
              type="number"
              step="0.1"
              placeholder="cél nettó (kg) — üres = nettó változatlan"
              value={tareTarget}
              onChange={e => setTareTarget(e.target.value)}
            />
          </>
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
            disabled={!tarePre || !tarePost}
            onClick={async () => {
              const pre = Number(tarePre)
              const post = Number(tarePost)
              const tgt = tareAdvanced && tareTarget ? Number(tareTarget) : undefined
              const preNet = pre - hive.tare_offset
              const finalTarget = tgt !== undefined ? tgt : preNet
              const newOffset = post - finalTarget
              if (!confirm(
                `Művelet előtti bruttó: ${pre.toFixed(2)} kg\n` +
                `Művelet utáni bruttó: ${post.toFixed(2)} kg\n` +
                `Cél nettó: ${finalTarget.toFixed(2)} kg\n` +
                `Új eltolás: ${newOffset.toFixed(2)} kg\nFolytatod?`
              )) return
              await api.tare(hive.id, pre, post, tgt, tareNote.trim() || undefined)
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
