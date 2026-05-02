import { Link } from 'react-router-dom'
import { Battery, Flower2, TrendingUp, Thermometer, Radio, Smartphone, PencilRuler } from 'lucide-react'
import type { Scale } from '../lib/api'

function ago(ts: number): string {
  const delta = (Date.now() - ts) / 60000
  if (delta < 1) return 'most'
  if (delta < 60) return `${Math.round(delta)}p`
  if (delta < 24 * 60) return `${Math.round(delta / 60)}ó`
  return `${Math.round(delta / 60 / 24)}n`
}

const SOURCE_META: Record<Scale['source_type'], { icon: JSX.Element; label: string }> = {
  kaptargsm: { icon: <Radio size={11} />, label: 'GSM' },
  sms: { icon: <Smartphone size={11} />, label: 'SMS' },
  manual: { icon: <PencilRuler size={11} />, label: 'Manuális' },
}

export function ScaleCard({ scale, batteryWarnV = 5.6 }: { scale: Scale; batteryWarnV?: number }) {
  const s = scale.summary
  const delta = s.delta_24h
  const deltaClass = delta == null ? 'text-slate-400' : delta >= 0 ? 'text-emerald-400' : 'text-red-400'
  const battery = s.battery
  const batteryLow = battery !== null && battery < batteryWarnV
  const src = SOURCE_META[scale.source_type]
  return (
    <Link
      to={`/scale/${encodeURIComponent(scale.id)}`}
      className="card p-5 block active:scale-[0.98] transition hover:border-honey-700/50"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-lg font-bold truncate">{scale.name}</h3>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">{src.icon} {src.label}</span>
            <span>·</span>
            <span className="truncate">{scale.id}</span>
          </div>
        </div>
        {s.active_season && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-honey-500/20 text-honey-300 border border-honey-700/40 px-2 py-1 rounded-full shrink-0">
            <Flower2 size={12} />
            {s.active_season.flower_name ?? s.active_season.flower_id}
          </span>
        )}
      </div>
      {s.latest_weight_net !== null ? (
        <>
          <div className="flex items-end gap-2 mb-2">
            <div className="text-4xl font-bold text-honey-400 leading-none">
              {s.latest_weight_net.toFixed(1)}
            </div>
            <div className="text-lg text-slate-400 pb-1">kg</div>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span className={`flex items-center gap-1 ${deltaClass}`}>
              <TrendingUp size={14} />
              {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} kg / 24h`}
            </span>
            {s.temp !== null && (
              <span className="flex items-center gap-1">
                <Thermometer size={14} /> {s.temp.toFixed(1)}°C
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
            <span className={`flex items-center gap-1 text-xs ${batteryLow ? 'text-amber-400' : 'text-slate-500'}`}>
              <Battery size={14} /> {battery !== null ? `${battery.toFixed(1)} V` : '—'}
            </span>
            {s.latest_timestamp && (
              <span className="text-xs text-slate-500">{ago(s.latest_timestamp)}</span>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500 py-4">Még nincs mérési adat.</p>
      )}
    </Link>
  )
}
