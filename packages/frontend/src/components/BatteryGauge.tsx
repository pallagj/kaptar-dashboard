import { Battery, BatteryLow, BatteryWarning } from 'lucide-react'

interface Props { voltage: number; warnV: number }

export function BatteryGauge({ voltage, warnV }: Props) {
  const MIN = 5.0, MAX = 6.5
  const pct = Math.max(0, Math.min(100, ((voltage - MIN) / (MAX - MIN)) * 100))
  const state = voltage < warnV ? 'low' : voltage < warnV + 0.4 ? 'warn' : 'ok'
  const color =
    state === 'low' ? 'bg-red-500' : state === 'warn' ? 'bg-amber-400' : 'bg-emerald-500'
  const Icon = state === 'low' ? BatteryLow : state === 'warn' ? BatteryWarning : Battery
  const textColor =
    state === 'low' ? 'text-red-400' : state === 'warn' ? 'text-amber-400' : 'text-emerald-400'

  return (
    <div className="card p-4 flex items-start gap-3">
      <Icon className={`shrink-0 ${textColor}`} size={24} />
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider text-slate-400">Akkumulátor</div>
        <div className={`text-2xl font-semibold mt-0.5 ${textColor}`}>
          {voltage.toFixed(2)} V
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-700 overflow-hidden">
          <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-1">
          <span>{MIN.toFixed(1)} V</span>
          <span>{MAX.toFixed(1)} V</span>
        </div>
      </div>
    </div>
  )
}
