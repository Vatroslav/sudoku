/* Service worker - network-first uz zaobilaženje HTTP cachea
   (uvijek svjež kad si online, cache kao fallback offline).
   Zbog `cache: "reload"` dohvata nije potrebno ručno dizati verziju
   na svaku promjenu assета - online korisnici dobiju novo na reload. */
const CACHE = "sudoku-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./solver.js",
  "./sudoku.js",
  "./gen-worker.js",
  "./metrics.js",
  "./app.js",
  "./package.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        Promise.all(
          ASSETS.map((url) =>
            fetch(url, { cache: "reload" })
              .then((resp) => c.put(url, resp))
              .catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request, { cache: "reload" })
      .then((resp) => {
        const copy = resp.clone();
        caches
          .open(CACHE)
          .then((c) => c.put(e.request, copy))
          .catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
