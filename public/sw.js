// Change this version number whenever you deploy an update (e.g., to 'finlytics-cache-v2')
const CACHE_NAME = 'finlytics-cache-v6';

// Add the core files you want to cache for instant offline loading
const FILES_TO_CACHE = [
  './',
  './index.html',
  './css/themes.css',
  './css/main.css',
  './css/components.css',
  './js/categories.js',
  './js/dashboard.js',
  './js/transactions.js',
  './js/addTransaction.js',
  './js/analytics.js',
  './js/receiptGenerator.js',
  './js/settings.js',
  './js/app.js',
  './js/storage.js',
  './js/utils.js',
  './js/firebase-sync.js',
  './data/defaultData.js',
  './manifest.json',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/splash-1290x2796.png',
  './images/splash-1170x2532.png',
  './images/splash-1125x2436.png'
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
  // Skip cross-origin requests (like Firebase DB/Auth calls)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached file if found, otherwise request from network
      return response || fetch(event.request);
    })
  );
});