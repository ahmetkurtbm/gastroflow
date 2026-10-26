// App-shell service worker. Online ziyaret edilmiş sayfalar soğuk başlangıçta
// önbellekten açılabilir; hiç ziyaret edilmemiş sayfa offline açılamaz.
// Server Action'lar (POST) önbelleğe alınmaz; mutasyonları src/lib/offline yönetir.

const CACHE_VERSION = "gastroflow-shell-v1";

const PRECACHE_URLS = ["/manifest.webmanifest", "/icon.svg", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isSameOrigin(url) {
  return new URL(url).origin === self.location.origin;
}

// _next/static varlıkları içerik hash'li ve değişmez.
function isImmutableAsset(url) {
  return new URL(url).pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Yalnızca aynı origin'deki GET istekleri; Server Action ve Supabase istekleri dışarıda.
  if (request.method !== "GET" || !isSameOrigin(request.url)) return;

  // Next'in Server Action sonrası RSC yenileme isteğine dokunulmaz: iptal
  // edildiğinde SW bunu ağ hatası sayıp "sayfa yüklenemedi" ekranı açıyordu.
  if (request.headers.get("RSC") === "1" || request.headers.has("Next-Router-State-Tree")) {
    return;
  }

  if (isImmutableAsset(request.url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Sayfa ve RSC istekleri ağ öncelikli; başarılı yanıt önbelleği günceller.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const offline = await cache.match("/offline.html");
          if (offline) return offline;
        }
        return Response.error();
      }),
  );
});
