// Web Push handler — imported into the Workbox-generated service worker.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { /* ignore */ }
  const title = data.title || 'Kaptár Dashboard'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const c of wins) {
        if ('focus' in c) { c.focus(); return }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
