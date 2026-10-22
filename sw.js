/* سرویس‌ورکر: برنامه بدون اینترنت باز می‌شود؛ کاشی‌های نقشه‌ی دیده‌شده هم ذخیره می‌شوند */
const VER = 'zy-v6';
const SHELL = ['./', 'index.html', 'style.css', 'core.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/proj4.js', 'vendor/xlsx.full.min.js', 'vendor/jszip.min.js',
  'vendor/images/marker-icon.png', 'vendor/images/marker-icon-2x.png', 'vendor/images/marker-shadow.png', 'vendor/images/layers.png', 'vendor/images/layers-2x.png',
  'js/seed.js', 'js/app.js', 'js/map.js', 'detect.js', 'js/autodetect.js', 'js/split.js', 'js/importer.js', 'js/gps.js', 'js/form.js', 'js/parcels.js', 'js/settings.js', 'js/cases.js', 'js/people.js', 'js/project.js'];
const TILE = /(arcgisonline\.com|tile\.openstreetmap\.org)/;
const MAX_TILES = 1500;

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER && k !== 'zy-tiles').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function trim(cache) { const ks = await cache.keys(); if (ks.length > MAX_TILES) for (const k of ks.slice(0, ks.length - MAX_TILES)) await cache.delete(k); }
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (TILE.test(url.hostname)) {
    if (req.mode === 'cors') return; // درخواست تحلیل تصویر: مستقیم از شبکه (پاسخ opaque ذخیره‌شده برای canvas بی‌فایده است)
    e.respondWith(caches.open('zy-tiles').then(async (c) => {
      const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r && (r.ok || r.type === 'opaque')) { c.put(req, r.clone()); trim(c); } return r; }
      catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin !== location.origin) return; // جست‌وجوی نام و غیره: شبکه
  e.respondWith(caches.open(VER).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
  }));
});
