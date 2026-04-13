const BASE = ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`${r.status} ${r.statusText}: ${text}`)
  }
  return r.json()
}

export interface Measurement {
  timestamp: number
  date_str: string
  weight: number
  battery: number
  temp: number
}

export interface ActiveSeason {
  id: number
  hive_id: string
  flower_id: string
  flower_name: string | null
  start_ts: number
  end_ts: number | null
  start_weight: number
  end_weight: number | null
}

export interface Alert {
  timestamp: number
  date: string
  drop_kg: number
  type: string
}

export interface TareEvent {
  id: number
  hive_id: string
  timestamp: number
  offset: number
  target_net: number | null
  note: string | null
  created_at: number
}

export interface Stats {
  latest: Measurement | null
  delta_24h: number | null
  delta_7d: number | null
  delta_30d: number | null
  daily_diffs: { date: string; diff: number; timestamp: number }[]
  alerts: Alert[]
  history: Measurement[]
  active_season: ActiveSeason | null
  tare_offset: number
  tare_events: TareEvent[]
  latest_raw: number | null
}

export interface Hive {
  id: string
  name: string
  source_url: string
  tare_offset: number
}

export interface Flower {
  id: string
  name: string
}

export interface Season {
  id: number
  hive_id: string
  flower_id: string
  flower_name: string | null
  start_ts: number
  end_ts: number | null
  start_weight: number
  end_weight: number | null
}

export interface Settings {
  sync_interval_minutes: string
  swarm_alert_kg: string
  battery_warn_v: string
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),
  stats: (hiveId: string) => request<Stats>(`/api/stats?hive_id=${encodeURIComponent(hiveId)}`),
  hives: () => request<Hive[]>('/api/hives'),
  updateHive: (id: string, data: Partial<Hive>) =>
    request<{ ok: boolean }>(`/api/hives/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  createHive: (h: Hive) =>
    request<{ ok: boolean }>('/api/hives', { method: 'POST', body: JSON.stringify(h) }),
  deleteHive: (id: string) =>
    request<{ ok: boolean }>(`/api/hives/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  sync: () => request<{ ok: boolean; inserted: Record<string, number> }>('/api/sync', { method: 'POST' }),
  flowers: () => request<Flower[]>('/api/flowers'),
  createFlower: (f: Flower) =>
    request<{ ok: boolean }>('/api/flowers', { method: 'POST', body: JSON.stringify(f) }),
  deleteFlower: (id: string) =>
    request<{ ok: boolean }>(`/api/flowers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  seasons: (hiveId: string) => request<Season[]>(`/api/seasons?hive_id=${encodeURIComponent(hiveId)}`),
  startSeason: (hive_id: string, flower_id: string) =>
    request<{ ok: boolean }>('/api/seasons/start', {
      method: 'POST',
      body: JSON.stringify({ hive_id, flower_id }),
    }),
  closeSeason: (hive_id: string) =>
    request<{ ok: boolean }>(`/api/seasons/close?hive_id=${encodeURIComponent(hive_id)}`, { method: 'POST' }),
  deleteSeason: (id: number) =>
    request<{ ok: boolean }>(`/api/seasons/${id}`, { method: 'DELETE' }),
  tare: (hive_id: string, target_net_kg: number, current_raw_kg?: number, note?: string) => {
    const params = new URLSearchParams({ hive_id, target_net_kg: String(target_net_kg) })
    if (current_raw_kg !== undefined) params.set('current_raw_kg', String(current_raw_kg))
    if (note) params.set('note', note)
    return request<{ ok: boolean; tare_offset: number }>(`/api/tare?${params}`, { method: 'POST' })
  },
  tareEvents: (hive_id: string) =>
    request<TareEvent[]>(`/api/tare-events?hive_id=${encodeURIComponent(hive_id)}`),
  deleteTareEvent: (id: number) =>
    request<{ ok: boolean }>(`/api/tare-events/${id}`, { method: 'DELETE' }),
  settings: () => request<Settings>('/api/settings'),
  updateSettings: (s: Partial<Record<keyof Settings, number>>) =>
    request<{ ok: boolean }>('/api/settings', { method: 'PATCH', body: JSON.stringify(s) }),
}
