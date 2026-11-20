// Firebase Cloud Messaging Service Worker for Welcome Tech CRM

// Handle incoming background push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const notification = payload.notification || {};
    const data = payload.data || {};

    const title = notification.title || data.title || 'Welcome Tech CRM';
    const body = notification.body || data.body || 'You have a new notification';
    const icon = notification.icon || data.icon || '/favicon.ico';
    const badge = notification.badge || data.badge || '/favicon.ico';
    const url = data.url || payload.fcmOptions?.link || '/';

    const options = {
      body,
      icon,
      badge,
      data: {
        url,
        ...data,
      },
      vibrate: [100, 50, 100],
      requireInteraction: false,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('Welcome Tech CRM', {
        body: text,
        icon: '/favicon.ico',
      })
    );
  }
});

// Handle clicking on notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there is already a window open
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if ('focus' in client) {
            if (urlToOpen && urlToOpen !== '/') {
              client.navigate(urlToOpen);
            }
            return client.focus();
          }
        }
        // If not, open a new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
