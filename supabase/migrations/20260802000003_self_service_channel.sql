-- =============================================================================
-- 0011 · "Self servis" sipariş kanalı ekle
-- =============================================================================
-- `order_channel` zaten `dine_in`/`takeaway`/`delivery` taşıyordu ama POS
-- ekranında masasız (`table_id` NULL) bir sipariş açmanın hiçbir yolu yoktu
-- — yalnızca masa seçilerek adisyon açılabiliyordu. Bu migration yalnızca
-- enum değerini ekliyor; asıl akış (openChannelOrder, /pos/siparis/[orderId])
-- uygulama kodunda.
-- =============================================================================

alter type public.order_channel add value 'self_service' after 'takeaway';
