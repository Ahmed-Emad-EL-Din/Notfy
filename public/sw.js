self.addEventListener('push', function(event) {
  if (event.data) {
    let data;
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'New Notification', body: event.data.text() };
    }

    const title = data.title || 'Notfy Alert';
    const options = {
      body: data.body || 'You have a new update.',
      icon: '/vite.svg',
      badge: '/vite.svg',
      vibrate: [200, 100, 200, 100, 200],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      }
    };

    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window' }).then(windowClients => {
    // Check if there is already a window/tab open with the target URL
    for (var i = 0; i < windowClients.length; i++) {
      var client = windowClients[i];
      // If so, just focus it.
      if (client.url === '/' && 'focus' in client) {
        return client.focus();
      }
    }
    // If not, then open the target URL in a new window/tab.
    if (clients.openWindow) {
      return clients.openWindow('/');
    }
  }));
});
