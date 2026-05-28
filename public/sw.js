// Change this version number whenever you deploy an update (e.g., to 'finlytics-cache-v2')
const CACHE_NAME = 'finlytics-cache-v14';

// Add the core files you want to cache for instant offline loading
// NOTE: app.js, firebase-sync.js, settings.js are excluded from SW cache
// to prevent stale-file issues on deploy. They load from network each time.
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/css/themes.css',
  '/css/main.css',
  '/css/components.css',
  '/css/dashboard.css',
  '/css/receipt.css',
  '/js/categories.js',
  '/js/dashboard.js',
  '/js/transactions.js',
  '/js/addTransaction.js',
  '/js/reports.js',
  '/js/receiptGenerator.js',
  '/js/utils.js',
  '/data/defaultData.js',
  '/manifest.json'
];

// Install event: Cache the initial files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // FIX: Use addAll with individual catch to prevent one failure from aborting all caching
      return Promise.allSettled(
        FILES_TO_CACHE.map(url =>
          cache.add(url).catch(err => {
            console.warn('SW: Failed to cache', url, err);
          })
        )
      );
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
  // Allow caching for our own domain AND specific external CDNs (Firebase, Chart.js, etc.)
  const isCrossOriginCacheable = event.request.url.startsWith('https://www.gstatic.com/firebasejs/') ||
                                 event.request.url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/');

  if (event.request.method !== 'GET' || (!event.request.url.startsWith(self.location.origin) && !isCrossOriginCacheable)) {
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