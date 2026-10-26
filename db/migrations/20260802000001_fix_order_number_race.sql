-- =============================================================================
-- 0009 · order_no atamasındaki eşzamanlılık yarışını düzelt
-- =============================================================================
-- Faz 7 yük testi (scripts/load-test.mjs) 15 garsonun aynı anda farklı
-- masalarda adisyon açtığı senaryoda %40 oranında 23505 (unique_violation)
-- gösterdi: `orders_assign_number()` klasik bir TOCTOU yarışı içeriyordu
-- (SELECT MAX(order_no)+1, sonra INSERT — aradaki boşlukta başka bir
-- transaction aynı numarayı alabiliyordu).
--
-- Daha vahimi: `openTable` sunucu eylemi (src/lib/orders/actions.ts) bu
-- 23505'i her zaman "client_key zaten gönderilmiş, adisyon zaten var" olarak
-- yorumlayıp kullanıcıyı POS ekranına yönlendiriyordu — order_no çakışmasında
-- ise adisyon HİÇ OLUŞMAMIŞ oluyordu; garson boş bir ekrana düşüyordu.
--
-- Çözüm: numaralandırmayı şube başına bir advisory lock ile serileştir.
-- Advisory lock transaction sonunda otomatik serbest kalır, tablo/satır
-- kilidi gerektirmez, ek yetki istemez (pg_advisory_xact_lock herkese açık).
-- =============================================================================

create or replace function public.orders_assign_number()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.order_no is null then
    -- Aynı şubede eşzamanlı adisyon açılışlarını sıraya sok — kilit bu
    -- transaction commit/rollback olunca otomatik düşer.
    perform pg_advisory_xact_lock(hashtextextended(new.branch_id::text, 0));
    select coalesce(max(o.order_no), 0) + 1 into new.order_no
    from public.orders o where o.branch_id = new.branch_id;
  end if;
  return new;
end;
$$;
