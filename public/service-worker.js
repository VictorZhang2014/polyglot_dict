const CACHE_NAME = "polyglot-dict-v2";
const OFFLINE_FALLBACK = "/offline.html";
const STATIC_ASSETS = [
  OFFLINE_FALLBACK,
  "/manifest.webmanifest",
  "/icons/icon.png",
  "/icons/maskable-icon.png",
  "/icons/apple-touch-icon.png"
];

function shouldCache(pathname) {
  return (
    pathname === OFFLINE_FALLBACK ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/_next/")) {
    // Never cache Next.js build assets to avoid stale chunk/layout.css 404 issues.
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      })
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_FALLBACK);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok && shouldCache(url.pathname)) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(OFFLINE_FALLBACK));
    })
  );
});
