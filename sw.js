const CACHE = 'bvom-2.8.8';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './og-image.png', './i18n/en.js?v=ca8e7a101b80', './i18n/ja.js?v=2a86f7297fa9',
  './theme-bee-v23c.svg',
  './theme-cherry-v23f.svg',
  './theme-coastal-v23f.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    const isShell = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    event.respondWith(fetch(event.request).then(response => {
      if (!response.ok || !isShell) return response;
      const copy = response.clone();
      return caches.open(CACHE)
        .then(cache => cache.put('./index.html', copy).catch(() => {}))
        .then(() => response);
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  })));
});
