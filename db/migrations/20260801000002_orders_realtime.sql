-- =============================================================================
-- 0009 · `/orders` sipariş takip ekranı realtime desteği
-- =============================================================================
-- `order_lines` zaten `supabase_realtime` publication'ındaydı (KDS onu
-- kullanıyor). `orders` tablosu değildi — bu, sipariş takip panosunun
-- `orders` ve `order_lines` olaylarını birlikte dinleyen tek kanalının
-- hiç SUBSCRIBED durumuna geçmemesine, dolayısıyla hiçbir olayı
-- almamasına yol açtı (tarayıcıda doğrulanan gerçek bir hata).
-- =============================================================================

alter publication supabase_realtime add table public.orders;
