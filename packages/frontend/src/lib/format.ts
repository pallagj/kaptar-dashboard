export const fmtKg = (v: number | null | undefined, digits = 2) =>
  v == null ? '—' : `${v >= 0 ? '' : ''}${v.toFixed(digits)} kg`

export const fmtSigned = (v: number | null | undefined, digits = 2) => {
  if (v == null) return '—'
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(digits)} kg`
}

export const fmtTemp = (v: number | null | undefined) =>
  v == null ? '—' : `${v.toFixed(1)} °C`

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

export const fmtDateShort = (ts: number) =>
  new Date(ts).toLocaleDateString('hu-HU', { month: '2-digit', day: '2-digit' })

export const daysBetween = (a: number, b: number) =>
  Math.round((b - a) / 86400000)
