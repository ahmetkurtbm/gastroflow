// =============================================================================
// GastroFlow — app-shell service worker (Faz 7, "soğuk başlangıç" offline)
// =============================================================================
// Kapsam (bkz. AGENTS.md "Offline kuyruk — kapsam sınırı"): src/lib/offline/
// yalnızca zaten açık bir sipariş ekranındaki MUTASYONLARI (ürün ekleme,
// mutfağa gönderme) kuyruğa alıyordu — sayfanın kendisi hâlâ ağdan
// gelmek zorundaydı. Bu service worker o boşluğu kapatıyor: bir sayfa bir
// kez online ziyaret edildiyse, sonraki soğuk başlangıçta (sekme kapanıp
// açılsa/yenilense bile) önbellekten render edilebilir.
//
// Ne YAPMAZ (bilinçli sınır): hiç ziyaret edilmemiş yeni bir sayfaya offline
// gitmek çalışmaz — bu, App Router'ın her navigasyonda sunucudan RSC verisi
// çekmesinin doğal sonucu. Server Action'lar (POST) hiç önbelleğe alınmaz;
// mutasyonların offline dayanıklılığı zaten src/lib/offline/queue.ts'nin işi.
// =============================================================================

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

// Next'in build hash'li varlıkları (_next/static/...) içerik-adresli ve
// değişmez — bir kere önbelleğe alınınca sonsuza dek güvenle kullanılabilir.
function isImmutableAsset(url) {
  return new URL(url).pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Yalnızca GET okumaları önbelleklenir. Server Action'lar POST ile gider;
  // bunlara hiç dokunmuyoruz ki src/lib/offline/queue.ts'nin idempotency
  // varsayımlarıyla çakışmasın. Aynı sebeple çapraz-origin (Supabase) istekleri
  // de bu worker'ın dışında bırakılıyor — realtime/auth akışını bozmamak için.
  if (request.method !== "GET" || !isSameOrigin(request.url)) return;

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

  // Sayfa navigasyonları ve App Router'ın RSC veri istekleri (aynı URL,
  // farklı Accept/RSC başlığıyla): ağ öncelikli, başarılı yanıt her zaman
  // önbelleğin üstüne yazılır — bu yüzden "bayat veri" riski yalnızca
  // GERÇEKTEN çevrimdışıyken ortaya çıkar, online'ken her zaman taze.
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
