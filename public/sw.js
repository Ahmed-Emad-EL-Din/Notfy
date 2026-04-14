self.addEventListener('push', function(event) {
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch (e) {
      data = { title: 'New Notification', message: event.data.text() }
    }
  }

  const title = data.title || 'Notfy'
  const options = {
    body: data.message || 'You have a new notification.',
    icon: '/vite.svg',
    badge: '/vite.svg',
    data: data.url || '/'
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  )
})
