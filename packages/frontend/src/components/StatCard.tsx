import { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: string
}

export function StatCard({ icon, label, value, sub, accent = 'text-honey-400' }: Props) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={`shrink-0 ${accent}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
        <div className="text-2xl font-semibold text-white mt-0.5 truncate">{value}</div>
        {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
      </div>
    </div>
  )
}
