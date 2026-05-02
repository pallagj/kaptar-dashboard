let authToken: string | null = null
let onUnauthorized: (() => void) | null = null

const STORAGE_KEY = 'kaptar_jwt'

export function setAuthToken(t: string | null) {
  authToken = t
  if (t) localStorage.setItem(STORAGE_KEY, t)
  else localStorage.removeItem(STORAGE_KEY)
}

export function getAuthToken(): string | null {
  if (authToken !== null) return authToken
  authToken = localStorage.getItem(STORAGE_KEY)
  return authToken
}

export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(path, { ...init, headers })
  if (r.status === 401) {
    setAuthToken(null)
    onUnauthorized?.()
    throw new Error('401: Bejelentkezés szükséges')
  }
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`${r.status} ${r.statusText}: ${text}`)
  }
  return r.json()
}

export interface User {
  id: number
  email: string
  name: string
  picture: string | null
  phone: string | null
  ingest_token: string
  shortcut_link_url: string | null
}

export interface Measurement {
  timestamp: number
  date_str: string
  weight: number
  battery: number
  temp: number
}

export interface Alert {
  timestamp: number
  date: string
  drop_kg: number
  type: string
}

export interface TareEvent {
  id: number
  scale_id: string
  timestamp: number
  offset: number
  target_net: number | null
  note: string | null
  created_at: number
}

export interface Season {
  id: number
  scale_id: string
  flower_id: string
  flower_name: string | null
  start_ts: number
  end_ts: number | null
  start_weight: number
  end_weight: number | null
  latitude: number | null
  longitude: number | null
  location_name: string | null
}

export interface Stats {
  latest: Measurement | null
  delta_24h: number | null
  delta_7d: number | null
  delta_30d: number | null
  daily_diffs: { date: string; diff: number; timestamp: number }[]
  alerts: Alert[]
  history: Measurement[]
  active_season: Season | null
  tare_offset: number
  tare_events: TareEvent[]
  latest_raw: number | null
}

export type ScaleSourceType = 'kaptargsm' | 'sms' | 'manual'

export interface ScaleSummary {
  latest_weight_net: number | null
  latest_timestamp: number | null
  battery: number | null
  temp: number | null
  delta_24h: number | null
  active_season: {
    flower_id: string
    flower_name: string | null
    start_ts: number
    start_weight: number
  } | null
}

export interface Scale {
  id: string
  user_id: number
  name: string
  source_type: ScaleSourceType
  source_url: string | null
  phone_number: string | null
  sms_template: string | null
  call_trigger: number  // 0 | 1 (sqlite boolean)
  latitude: number | null
  longitude: number | null
  location_name: string | null
  tare_offset: number
  created_at: number
  summary: ScaleSummary
}

export interface Flower { id: string; name: string }

export interface Settings {
  sync_interval_minutes: string
  swarm_alert_kg: string
  battery_warn_v: string
}

export type ScaleUpdate = Partial<
  Pick<Scale, 'name' | 'source_type' | 'source_url' | 'phone_number' | 'sms_template'
    | 'call_trigger' | 'latitude' | 'longitude' | 'location_name'>
