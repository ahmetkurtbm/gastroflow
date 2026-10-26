-- =============================================================================
-- 0019 · Masa yönü (dikey/yatay)
-- =============================================================================
-- Uzun/dikdörtgen masalar gerçek salonda her zaman enine durmuyor — bazıları
-- duvara dik (dikey) yerleştiriliyor. Kat planı editöründeki kutu bunu
-- yansıtabilsin diye tek bir boolean yeterli; ayrı bir "açı" alanı (serbest
-- döndürme) bu ölçekte gereksiz karmaşıklık.
-- =============================================================================

alter table public.tables
  add column is_vertical boolean not null default false;
