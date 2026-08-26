// Service worker. Chrome on Android requires one with a fetch handler before it
// will offer a real install, and it is what makes the shell survive a bad
// signal. Registered by assets/js/sw-register.js.
//
// Bump CACHE_VERSION on any change to the precache list or the strategies —
// activate deletes every cache that does not match, which is the only way an
// old shell gets evicted.

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `noodle-shell-${CACHE_VERSION}`;
const DATA_CACHE = `noodle-data-${CACHE_VERSION}`;

// Public pages and the assets they need. Deliberately excludes every gated
// route (/add, /queue, /mylist, /profile, /submit, /suggest-edit): those answer
// 302 to the sign-in page for a signed-out visitor, and caching that redirect
// would pin it for signed-in ones too.
//
// Also excludes the Google Fonts stylesheet and the unpkg ZXing bundle. They
// are cross-origin, so they answer requests we cannot inspect, and a single
// failure in cache.addAll aborts the whole install — which is why each entry is
// added individually below.
const SHELL = [
  '/',
  '/index.html',
  '/list.html',
  '/signin.html',
  '/manifest.webmanifest',
  '/assets/css/style.css',
  '/assets/js/cards.js',
  '/assets/js/overlay.js',
  '/assets/js/auth.js',
  '/assets/js/list.js',
  '/assets/js/home.js',
  '/assets/js/toast.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // One at a time, each tolerating failure: addAll is atomic, so a single
    // renamed asset would leave the app with no offline shell at all.
    await Promise.all(SHELL.map(url => cache.add(url).catch(() => { })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, DATA_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Fresh data wins; the cache is only the offline fallback. Cache-first here
// would serve stale community ratings, which is the whole point of the
// aggregate being live.
// `response.redirected` is the important half of this guard. A signed-out
// navigation to a gated route follows the 401 override's 302 to /signin.html
// and comes back 200-and-redirected — caching that would file the sign-in page
// under /mylist.html, and Chrome throws outright ("Response served by service
// worker has redirections") when a redirected response is later returned for a
// navigation. The precache list already excludes gated routes for the same
// reason; this is the runtime path honouring it.
function isCacheable(response) {
  return response.ok && !response.redirected && response.type === 'basic';
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (cacheName && isCacheable(response)) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (fonts, the ZXing bundle) goes straight to the network —
  // opaque responses cannot be inspected, so caching them here would be
  // storing something we cannot validate.
  if (url.origin !== self.location.origin) return;

  // The auth endpoints must never be served from a cache: /.auth/me decides
  // who the client thinks it is, and a stale copy would show a signed-out
  // visitor as signed in, or one account as another.
  if (url.pathname.startsWith('/.auth/')) return;

  if (url.pathname.startsWith('/api/')) {
    // Only the public catalogue is cached. /api/ratings and /api/submissions
    // are scoped to the caller — the cache is per-device, not per-user, so
    // storing them risks showing one account's list to whoever opens the app
    // next on a shared phone.
    const isPublic = url.pathname.startsWith('/api/noodles');
    event.respondWith(networkFirst(request, isPublic ? DATA_CACHE : null));
    return;
  }

  // Navigations go to the network first so gated routes still redirect and
  // fresh HTML wins, with the cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request));
});
