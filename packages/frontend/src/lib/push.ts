import { api } from './api'

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4)
  const s = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(s)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function getPushStatus(): Promise<'unsupported' | 'denied' | 'default' | 'subscribed' | 'not_subscribed'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) return 'subscribed'
  return Notification.permission === 'granted' ? 'not_subscribed' : 'default'
}

export async function subscribe(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('A böngésző nem támogatja a push értesítéseket.')
  }
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Az értesítési engedély nem lett megadva.')
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) {
    await api.pushSubscribe(existing.toJSON() as any)
    return
  }
  const { key } = await api.pushVapidKey()
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  })
  await api.pushSubscribe(sub.toJSON() as any)
}

export async function unsubscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const json = sub.toJSON() as any
  await sub.unsubscribe()
  if (json.endpoint) await api.pushUnsubscribe(json)
}
