// Change this version number whenever you deploy an update (e.g., to 'finlytics-cache-v2')
const CACHE_NAME = 'finlytics-cache-v11';

// Add the core files you want to cache for instant offline loading
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/css/themes.css',
  '/css/main.css',
  '/css/components.css',
  '/js/categories.js',
  '/js/dashboard.js',
  '/js/transactions.js',
  '/js/addTransaction.js',
  '/js/reports.js',
  '/js/receiptGenerator.js',
  '/js/settings.js',
  '/js/app.js',
  '/js/storage.js',
  '/js/utils.js',
  '/js/firebase-sync.js',
  '/data/defaultData.js',
  '/manifest.json',
  '/images/icon-192.png',
  '/images/icon-192.webp',
  '/images/icon-512.png',
  '/images/icon-512.webp',
  '/images/splash-1290x2796.png',
  '/images/splash-1170x2532.png',
  '/images/splash-1125x2436.png'
];

// Install event: Cache the initial files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

// Message event: Listen for the "SKIP_WAITING" signal from the app to force update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate event: Clear old caches when a new service worker takes over
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event: Serve from cache if available, otherwise fetch from network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests and non-GET requests (like Firebase POSTs)
  if (!event.request.url.startsWith(self.location.origin) || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchedResponse = fetch(event.request).then((networkResponse) => {
          // Only cache valid responses to prevent caching error pages
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Fallback for navigation requests (SPA routing) while offline
          if (event.request.mode === 'navigate') {
            return cache.match('/index.html');
          }
        });
        return cachedResponse || fetchedResponse;
      });
    })
  );
});