>

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),

  authConfig: () => request<{ google_client_id: string }>('/api/auth/config'),
  authGoogle: (id_token: string) =>
    request<{ token: string; user: User }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token }),
    }),
  me: () => request<User>('/api/auth/me'),
  updateAccount: (data: { name?: string; phone?: string; shortcut_link_url?: string }) =>
    request<{ ok: boolean }>('/api/account', { method: 'PATCH', body: JSON.stringify(data) }),
  rotateIngestToken: () =>
    request<{ ingest_token: string }>('/api/account/rotate-ingest-token', { method: 'POST' }),

  scales: () => request<Scale[]>('/api/scales'),
  createScale: (s: {
    id: string; name: string; source_type: ScaleSourceType;
    source_url?: string; phone_number?: string; sms_template?: string;
    call_trigger?: boolean;
    latitude?: number; longitude?: number; location_name?: string;
  }) => request<{ ok: boolean }>('/api/scales', { method: 'POST', body: JSON.stringify(s) }),
  updateScale: (id: string, data: ScaleUpdate) =>
    request<{ ok: boolean }>(`/api/scales/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  deleteScale: (id: string) =>
    request<{ ok: boolean }>(`/api/scales/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  sync: () => request<{ ok: boolean; inserted: Record<string, number> }>('/api/sync', { method: 'POST' }),
  stats: (scale_id: string) => request<Stats>(`/api/stats?scale_id=${encodeURIComponent(scale_id)}`),

  flowers: () => request<Flower[]>('/api/flowers'),
  createFlower: (f: Flower) =>
    request<{ ok: boolean }>('/api/flowers', { method: 'POST', body: JSON.stringify(f) }),
  deleteFlower: (id: string) =>
    request<{ ok: boolean }>(`/api/flowers/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  seasons: (scale_id: string) =>
    request<Season[]>(`/api/seasons?scale_id=${encodeURIComponent(scale_id)}`),
  startSeason: (scale_id: string, flower_id: string,
                 loc?: { latitude?: number; longitude?: number; location_name?: string }) =>
    request<{ ok: boolean }>('/api/seasons/start', {
      method: 'POST',
      body: JSON.stringify({ scale_id, flower_id, ...(loc ?? {}) }),
    }),
  closeSeason: (scale_id: string) =>
    request<{ ok: boolean }>(`/api/seasons/close?scale_id=${encodeURIComponent(scale_id)}`, { method: 'POST' }),
  deleteSeason: (id: number) =>
    request<{ ok: boolean }>(`/api/seasons/${id}`, { method: 'DELETE' }),

  tare: (scale_id: string, pre_raw_kg: number, post_raw_kg: number,
         target_net_kg?: number, note?: string) => {
    const p = new URLSearchParams({
      scale_id,
      pre_raw_kg: String(pre_raw_kg),
      post_raw_kg: String(post_raw_kg),
    })
    if (target_net_kg !== undefined) p.set('target_net_kg', String(target_net_kg))
    if (note) p.set('note', note)
    return request<{ ok: boolean; tare_offset: number; target_net: number; pre_net: number }>(
      `/api/tare?${p}`, { method: 'POST' },
    )
  },
  tareEvents: (scale_id: string) =>
    request<TareEvent[]>(`/api/tare-events?scale_id=${encodeURIComponent(scale_id)}`),
  deleteTareEvent: (id: number) =>
    request<{ ok: boolean }>(`/api/tare-events/${id}`, { method: 'DELETE' }),

  addMeasurement: (scale_id: string, weight: number, temp: number, battery: number, timestamp_ms?: number) => {
    const p = new URLSearchParams({ scale_id, weight: String(weight), temp: String(temp), battery: String(battery) })
    if (timestamp_ms !== undefined) p.set('timestamp_ms', String(timestamp_ms))
    return request<{ ok: boolean }>(`/api/measurements?${p}`, { method: 'POST' })
  },

  pushVapidKey: () => request<{ key: string }>('/api/push/vapid-public-key'),
  pushSubscribe: (sub: { endpoint: string; keys: Record<string, string> }) =>
    request<{ ok: boolean }>('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
  pushUnsubscribe: (sub: { endpoint: string; keys: Record<string, string> }) =>
    request<{ ok: boolean }>('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify(sub) }),
  pushTest: () => request<{ ok: boolean; sent: number }>('/api/push/test', { method: 'POST' }),

  adminUsers: () => request<{ id: number; email: string; name: string }[]>('/api/admin/users'),
  adminImpersonate: (target_id: number) =>
    request<{ token: string; user: User }>(`/api/admin/impersonate?target_id=${target_id}`, { method: 'POST' }),

  settings: () => request<Settings>('/api/settings'),
  updateSettings: (s: Partial<Record<keyof Settings, number>>) =>
    request<{ ok: boolean }>('/api/settings', { method: 'PATCH', body: JSON.stringify(s) }),
}
