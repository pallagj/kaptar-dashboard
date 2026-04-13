import { useState } from 'react'
import { BarChart3, Table as TableIcon } from 'lucide-react'
import { DailyDiffChart } from '../components/Charts'

interface Props { diffs: { date: string; diff: number; timestamp: number }[] }

export function WeightChange({ diffs }: Props) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const total = diffs.reduce((a, d) => a + d.diff, 0)
  const positives = diffs.filter(d => d.diff > 0)
  const negatives = diffs.filter(d => d.diff < 0)
  const avg = diffs.length ? total / diffs.length : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label="Összes" value={`${total >= 0 ? '+' : ''}${total.toFixed(2)} kg`} tone={total >= 0 ? 'pos' : 'neg'} />
        <Mini label="Napi átlag" value={`${avg >= 0 ? '+' : ''}${avg.toFixed(2)} kg`} tone={avg >= 0 ? 'pos' : 'neg'} />
        <Mini label="Gyarapodó napok" value={positives.length.toString()} tone="pos" />
        <Mini label="Fogyó napok" value={negatives.length.toString()} tone="neg" />
      </div>
      <div className="card p-4 sm:p-5">
        <div className="flex justify-end mb-3">
          <div className="inline-flex rounded-lg border border-slate-700 p-1 bg-slate-800">
            <button
              onClick={() => setView('chart')}
              className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 ${view === 'chart' ? 'bg-honey-500 text-slate-900' : 'text-slate-300'}`}
            >
              <BarChart3 size={16} /> Grafikon
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 ${view === 'table' ? 'bg-honey-500 text-slate-900' : 'text-slate-300'}`}
            >
              <TableIcon size={16} /> Táblázat
            </button>
          </div>
        </div>
        {view === 'chart' ? (
          <DailyDiffChart diffs={diffs} />
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
                {[...diffs].reverse().map(d => (
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
