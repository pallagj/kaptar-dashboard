import { BarChart3, Table as TableIcon } from 'lucide-react'

export function ChartToggle({
  view, setView, chartLabel = 'Grafikon', tableLabel = 'Táblázat',
}: {
  view: 'chart' | 'table'
  setView: (v: 'chart' | 'table') => void
  chartLabel?: string
  tableLabel?: string
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-700 p-1 bg-slate-800">
      <button
        onClick={() => setView('chart')}
        className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 ${
          view === 'chart' ? 'bg-honey-500 text-slate-900' : 'text-slate-300'
        }`}
      >
        <BarChart3 size={14} /> {chartLabel}
      </button>
      <button
        onClick={() => setView('table')}
        className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 ${
          view === 'table' ? 'bg-honey-500 text-slate-900' : 'text-slate-300'
        }`}
      >
        <TableIcon size={14} /> {tableLabel}
      </button>
    </div>
  )
}
