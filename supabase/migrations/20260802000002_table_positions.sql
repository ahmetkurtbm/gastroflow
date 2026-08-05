-- =============================================================================
-- 0010 · Masalara görsel yerleşim konumu ekle
-- =============================================================================
-- Faz 7 sonrası geri bildirim: salon yönetimi (/settings/salon) düz bir liste,
-- gerçek restoranın masa yerleşimini yansıtmıyordu. Yüzde bazlı (0-100) x/y
-- koordinatı ekleniyor — piksel değil, çünkü canvas her ekran genişliğinde
-- (telefon/tablet/masaüstü) farklı boyutta render ediliyor; yüzde, hangi
-- ekranda olursa olsun aynı GÖRECELİ yerleşimi korur.
--
-- NULL bilinçli bir durum: yeni eklenen bir masa henüz yerleştirilmemiş
-- demektir. `/pos` ve editör bunu ayrı ayrı ele alır — bir alanda konumsuz
-- masa varsa o alan ızgara (grid) görünümüne düşer, yarı-yerleşmiş bir
-- canvas'ın masaları üst üste bindirmesindense.
-- =============================================================================

alter table public.tables
  add column pos_x numeric(5, 2) check (pos_x is null or pos_x between 0 and 100),
  add column pos_y numeric(5, 2) check (pos_y is null or pos_y between 0 and 100);

comment on column public.tables.pos_x is
  'Salon editöründeki göreli X konumu (0-100, alan genişliğinin yüzdesi). NULL = henüz yerleştirilmedi.';
comment on column public.tables.pos_y is
  'Salon editöründeki göreli Y konumu (0-100, alan yüksekliğinin yüzdesi). NULL = henüz yerleştirilmedi.';
