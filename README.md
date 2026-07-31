# GastroFlow

Restoran yönetim sistemi: sipariş alma, mutfak ekranı, reçete bazlı stok düşümü,
maliyet kontrolü, tedarik siparişi ve denetim kaydı.

Tek işletmeyle başlıyor, çok işletmeye ölçeklenecek şekilde tasarlandı.
Ayrıntılı yol haritası ve pazar analizi: [`docs/PLAN.md`](docs/PLAN.md).

## Yığın

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + RLS + Realtime + Storage) · Vercel

## Kurulum

```bash
npm install
cp .env.example .env.local   # Supabase URL ve publishable key'i doldur
npm run dev
```

Sıfırdan bir veritabanı için:

1. `supabase/migrations/` altındaki dosyaları sırayla uygula
2. Supabase Dashboard → Authentication → Hooks → **Customize Access Token (JWT) Claims**
   → `public.custom_access_token_hook` seç ve etkinleştir
   *(bu adım atlanırsa JWT'ye tenant/rol bilgisi yazılmaz ve kimse hiçbir veriyi göremez)*
3. `supabase/seed.sql` içindeki değişkenleri doldurup çalıştır — ilk işletme ve patron hesabı

## Komutlar

```bash
npm run dev        # geliştirme sunucusu
npm run build      # üretim derlemesi
npm run typecheck  # tsc --noEmit
npm run lint
npm test           # vitest — saf mantık testleri
```

Veritabanı güvenlik testleri `supabase/tests/` altında pgTAP ile.

## Güvenlik yaklaşımı

Erişim kontrolü uygulama katmanında değil, **veritabanında** zorlanır:

- Her tabloda row level security `enable` **ve** `force`
- Politikalar tenant/rol bilgisini JWT claim'inden okur; kullanıcıdan gelen
  parametreye güvenmez
- Denetim kaydını uygulama değil trigger yazar — bir kod yolunu atlamak izsiz
  işlem bırakmaz; kayıtlar append-only
- Fonksiyon çalıştırma yetkileri PUBLIC'ten iptal edilir, gerekli olanlar tek tek verilir
- `service_role` anahtarı yalnızca sunucu tarafında kullanılır

Uygulama tarafındaki rol kontrolleri (`src/lib/auth/access.ts`, `src/proxy.ts`)
kullanıcı deneyimi içindir, güvenlik sınırı değildir. Kurallar ve gerekçeleri:
[`AGENTS.md`](AGENTS.md).
