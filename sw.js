/* Service worker - cache-first za offline rad. */
const CACHE = "sudoku-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./solver.js",
  "./sudoku.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => cached))
  );
});
