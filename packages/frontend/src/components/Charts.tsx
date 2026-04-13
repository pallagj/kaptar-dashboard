import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine, Legend, Area, AreaChart,
} from 'recharts'
import type { Measurement } from '../lib/api'

const GRID = '#334155'
const AXIS = '#94a3b8'

export function WeightTempChart({ data }: { data: Measurement[] }) {
  const chartData = useMemo(
    () => [...data].reverse().map(d => ({
      t: d.timestamp,
      label: d.date_str.slice(5, 16),
      weight: d.weight,
      temp: d.temp,
    })),
    [data],
  )
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
