import { useMemo, useState } from 'react'
import { Flower2, Plus, Trash2, StopCircle } from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { api, type Flower, type Season, type Measurement } from '../lib/api'
import { Modal } from '../components/Modal'
import { ChartToggle } from '../components/ChartToggle'
import { fmtSigned, daysBetween } from '../lib/format'

const COLORS = ['#f59e0b', '#10b981', '#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#60a5fa']

interface Props {
  hiveId: string
  seasons: Season[]
  flowers: Flower[]
  history: Measurement[]
  onChange: () => void
  notify: (m: string) => void
}

export function Seasons({ hiveId, seasons, flowers, history, onChange, notify }: Props) {
  const [showStart, setShowStart] = useState(false)
  const [selectedFlower, setSelectedFlower] = useState('')
  const [pieView, setPieView] = useState<'chart' | 'table'>('chart')

  // Flowers that have at least one season recorded — for the comparison dropdown.
  const flowersWithSeasons = useMemo(() => {
    const ids = new Set(seasons.map(s => s.flower_id))
    return flowers.filter(f => ids.has(f.id))
  }, [flowers, seasons])
  const [compareFlower, setCompareFlower] = useState('')
  const effectiveCompareFlower = compareFlower || flowersWithSeasons[0]?.id || ''

  const compareData = useMemo(() => {
    if (!effectiveCompareFlower || !history.length) return { series: [], maxDay: 0 }
    const seasonsOfFlower = seasons.filter(s => s.flower_id === effectiveCompareFlower)
    if (!seasonsOfFlower.length) return { series: [], maxDay: 0 }
    // history is newest-first; sort asc for easier walking
    const hAsc = [...history].sort((a, b) => a.timestamp - b.timestamp)
    let maxDay = 0
    const series = seasonsOfFlower.map(s => {
      const endTs = s.end_ts ?? hAsc[hAsc.length - 1]?.timestamp ?? s.start_ts
      // keep last measurement per day during the season
      const byDay = new Map<number, { t: number; w: number }>()
      for (const m of hAsc) {
        if (m.timestamp < s.start_ts || m.timestamp > endTs) continue
        const day = Math.floor((m.timestamp - s.start_ts) / 86400000)
        const prev = byDay.get(day)
        if (!prev || m.timestamp > prev.t) byDay.set(day, { t: m.timestamp, w: m.weight })
      }
      const points = [...byDay.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([day, v]) => ({ day, gain: +(v.w - s.start_weight).toFixed(2) }))
      if (points.length && points[0].day > 0) points.unshift({ day: 0, gain: 0 })
      else if (!points.length) points.push({ day: 0, gain: 0 })
      const label = `${s.flower_name ?? s.flower_id} ${new Date(s.start_ts).getFullYear()}`
      const last = points[points.length - 1]
      if (last.day > maxDay) maxDay = last.day
      return { id: s.id, label, active: s.end_ts === null, points }
    })
    return { series, maxDay }
  }, [effectiveCompareFlower, seasons, history])

  // Merge series into one dataset by day for Recharts (one column per season).
  const mergedCompare = useMemo(() => {
    if (!compareData.series.length) return []
    const rows: Record<string, number | null>[] = []
    for (let d = 0; d <= compareData.maxDay; d++) {
      const row: Record<string, number | null> = { day: d }
      for (const s of compareData.series) {
        // use last-known gain up to this day (step interpolation)
        let val: number | null = null
        for (const p of s.points) {
          if (p.day <= d) val = p.gain
          else break
        }
        row[s.label] = val
      }
      rows.push(row)
    }
    return rows
  }, [compareData])

  // Latest net weight (history is already net from backend apply_offsets)
  const latestNet = useMemo(() => {
    if (!history.length) return null
    return history.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)).weight
  }, [history])

  // Per-season gain: closed → end-start; active → latest-start
  const seasonGain = (s: Season): number | null => {
    if (s.end_ts && s.end_weight !== null) return s.end_weight - s.start_weight
    if (latestNet !== null) return latestNet - s.start_weight
    return null
  }

  const pieData = useMemo(() => {
    const map = new Map<string, number>()
    seasons.forEach(s => {
      const g = seasonGain(s)
      if (g !== null && g > 0) {
        const name = s.flower_name ?? s.flower_id
        map.set(name, (map.get(name) ?? 0) + g)
      }
    })
    return [...map.entries()].map(([name, value]) => ({ name, value }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasons, latestNet])

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

      {flowersWithSeasons.length > 0 && (
        <div className="card p-2 pt-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 px-2 sm:px-0 gap-2 flex-wrap">
            <h3 className="text-sm uppercase tracking-wider text-slate-400">Összehasonlítás virág szerint</h3>
            <select
              className="input !py-1.5 !w-auto text-sm"
              value={effectiveCompareFlower}
              onChange={e => setCompareFlower(e.target.value)}
            >
              {flowersWithSeasons.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          {compareData.series.length === 0 ? (
            <p className="text-sm text-slate-400 px-2 py-6 text-center">Nincs adat ehhez a virághoz.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={mergedCompare} margin={{ top: 10, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="day"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={(d: number) => `${d}. nap`}
                  minTickGap={24}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  width={34}
                  tickFormatter={(v: number) => `${v}`}
                />
                <Tooltip
                  contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid #334155', borderRadius: 8 }}
                  labelFormatter={(d: number) => `${d}. nap`}
                  formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)} kg`, '']}
                />
                <Legend wrapperStyle={{ color: '#94a3b8' }} />
                {compareData.series.map((s, i) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.label}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2.5}
                    strokeDasharray={s.active ? '4 3' : undefined}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

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
                const gain = seasonGain(s)
                const days = active
                  ? (latestNet !== null && history.length
                      ? daysBetween(s.start_ts, history.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)).timestamp)
                      : null)
                  : daysBetween(s.start_ts, s.end_ts!)
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
                      {gain !== null ? fmtSigned(gain) : '—'}
                      {active && gain !== null && <span className="ml-1 text-xs text-slate-500">(eddig)</span>}
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
