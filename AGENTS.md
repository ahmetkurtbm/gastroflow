<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# GastroFlow — proje kuralları

Restoran yönetim sistemi. Tek işletmeyle başlıyor, 15 işletmeye ölçeklenecek.
Ayrıntılı yol haritası ve pazar analizi: `docs/PLAN.md`.

## Yığın

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + RLS + Realtime + Storage) · Vercel

## Bozulmaz kurallar

Bunlar tercih değil, projenin güvenlik iddiasının dayandığı kurallar.

1. **Her tablo `tenant_id` taşır.** İstisna yalnızca `tenants` (ayrım `id` ile) ve
   `profiles` (auth.users'a bire bir). Yeni bir istisna eklemeden önce iki kez düşün —
   `supabase/tests/00_structure_test.sql` bunu CI'da zorluyor.

2. **Her tabloda `enable row level security` VE `force row level security`.**
   FORCE olmadan tabloyu oluşturan rol politikaları atlar; migration'lar o rolle çalışır.

3. **Politikalar `auth.jwt()` claim'lerini okur, tabloya alt sorgu atmaz.**
   `public.current_tenant_id()` / `current_app_role()` / `is_owner()` kullan.
   Sebep: performans + `memberships` politikasının kendine bakıp özyinelemeye girmemesi.

4. **`service_role` anahtarı client'a girmez.** `createServiceRoleClient()` yalnızca
   Server Action, Route Handler veya Edge Function içinde. Kullanmadan önce sor:
   bu gerçekten RLS ile yapılamıyor mu?

5. **`supabase.auth.getSession()` KULLANMA.** Çerezdeki veriyi doğrulamadan okur.
   Sunucuda `getClaims()` veya `getUser()` kullan.

6. **Para `numeric(14,4)`.** Asla `float`/`double precision`. Para birimi ve KDV
   oranı satırda dondurulur.

7. **Stok hareketleri append-only.** `stock_movements` tablosuna yalnızca INSERT.
   Düzeltme, ters kayıtla (reversal) yapılır — UPDATE/DELETE ile değil.

8. **Hassas tablolara `audit_trigger()` bağlanır.** Log'u uygulama değil veritabanı
   yazar; böylece bir kod yolunu unutmak izsiz işlem bırakmaz.

9. **Yeni migration = yeni pgTAP testi.** En az bir çapraz-tenant erişim reddi testi.

10. **Yetkiler açıkça verilir.** `0001` varsayılan hakları iptal etti; her yeni tabloda
    `grant ... to authenticated` yazılmalı. Unutulursa uygulama gürültülü şekilde
    "permission denied" verir — sessiz sızıntıdan iyidir.

## Üretim öncesi temizlik listesi

Geliştirme sırasında bilerek bırakılan, gerçek müşteriye açılmadan önce
kaldırılması gereken şeyler:

- [ ] **Test garson hesabı** — `test-garson@demo.local`, şifresi depo geçmişinde.
      Rol kapılarını canlı doğrulamak için açıldı, Faz 2'de POS'u test etmek için
      duruyor. Silmek için:
      `delete from auth.users where email = 'test-garson@demo.local';`
- [ ] **`pgtap` uzantısı** — güvenlik testleri için bulut projesine kuruldu.
      Ayrı bir test/staging projesi ayrıldığında üretimden düşür.
- [ ] **`Demo Restoran` tenant'ı** — gerçek işletme verisiyle karışmasın.
- [ ] Patron hesabının seed şifresi değiştirilmiş olmalı.

## Bilinen ve kabul edilen riskler

**`npm audit` → 9 high, `brace-expansion` (ESLint zinciri).**
Advisory GHSA-mh99-v99m-4gvg tek bir aralık tanımlıyor (`<=5.0.7`) ve yamayı yalnızca
`5.0.8`'e koymuş. Kurulu `minimatch@3` ise `brace-expansion@^1.1.7` istiyor ve v5'in
dışa aktarım şekli uyumsuz — v5'e zorlamak ESLint'i tamamen kırıyor
(`TypeError: expand is not a function`). 1.x hattının en yenisi olan `1.1.18`
kuruluyor ama advisory'ye göre o da "affected" sayılıyor.

Kabul sebebi: bu bir **geliştirme aracı** bağımlılığı. Açık, glob kalıbı genişletirken
bellek tüketimi; tetiklemek için saldırganın bizim lint komutumuza kalıp geçirmesi
gerekir. Üretim çalışma zamanına, tarayıcıya veya sunucuya hiç ulaşmıyor.

Gerçek çözüm ESLint 10'a geçmek; `eslint-config-next` desteklediğinde yapılacak.
**Bu istisna yalnızca ESLint zinciri için geçerlidir** — `postcss` ve `sharp`
açıkları `overrides` ile kapatıldı, çünkü onlar üretimde çalışıyor.

## Next.js 16 tuzakları (bu projede karşılaşılanlar)

- **`middleware.ts` yok, `proxy.ts` var.** Fonksiyon adı `proxy` olmak zorunda.
  Dosya `src/proxy.ts`.
- **Nonce'lu CSP tüm sayfaları dinamik render'a zorlar.** Bilinçli tercih; bu uygulamada
  statik sayfa zaten yok. PPR ve CDN cache'i devre dışı — bunu "optimize edelim" diye geri alma.
- `create-next-app` varsayılanı Turbopack.

## Komutlar

```bash
npm run dev        # geliştirme sunucusu
npm run build      # üretim derlemesi (tip + lint hatası build'i kırar)
npm run typecheck  # tsc --noEmit
npm run lint
npm test           # vitest — yalnızca saf mantık (src/**/*.test.ts)
```

Veritabanı testleri vitest'te değil, `supabase/tests/*.sql` içinde pgTAP ile.

## Dizin düzeni

```
src/app/          Next.js rotaları (route group'lar: (pos) (kds) (manage) (m))
src/lib/env.ts    ortam değişkeni doğrulaması (zod)
src/lib/auth/     rol ve yol erişim kuralları — saf mantık, test edilebilir
src/lib/supabase/ client.ts (tarayıcı) · server.ts (sunucu) · session.ts (proxy)
src/proxy.ts      CSP nonce + oturum tazeleme + rol yönlendirme
supabase/migrations/  saf SQL: tablo + RLS + trigger + view
supabase/tests/       pgTAP güvenlik testleri
```

## Dil

Kod, tip ve tablo adları İngilizce. Yorumlar, hata mesajları ve arayüz Türkçe.
