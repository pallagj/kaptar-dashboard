import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine, Legend, Area, AreaChart,
} from 'recharts'
import type { Measurement, TareEvent } from '../lib/api'

const GRID = '#334155'
const AXIS = '#94a3b8'

export function WeightTempChart({ data, tareEvents = [] }: { data: Measurement[]; tareEvents?: TareEvent[] }) {
  const chartData = useMemo(
    () => [...data].reverse().map(d => ({
      t: d.timestamp,
      label: d.date_str.slice(5, 16),
      weight: d.weight,
      temp: d.temp,
    })),
    [data],
  )
  // Map each tare event to the nearest data-point label (categorical x axis requires category match).
  const tareMarkers = useMemo(() => {
    if (!tareEvents.length || !chartData.length) return []
    const markers: { label: string; target: number | null; note: string | null }[] = []
    const seen = new Set<string>()
    for (const ev of tareEvents) {
      let bestIdx = 0
      let bestDiff = Infinity
      for (let i = 0; i < chartData.length; i++) {
        const diff = Math.abs(chartData[i].t - ev.timestamp)
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i }
      }
      const label = chartData[bestIdx].label
      if (seen.has(label)) continue
      seen.add(label)
      markers.push({ label, target: ev.target_net, note: ev.note })
    }
    return markers
  }, [chartData, tareEvents])

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="label" stroke={AXIS} fontSize={11} minTickGap={40} />
        <YAxis yAxisId="left" stroke="#f59e0b" fontSize={11} domain={['auto', 'auto']} />
        <YAxis yAxisId="right" orientation="right" stroke="#38bdf8" fontSize={11} />
        <Tooltip
          contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#cbd5e1' }}
        />
        <Legend wrapperStyle={{ color: '#94a3b8' }} />
        {tareMarkers.map((m, i) => (
          <ReferenceLine
            key={i}
            yAxisId="left"
            x={m.label}
            stroke="#a78bfa"
            strokeDasharray="4 3"
            label={{
              value: m.note ? `⚖ ${m.note}` : '⚖ tára',
              position: 'top',
              fill: '#a78bfa',
              fontSize: 10,
            }}
          />
        ))}
        <Line yAxisId="left" type="monotone" dataKey="weight" name="Súly (kg)" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
        <Line yAxisId="right" type="monotone" dataKey="temp" name="Hőfok (°C)" stroke="#38bdf8" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function WeightAreaChart({ data }: { data: Measurement[] }) {
  const chartData = useMemo(
    () => [...data].reverse().map(d => ({
      label: d.date_str.slice(5, 16),
      weight: d.weight,
    })),
    [data],
  )
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="label" stroke={AXIS} fontSize={11} minTickGap={40} />
        <YAxis stroke={AXIS} fontSize={11} domain={['auto', 'auto']} />
        <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid #334155', borderRadius: 8 }} />
        <Area type="monotone" dataKey="weight" stroke="#f59e0b" fill="url(#wg)" strokeWidth={2.5} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function DailyDiffChart({ diffs }: { diffs: { date: string; diff: number }[] }) {
  const data = useMemo(
    () => diffs.map(d => ({ label: d.date.slice(5), diff: d.diff })),
    [diffs],
  )
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="label" stroke={AXIS} fontSize={11} minTickGap={16} />
        <YAxis stroke={AXIS} fontSize={11} />
        <Tooltip
          contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid #334155', borderRadius: 8 }}
          formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)} kg`, 'Változás']}
        />
        <ReferenceLine y={0} stroke="#64748b" />
        <Bar dataKey="diff" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.diff >= 0 ? '#10b981' : '#ef4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
