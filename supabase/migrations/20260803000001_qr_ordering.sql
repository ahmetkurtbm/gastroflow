-- =============================================================================
-- 0013 · QR menü / müşteri kendi telefonundan sipariş
-- =============================================================================
-- Rakiplerin çoğunda masaya QR kod yapıştırılıp müşterinin kendi telefonundan
-- menüyü görüp sipariş verebilmesi vardı; bizde masaya bağlı, tahmin
-- edilemez bir "kapı" yoktu. `qr_token` bu kapı: `/siparis/masa/[qrToken]`
-- rotası bu değeri KİMLİK DOĞRULAMASI OLMADAN kabul eder, dolayısıyla
-- `gen_random_uuid()` ile üretilen 122 bit rastgelelik (art arda deneyerek
-- tahmin edilemez olması) tek güvenlik sınırı. Token sızarsa masa
-- yöneticisi/patron `/settings/salon`'dan yeniden üretebilir (bkz.
-- `regenerateTableQrToken`) — eski token o an geçersiz kalır.
--
-- Bu rota RLS'i HİÇ kullanmıyor (anon oturumu yok, `current_tenant_id()`
-- boş döner); bunun yerine sunucu tarafında `createServiceRoleClient()` ile
-- token'ı doğrulayıp tenant/branch/masa kimliğini KENDİ okuyoruz — istemciden
-- gelen hiçbir tenant/branch/fiyat bilgisine güvenilmiyor (bkz.
-- `src/lib/qr-order/actions.ts`).
-- =============================================================================

alter table public.tables
  add column qr_token uuid not null default gen_random_uuid();

alter table public.tables
  add constraint tables_qr_token_key unique (qr_token);
