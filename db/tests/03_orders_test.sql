-- =============================================================================
-- Sipariş davranış testleri
-- =============================================================================
-- Faz 2'nin en kritik iddiası burada kanıtlanıyor:
--
--   "Offline alınan bir sipariş, bağlantı gelince iki kez kaydedilemez."
--
-- Rakip sistemlerdeki en pahalı hata bu (araştırmadaki 7. madde): bağlantı
-- döndüğünde aynı işlem tekrar gönderiliyor ve müşteriden iki kez tahsilat
-- yapılıyor. Çözüm istemcinin ürettiği `client_key` ve üzerindeki unique
-- kısıtı — koruma uygulama mantığında değil, veritabanı kısıtında.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('dddddddd-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','g@t2.test','{"full_name":"T2 Garson"}');

insert into public.tenants (id, name, slug)
  values ('d0000000-0000-4000-8000-000000000000','Test 2','test-iki');
insert into public.branches (id, tenant_id, name)
  values ('d1000000-0000-4000-8000-000000000000','d0000000-0000-4000-8000-000000000000','Merkez');
insert into public.memberships (user_id, tenant_id, branch_id, role) values
  ('dddddddd-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','waiter');

insert into public.tables (id, tenant_id, branch_id, name) values
  ('d2000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','1'),
  ('d2000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','2');

insert into public.categories (id, tenant_id, name)
  values ('d3000000-0000-4000-8000-000000000000','d0000000-0000-4000-8000-000000000000','Yiyecek');
insert into public.menu_items (id, tenant_id, category_id, name)
  values ('d4000000-0000-4000-8000-000000000000','d0000000-0000-4000-8000-000000000000','d3000000-0000-4000-8000-000000000000','Test Ürün');

-- -----------------------------------------------------------------------------
-- Adisyon numarası
-- -----------------------------------------------------------------------------
insert into public.orders (id, tenant_id, branch_id, table_id, client_key) values
  ('d5000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','d2000000-0000-4000-8000-000000000001','key-1'),
  ('d5000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','d2000000-0000-4000-8000-000000000002','key-2');

select is((select order_no from public.orders where id='d5000000-0000-4000-8000-000000000001')::int, 1,
          'İlk adisyon 1 numarayı alır');
select is((select order_no from public.orders where id='d5000000-0000-4000-8000-000000000002')::int, 2,
          'Sonraki adisyon 2 numarayı alır');

-- -----------------------------------------------------------------------------
-- Offline senkron koruması
-- -----------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.orders (tenant_id, branch_id, table_id, client_key)
     values ('d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','d2000000-0000-4000-8000-000000000001','key-1') $$,
  '23505', null,
  'Aynı client_key ile ikinci gönderim reddedilir — çift adisyon imkânsız');

select throws_ok(
  $$ insert into public.orders (tenant_id, branch_id, table_id, client_key)
     values ('d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','d2000000-0000-4000-8000-000000000001','key-3') $$,
  '23505', null,
  'Aynı masada ikinci açık adisyon reddedilir');

-- Kapanan adisyondan sonra masa yeniden kullanılabilmeli.
update public.orders set status='closed', closed_at=now()
  where id='d5000000-0000-4000-8000-000000000001';
insert into public.orders (tenant_id, branch_id, table_id, client_key)
  values ('d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','d2000000-0000-4000-8000-000000000001','key-4');

select is((select count(*) from public.orders where table_id='d2000000-0000-4000-8000-000000000001')::int, 2,
          'Adisyon kapanınca aynı masaya yeni adisyon açılabilir');

-- -----------------------------------------------------------------------------
-- Mutfak zaman damgaları (KDS süre sayacının temeli)
-- -----------------------------------------------------------------------------
insert into public.order_lines (id, tenant_id, order_id, menu_item_id, quantity, unit_price, client_key)
  values ('d6000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000000','d5000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000000',2,120,'line-1');

select is((select sent_at from public.order_lines where id='d6000000-0000-4000-8000-000000000001'), null,
          'Yeni satırda gönderim zamanı boştur');

update public.order_lines set status='sent' where id='d6000000-0000-4000-8000-000000000001';

select isnt((select sent_at from public.order_lines where id='d6000000-0000-4000-8000-000000000001'), null,
            'Mutfağa gönderilince zaman otomatik damgalanır');

-- -----------------------------------------------------------------------------
-- Şube izolasyonu
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000001","tenant_id":"d0000000-0000-4000-8000-000000000000","branch_id":"00000000-0000-4000-8000-000000000999","app_role":"waiter"}';

select is_empty($$ select 1 from public.orders $$,
                'Garson başka şubenin adisyonlarını göremez');

reset role;
select * from finish();

rollback;
