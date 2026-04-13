import { useMemo, useState } from 'react'
import { Flower2, Plus, Trash2, StopCircle } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { api, type Flower, type Season } from '../lib/api'
import { Modal } from '../components/Modal'
import { ChartToggle } from '../components/ChartToggle'
import { fmtSigned, daysBetween } from '../lib/format'

const COLORS = ['#f59e0b', '#10b981', '#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#60a5fa']

interface Props {
  hiveId: string
  seasons: Season[]
  flowers: Flower[]
  onChange: () => void
  notify: (m: string) => void
}

export function Seasons({ hiveId, seasons, flowers, onChange, notify }: Props) {
  const [showStart, setShowStart] = useState(false)
  const [selectedFlower, setSelectedFlower] = useState('')
  const [pieView, setPieView] = useState<'chart' | 'table'>('chart')

  const pieData = useMemo(() => {
    const map = new Map<string, number>()
    seasons.forEach(s => {
      if (s.end_ts && s.end_weight !== null) {
        const gain = s.end_weight - s.start_weight
        if (gain > 0) {
          const name = s.flower_name ?? s.flower_id
          map.set(name, (map.get(name) ?? 0) + gain)
        }
      }
    })
    return [...map.entries()].map(([name, value]) => ({ name, value }))
  }, [seasons])

  const totalGain = pieData.reduce((a, b) => a + b.value, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">Összes hozam</div>
          <div className="text-3xl font-bold text-emerald-400">+{totalGain.toFixed(2)} kg</div>
        </div>
        <button className="btn-primary" onClick={() => setShowStart(true)}>
          <Plus size={18} /> Új szezon indítása
        </button>
      </div>

      {pieData.length > 0 && (
        <div className="card p-2 pt-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm uppercase tracking-wider text-slate-400">Termelés virágonként</h3>
            <ChartToggle view={pieView} setView={setPieView} />
          </div>
          {pieView === 'chart' ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid #334155', borderRadius: 8 }}
                  formatter={(v: number) => `${v.toFixed(2)} kg`}
                />
                <Legend wrapperStyle={{ color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-4 py-2 text-left text-slate-300">Virág</th>
                  <th className="px-4 py-2 text-right text-slate-300">Hozam</th>
                  <th className="px-4 py-2 text-right text-slate-300">Arány</th>
                </tr>
              </thead>
              <tbody>
                {pieData.map((p, i) => (
                  <tr key={p.name} className="border-b border-slate-800">
                    <td className="px-4 py-2 flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      {p.name}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-400">+{p.value.toFixed(2)} kg</td>
                    <td className="px-4 py-2 text-right text-slate-400">{((p.value / totalGain) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="max-h-[500px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left">Virág</th>
                <th className="px-4 py-2 text-left">Kezdet</th>
                <th className="px-4 py-2 text-left">Vég</th>
                <th className="px-4 py-2 text-right">Napok</th>
                <th className="px-4 py-2 text-right">Hozam</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {seasons.map(s => {
                const active = s.end_ts === null
                const gain = active ? null : (s.end_weight ?? 0) - s.start_weight
                const days = s.end_ts ? daysBetween(s.start_ts, s.end_ts) : null
                return (
                  <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="px-4 py-2 font-semibold">
                      {s.flower_name ?? s.flower_id}
                      {active && <span className="ml-2 text-xs text-honey-400">● aktív</span>}
                    </td>
                    <td className="px-4 py-2">{new Date(s.start_ts).toLocaleDateString('hu-HU')}</td>
                    <td className="px-4 py-2">{s.end_ts ? new Date(s.end_ts).toLocaleDateString('hu-HU') : '—'}</td>
                    <td className="px-4 py-2 text-right">{days ?? '—'}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${gain !== null && gain >= 0 ? 'text-emerald-400' : gain !== null ? 'text-red-400' : 'text-slate-400'}`}>
                      {gain !== null ? fmtSigned(gain) : 'folyamatban'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {active ? (
                        <button
                          className="text-slate-400 hover:text-amber-400"
                          title="Szezon lezárása"
                          onClick={async () => {
                            if (!confirm(`Biztosan lezárod a(z) "${s.flower_name ?? s.flower_id}" szezont?`)) return
                            await api.closeSeason(hiveId)
                            notify('Szezon lezárva')
                            onChange()
                          }}
                        >
                          <StopCircle size={18} />
                        </button>
                      ) : (
                        <button
                          className="text-slate-400 hover:text-red-400"
                          title="Törlés"
                          onClick={async () => {
                            if (!confirm('Biztosan törlöd ezt a szezont?')) return
                            await api.deleteSeason(s.id)
                            notify('Szezon törölve')
                            onChange()
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {seasons.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">Még nincs szezon rögzítve.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showStart} onClose={() => setShowStart(false)} title="Új szezon indítása">
        <p className="text-slate-300 mb-4 text-sm">
          Az aktuális súly lesz a kezdőérték. Ha van folyamatban lévő szezon, az automatikusan lezárul.
        </p>
        <label className="block text-sm text-slate-300 mb-1">Virág</label>
        <select
          className="input mb-4"
          value={selectedFlower}
          onChange={e => setSelectedFlower(e.target.value)}
        >
          <option value="">Válassz…</option>
          {flowers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setShowStart(false)}>Mégse</button>
          <button
            className="btn-primary"
            disabled={!selectedFlower}
            onClick={async () => {
              try {
                await api.startSeason(hiveId, selectedFlower)
                notify('Új szezon indítva')
                setShowStart(false)
                setSelectedFlower('')
                onChange()
              } catch (e: any) {
                notify('Hiba: ' + e.message)
              }
            }}
          >
            <Flower2 size={18} /> Indítás
          </button>
        </div>
      </Modal>
    </div>
  )
}
