const CACHE = 'ftj-v3';
const STATIC = [
  '/TradeJournal/',
  '/TradeJournal/index.html',
  '/TradeJournal/admin.html',
  '/TradeJournal/checklist.html',
  '/TradeJournal/rules.html',
  '/TradeJournal/info.html',
  '/TradeJournal/analytics.html',
  '/TradeJournal/nav.js',
  '/TradeJournal/mobile.css',
  '/TradeJournal/icon-192.png',
  '/TradeJournal/icon-512.png',
  '/TradeJournal/admin/admin.html',
  '/TradeJournal/admin/admin-core.js',
  '/TradeJournal/admin/log-trade.html',
  '/TradeJournal/admin/edit-trade.html',
  '/TradeJournal/admin/bias.html',
  '/TradeJournal/admin/weekly.html',
  '/TradeJournal/admin/premarket.html',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap'
];

// Install — cache static assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache first for static, network first for Notion/Worker API calls
self.addEventListener('fetch', e => {
  // Ignore non-http requests (chrome-extension://, etc)
  if (!e.request.url.startsWith('http')) return;

  const url = new URL(e.request.url);

  // Always go network for API calls (Notion, Worker, Imgur)
  if (
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('notion.com') ||
    url.hostname.includes('api.notion') ||
    url.hostname.includes('imgur.com') ||
    url.hostname.includes('api.imgur.com')
  ) {
    e.respondWith(fetch(e.request.clone()));
    return;
  }

  // Network-first for HTML and JS — always get latest, fall back to cache offline
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname === '/TradeJournal/') {
    e.respondWith(
      fetch(e.request.clone()).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // Offline — serve from cache, fallback to index.html for navigation
        return caches.match(e.request).then(cached => {
          if (cached) return cached;
          if (e.request.mode === 'navigate') return caches.match('/TradeJournal/index.html');
        });
      })
    );
    return;
  }

  // Cache-first for everything else (images, fonts, CSS)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request.clone()).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});
