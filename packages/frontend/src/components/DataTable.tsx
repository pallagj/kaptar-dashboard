import type { Measurement } from '../lib/api'

export function MeasurementsTable({ data }: { data: Measurement[] }) {
  return (
    <div className="max-h-[340px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-800 sticky top-0">
          <tr>
            <th className="px-3 py-2 text-left text-slate-300">Dátum</th>
            <th className="px-3 py-2 text-right text-slate-300">Súly</th>
            <th className="px-3 py-2 text-right text-slate-300">Hőfok</th>
            <th className="px-3 py-2 text-right text-slate-300">Akku</th>
          </tr>
        </thead>
        <tbody>
          {data.map(r => (
            <tr key={r.timestamp} className="border-b border-slate-800 hover:bg-slate-800/50">
              <td className="px-3 py-1.5">{r.date_str}</td>
              <td className="px-3 py-1.5 text-right font-mono">{r.weight.toFixed(1)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{r.temp.toFixed(1)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{r.battery.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
