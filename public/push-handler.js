// Push Notification Handler for Velari Service Worker

self.addEventListener('push', function(event) {
    console.log('[SW] Push xabari qabul qilindi:', event);

    let data = {
        title: 'Velari',
        body: 'Yangi bildirishnoma mavjud!',
        url: '/'
    };

    if (event.data) {
        try {
            const parsed = event.data.json();
            data = {
                title: parsed.title || data.title,
                body: parsed.body || data.body,
                url: parsed.url || data.url
            };
        } catch (err) {
            console.warn('[SW] Push data JSON emas, matn sifatida o\'qildi:', err);
            data.body = event.data.text() || data.body;
        }
    }

    const options = {
        body: data.body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: [200, 100, 200],
        tag: 'velari-push-' + Date.now(),
        renotify: true,
        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
            .then(() => console.log('[SW] showNotification muvaffaqiyatli chaqirildi!'))
            .catch((err) => console.error('[SW] showNotification xatosi:', err))
    );
});

self.addEventListener('notificationclick', function(event) {
    console.log('[SW] Bildirishnoma bosildi:', event);
    event.notification.close();

    const targetUrl = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(location.origin) && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
