import { useMemo } from 'react'
import { Scale, Thermometer, TrendingUp, Flower2, AlertTriangle } from 'lucide-react'
import { StatCard } from '../components/StatCard'
import { BatteryGauge } from '../components/BatteryGauge'
import { WeightTempChart, WeightAreaChart } from '../components/Charts'
import type { Stats, Measurement } from '../lib/api'
import { fmtDate, fmtSigned, daysBetween } from '../lib/format'

interface Props {
  stats: Stats
  batteryWarnV: number
  range: '24h' | '7d' | '30d' | 'all'
}

export function Dashboard({ stats, batteryWarnV, range }: Props) {
  const filtered = useMemo<Measurement[]>(() => {
    if (!stats.latest) return []
    if (range === 'all') return stats.history
    const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30
    const cutoff = stats.latest.timestamp - hours * 3600 * 1000
    return stats.history.filter(m => m.timestamp >= cutoff)
  }, [stats, range])

  if (!stats.latest) {
    return (
      <div className="card p-10 text-center">
        <p className="text-slate-300">Még nincsenek mérési adatok. Koppints a szinkron gombra.</p>
      </div>
    )
  }

  const active = stats.active_season
  const activeGain = active
    ? stats.latest.weight - active.start_weight
    : null

  return (
    <div className="space-y-6">
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

      {/* Charts */}
      <div className="card p-4 sm:p-5">
        <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-3">Súly & hőfok trend</h3>
        <WeightTempChart data={filtered} />
      </div>

      <div className="card p-4 sm:p-5">
        <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-3">Súlytrend (terület)</h3>
        <WeightAreaChart data={filtered} />
      </div>
    </div>
  )
}
