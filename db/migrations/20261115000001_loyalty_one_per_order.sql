-- Bir adisyon için en fazla bir puan kazanımı ve en fazla bir puan harcaması.
-- Uygulama kodundaki "zaten var mı?" kontrolü ile ekleme arasında yarış vardı:
-- paralel iki istek aynı adisyonda puanı iki kez harcayabiliyordu. Kısmi
-- benzersiz indeksler bunu veritabanı düzeyinde kapatır; 'adjustment' satırları
-- ve adisyonsuz (order_id null) hareketler etkilenmez.
create unique index if not exists loyalty_transactions_one_earn_per_order
  on public.loyalty_transactions (order_id)
  where kind = 'earn';

create unique index if not exists loyalty_transactions_one_redeem_per_order
  on public.loyalty_transactions (order_id)
  where kind = 'redeem';
