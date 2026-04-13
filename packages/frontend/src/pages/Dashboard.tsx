import { useMemo, useState } from 'react'
import { Scale, Thermometer, TrendingUp, Flower2, AlertTriangle } from 'lucide-react'
import { StatCard } from '../components/StatCard'
import { BatteryGauge } from '../components/BatteryGauge'
import { WeightTempChart, DailyDiffChart } from '../components/Charts'
import { MeasurementsTable } from '../components/DataTable'
import { ChartToggle } from '../components/ChartToggle'
import type { Stats, Measurement } from '../lib/api'
import { fmtDate, fmtSigned, daysBetween } from '../lib/format'

type Range = '24h' | '7d' | '30d' | 'all'

interface Props {
  stats: Stats
  batteryWarnV: number
  range: Range
  setRange: (r: Range) => void
}

export function Dashboard({ stats, batteryWarnV, range, setRange }: Props) {
  const [mainView, setMainView] = useState<'chart' | 'table'>('chart')
  const [diffView, setDiffView] = useState<'chart' | 'table'>('chart')

  const filtered = useMemo<Measurement[]>(() => {
    if (!stats.latest) return []
    if (range === 'all') return stats.history
    const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30
    const cutoff = stats.latest.timestamp - hours * 3600 * 1000
    return stats.history.filter(m => m.timestamp >= cutoff)
  }, [stats, range])

  const filteredDiffs = useMemo(() => {
    if (range === 'all') return stats.daily_diffs
    const days = range === '24h' ? 2 : range === '7d' ? 7 : 30
    return stats.daily_diffs.slice(-days)
  }, [stats.daily_diffs, range])

  if (!stats.latest) {
    return (
      <div className="card p-10 text-center">
        <p className="text-slate-300">Még nincsenek mérési adatok. Koppints a szinkron gombra.</p>
      </div>
    )
  }

  const active = stats.active_season
  const activeGain = active ? stats.latest.weight - active.start_weight : null
  const totalDiff = filteredDiffs.reduce((a, d) => a + d.diff, 0)
  const positives = filteredDiffs.filter(d => d.diff > 0)
  const negatives = filteredDiffs.filter(d => d.diff < 0)

  return (
    <div className="space-y-6">
      {/* Time range selector */}
      <div className="flex justify-end">
        <div className="inline-flex gap-1 card p-1">
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
      </div>

      {/* Active season header */}
      <div className="card p-5 bg-gradient-to-br from-honey-900/40 via-slate-800/60 to-slate-900/60 border-honey-700/30">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="h-14 w-14 rounded-2xl bg-honey-500/20 text-honey-400 flex items-center justify-center">
            <Flower2 size={28} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-slate-400">Aktív szezon</div>
            <div className="text-2xl font-bold text-white truncate">
              {active?.flower_name ?? 'Nincs aktív gyűjtés'}
            </div>
            {active && (
              <div className="text-sm text-slate-400">
                Kezdete: {new Date(active.start_ts).toLocaleDateString('hu-HU')}
                {' · '}
                {daysBetween(active.start_ts, stats.latest.timestamp)} napja
              </div>
            )}
          </div>
          {active && activeGain !== null && (
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-slate-400">Hozam</div>
              <div className={`text-3xl font-bold ${activeGain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtSigned(activeGain)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={<Scale size={24} />}
          label="Nettó súly"
          value={`${stats.latest.weight.toFixed(1)} kg`}
          sub={fmtDate(stats.latest.timestamp)}
          accent="text-honey-400"
        />
        <StatCard
          icon={<Thermometer size={24} />}
          label="Hőmérséklet"
          value={`${stats.latest.temp.toFixed(1)} °C`}
          accent="text-sky-400"
        />
        <StatCard
          icon={<TrendingUp size={24} />}
          label="24h változás"
          value={fmtSigned(stats.delta_24h)}
          sub={`7 nap: ${fmtSigned(stats.delta_7d)}`}
          accent={stats.delta_24h && stats.delta_24h >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <BatteryGauge voltage={stats.latest.battery} warnV={batteryWarnV} />
      </div>

      {/* Alerts */}
      {stats.alerts.length > 0 && (
        <div className="card p-4 border-amber-700/50 bg-amber-950/30">
          <div className="flex items-center gap-2 text-amber-300 font-semibold mb-2">
            <AlertTriangle size={18} />
            Figyelmeztetés: hirtelen súlycsökkenés (lehetséges rajzás)
          </div>
          <ul className="text-sm text-amber-200/80 space-y-1">
            {stats.alerts.slice(0, 5).map(a => (
              <li key={a.timestamp}>
                {a.date} · <span className="font-bold">{a.drop_kg.toFixed(2)} kg</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main chart (weight + temp) */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm uppercase tracking-wider text-slate-400">Súly & hőfok</h3>
          <ChartToggle view={mainView} setView={setMainView} />
        </div>
        {mainView === 'chart' ? <WeightTempChart data={filtered} /> : <MeasurementsTable data={filtered} />}
      </div>

      {/* Daily diff summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label="Időszak hozam" value={`${totalDiff >= 0 ? '+' : ''}${totalDiff.toFixed(2)} kg`} tone={totalDiff >= 0 ? 'pos' : 'neg'} />
        <Mini label="Napi átlag" value={filteredDiffs.length ? `${(totalDiff / filteredDiffs.length).toFixed(2)} kg` : '—'} tone={totalDiff >= 0 ? 'pos' : 'neg'} />
        <Mini label="Gyarapodó napok" value={positives.length.toString()} tone="pos" />
        <Mini label="Fogyó napok" value={negatives.length.toString()} tone="neg" />
      </div>

      {/* Daily diff chart/table */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm uppercase tracking-wider text-slate-400">Napi súlyváltozás</h3>
          <ChartToggle view={diffView} setView={setDiffView} />
        </div>
        {diffView === 'chart' ? (
          <DailyDiffChart diffs={filteredDiffs} />
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-slate-300">Dátum</th>
                  <th className="px-4 py-2 text-right text-slate-300">Változás</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredDiffs].reverse().map(d => (
                  <tr key={d.timestamp} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="px-4 py-2">{d.date}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${d.diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {d.diff >= 0 ? '+' : ''}{d.diff.toFixed(2)} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Mini({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-xl font-bold mt-1 ${tone === 'pos' ? 'text-emerald-400' : 'text-red-400'}`}>
        {value}
      </div>
    </div>
  )
}
