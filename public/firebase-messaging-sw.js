importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBWmY5zR2R7xyMuL1cZEnXS7JL1fbfJ2KY",
  authDomain: "omniapihomedomotic.firebaseapp.com",
  projectId: "omniapihomedomotic",
  storageBucket: "omniapihomedomotic.firebasestorage.app",
  messagingSenderId: "341304629590",
  appId: "1:341304629590:web:6a652c2feb23f70508def7"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Background message received:', payload);

  const notificationTitle = payload.notification?.title || 'OmniaPi';
  const notificationOptions = {
    body: payload.notification?.body || 'Nuova notifica',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.data?.tag || 'omniapi-notification',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});
