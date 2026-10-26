# GastroFlow

Çok kiracılı, rol bazlı bir restoran yönetim sistemi: sipariş alma, mutfak ekranı,
kasa, reçeteye dayalı stok düşümü, maliyet kontrolü, satın alma ve denetim kaydı.
Erişim kontrolü uygulamada değil, veritabanında (PostgreSQL Row Level Security) zorunlu.

## Özellikler

- **POS ve salon:** görsel masa düzeni, masa/Gel Al/Self Servis siparişi, modifier'lar, kombolar, ikram/iskonto onay akışı
- **QR menü:** müşteri masadaki QR koddan kendi telefonuyla sipariş verir; personel onaylayınca mutfağa gider
- **Mutfak ekranı (KDS):** Supabase Realtime ile canlı bilet akışı ve süre takibi
- **Kasa:** ödeme alma, hesap bölme, kupon ve sadakat puanı, kasa oturumu ve gün sonu
- **Stok:** satıştan reçeteye göre otomatik düşüm, zayiat, depolar arası transfer, körleme sayım, teorik/fiili varyans
- **Satın alma:** tedarikçiler, fiyat listeleri, onaylı satın alma siparişi, mal kabul
- **Raporlar:** ciro, fiş ve paket platformu hakediş mutabakatı, muhasebe özeti (Excel)
- **Patron mobil paneli (`/m`):** canlı ciro, bekleyen onaylar, olay akışı
- **Personel ve vardiya:** personel hesabı açma, rol yönetimi, haftalık vardiya çizelgesi
- **Offline dayanıklılık:** açık sipariş ve sayım ekranında bağlantı kesilince mutasyonlar kuyruğa alınır
- **PWA ve TR/EN arayüz**

## Henüz gerçek olmayan entegrasyonlar

Aşağıdakiler adaptör arayüzüyle hazır ama **mock** çalışıyor; gerçek bağlantı ticari anlaşma
veya sertifika gerektiriyor:

| Entegrasyon | Durum |
|---|---|
| ÖKC (yeni nesil yazarkasa) fişi | Mock (`src/lib/integrations/fiscal-device.ts`) |
| e-Arşiv fatura (GİB) | Mock (`src/lib/integrations/e-invoice.ts`) |
| Yemeksepeti / Getir / Trendyol Go | Mock (`src/lib/integrations/delivery-channel.ts`) |
| Bildirim e-postaları | Kuyruk ve kurallar gerçek, gönderim mock (`supabase/functions/process-notifications`) |

Fiş ve hakediş mutabakatı bu yüzden Excel ile içe aktarılan verilerle yapılır.

## Mimari

```
Next.js 16 (App Router)
  Server Component'ler   → sayfa verisini oturumdaki kullanıcının kimliğiyle okur
  Server Action'lar      → yazma işlemleri; tenant_id her zaman doğrulanmış oturumdan
  src/proxy.ts           → nonce'lu CSP, oturum tazeleme, rol bazlı yönlendirme

Supabase
  RLS                    → her tabloda enable + force; politikalar JWT claim'lerinden okur
  Custom access token hook → JWT'ye tenant_id / branch_id / app_role yazar
  Trigger'lar            → durum geçişleri, append-only denetim kaydı, bildirim üretimi
  Edge Function          → bildirim kuyruğu işleyicisi
```

### Güvenlik yaklaşımı

- Her tabloda `tenant_id` ve `force row level security`; kiracı kimliği istemciden alınmaz
- Uygulamadaki rol kontrolleri (`src/lib/auth/access.ts`, `src/proxy.ts`) kullanıcı deneyimi içindir; veri erişimini RLS belirler
- Denetim kaydını uygulama değil trigger yazar; kayıtlar append-only
- Fonksiyon çalıştırma yetkileri PUBLIC'ten iptal edilir, gerekenler tek tek verilir
- `service_role` yalnızca sunucuda ve yalnızca kullanıcı kimliğiyle yapılamayan işlerde kullanılır (QR sipariş, stok düşümü, personel hesabı); modül `server-only` ile istemciye girmesi engellenir
- Herkese açık QR sipariş ucunda masa başına hız sınırı vardır ve fiyat, KDV ve ürün durumu yalnızca veritabanından okunur
- Para `numeric(14,4)`; fiyat ve KDV oranı satır anında dondurulur

### Offline kapsamı

Açık bir sipariş veya sayım ekranındaki mutasyonlar IndexedDB'de kuyruğa alınır ve `client_key`
idempotency anahtarıyla senkronlanır. Service worker daha önce ziyaret edilmiş sayfaları soğuk
başlangıçta önbellekten açar. Hiç ziyaret edilmemiş bir sayfa ya da yeni masa açmak offline çalışmaz.

## Kurulum

```bash
npm install
cp .env.example .env.local   # Supabase URL, publishable key ve service role key
npm run dev
```

Sıfırdan bir veritabanı için:

1. `supabase/migrations/` altındaki dosyaları sırayla uygulayın
2. Supabase Dashboard → Authentication → Hooks → **Customize Access Token (JWT) Claims**
   → `public.custom_access_token_hook` seçip etkinleştirin. Bu adım atlanırsa JWT'ye
   kiracı ve rol yazılmaz ve hiçbir veri görünmez.
3. `supabase/seed.sql` içindeki değişkenleri doldurup çalıştırın (ilk işletme ve patron hesabı)

## Komutlar

```bash
npm run dev        # geliştirme sunucusu
npm run build      # üretim derlemesi
npm run typecheck  # tsc --noEmit
npm run lint
npm test           # Vitest: para, birim, reçete, fiyat ve erişim kuralları
npm run test:e2e   # Playwright uçtan uca testleri
npm run load-test  # yoğun servis yük testi
```

Veritabanı güvenlik testleri `supabase/tests/` altında pgTAP ile yazılmıştır
(kiracı izolasyonu, rol yetkileri, stok ve sipariş kuralları).

## Teknoloji

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth, RLS, Realtime, Storage, Edge Functions) · Zod · ExcelJS · Vitest · Playwright
