-- =============================================================================
-- 0013 · Zayiat girişi (sebep kodlu)
-- =============================================================================
-- Plan §6/§5: "Zayiat girişi (sebep kodlu)". Ayrı bir `waste_logs` tablosu
-- açmak yerine `stock_movements`'ı genişletiyoruz: zayiat zaten bir stok
-- hareketi (`movement_type = 'waste'`), ayrı bir tabloda tutmak iki kaynağın
-- birbirinden sapmasına (aynı olayın iki yerde farklı görünmesine) kapı
-- açardı. `waste_reason` yalnızca zayiat hareketlerinde dolu olabilir —
-- check kısıtı bunu zorunlu kılıyor.
-- =============================================================================

create type public.waste_reason as enum (
  'spoilage',       -- bozulma
  'prep_error',     -- hazırlık/pişirme hatası
  'dropped',        -- düşürüldü / kırıldı
  'expired',        -- son kullanma tarihi geçti
  'customer_return',-- müşteri iadesi
  'other'           -- diğer
);

alter table public.stock_movements
  add column waste_reason public.waste_reason,
  add constraint stock_movements_waste_reason_check
    check ((movement_type = 'waste') = (waste_reason is not null));
