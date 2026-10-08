const CACHE = 'bvom-2.8.9';
const BUILD = '2.8.9';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './og-image.png', './i18n/en.js?v=ca8e7a101b80', './i18n/ja.js?v=2a86f7297fa9',
  './theme-bee-v23c.svg',
  './theme-cherry-v23f.svg',
  './theme-coastal-v23f.svg'
];
async function bvomFetchValidatedShell(request='./index.html'){
  const response = await fetch(request,{cache:'reload'});
  if(!response.ok)throw new Error('BVOM shell fetch failed');
  const text = await response.clone().text();
  if(!text.includes("const BVOM_BUILD='"+BUILD+"'"))throw new Error('BVOM shell build marker mismatch');
  return response;
}
self.addEventListener('message', event => {
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const shell=await bvomFetchValidatedShell('./index.html');
    await cache.put('./index.html',shell);
    await cache.addAll(CORE.filter(x=>x!=='./'&&x!=='./index.html'));
  })());
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
    if(!isShell)return;
    event.respondWith((async()=>{
      const cached=await caches.match('./index.html');
      if(cached)return cached;
      const response=await fetch(event.request);
      if(response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put('./index.html', copy).catch(() => {})).catch(()=>{});
      }
      return response;
    })());
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  })));
});
