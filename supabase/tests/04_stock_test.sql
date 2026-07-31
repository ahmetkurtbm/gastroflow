-- =============================================================================
-- Stok defteri davranış testleri
-- =============================================================================
-- Üç iddiayı kanıtlar:
--   1. Bakiye = SUM(quantity). Ledger asla değiştirilemez/silinemez — patron
--      dahil kimse.
--   2. Aynı olayın (reference_type, reference_id) + ürün kombinasyonu ikinci
--      kez deftere yazılamaz — satış düşümünün idempotency garantisi.
--   3. par_level eşiği aşılınca/altına düşünce v_low_stock otomatik güncellenir.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('eeeeeeee-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p@t3.test','{"full_name":"T3 Patron"}'),
  ('eeeeeeee-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w@t3.test','{"full_name":"T3 Garson"}');

insert into public.tenants (id, name, slug) values ('e0000000-0000-4000-8000-000000000000','Test 3','test-uc');
insert into public.branches (id, tenant_id, name) values ('e1000000-0000-4000-8000-000000000000','e0000000-0000-4000-8000-000000000000','Merkez');
insert into public.memberships (user_id, tenant_id, branch_id, role) values
  ('eeeeeeee-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000000','e1000000-0000-4000-8000-000000000000','owner'),
  ('eeeeeeee-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000000','e1000000-0000-4000-8000-000000000000','waiter');

insert into public.stock_locations (id, tenant_id, branch_id, name, kind)
  values ('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000000','e1000000-0000-4000-8000-000000000000','Ana Depo','storage');
insert into public.inventory_items (id, tenant_id, name, base_unit, cost_per_base_unit)
  values ('e3000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000000','Un','kg',30);

set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000001","tenant_id":"e0000000-0000-4000-8000-000000000000","branch_id":"e1000000-0000-4000-8000-000000000000","app_role":"owner"}';

insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, reference_type, reference_id)
  values ('e0000000-0000-4000-8000-000000000000','e1000000-0000-4000-8000-000000000000','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','purchase_in',10,null,null);

select is(
  (select balance from public.v_stock_balance where inventory_item_id='e3000000-0000-4000-8000-000000000001')::numeric,
  10::numeric, 'Satın alma ile bakiye 10 olur');

insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, reference_type, reference_id)
  values ('e0000000-0000-4000-8000-000000000000','e1000000-0000-4000-8000-000000000000','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','sale_out',-3,'order_line','a0000000-0000-4000-8000-000000000001');

select is(
  (select balance from public.v_stock_balance where inventory_item_id='e3000000-0000-4000-8000-000000000001')::numeric,
  7::numeric, 'Satıştan düşüm sonrası bakiye 7 olur');

-- Depletion idempotency: aynı (order_line, ürün) ikinci kez yazılamaz.
select throws_ok(
  $$ insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, reference_type, reference_id)
     values ('e0000000-0000-4000-8000-000000000000','e1000000-0000-4000-8000-000000000000','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','sale_out',-3,'order_line','a0000000-0000-4000-8000-000000000001') $$,
  '23505', null,
  'Aynı referans+ürün ile çift düşüm reddedilir (idempotency)');

-- Append-only: patron dahil hiç kimse ledger'ı değiştiremez.
select throws_ok(
  $$ update public.stock_movements set quantity = 999 where reference_id = 'a0000000-0000-4000-8000-000000000001' $$,
  null, null, 'Patron bile hareketi değiştiremez');
select throws_ok(
  $$ delete from public.stock_movements where reference_id = 'a0000000-0000-4000-8000-000000000001' $$,
  null, null, 'Patron bile hareketi silemez');

-- par_level eşiği.
insert into public.par_levels (tenant_id, location_id, inventory_item_id, reorder_point)
  values ('e0000000-0000-4000-8000-000000000000','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001',8);

select is((select count(*) from public.v_low_stock where inventory_item_id='e3000000-0000-4000-8000-000000000001')::int, 1,
          'Bakiye 7, eşik 8 iken kritik listede görünür');

update public.par_levels set reorder_point = 5 where inventory_item_id='e3000000-0000-4000-8000-000000000001';

select is((select count(*) from public.v_low_stock where inventory_item_id='e3000000-0000-4000-8000-000000000001')::int, 0,
          'Eşik 5''e inince kritik listeden çıkar');

-- Rol bazlı erişim.
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000002","tenant_id":"e0000000-0000-4000-8000-000000000000","branch_id":"e1000000-0000-4000-8000-000000000000","app_role":"waiter"}';

select is_empty($$ select 1 from public.stock_movements $$, 'Garson stok hareketlerini göremez');
select is_empty($$ select 1 from public.v_stock_balance $$, 'Garson bakiye görünümünü göremez');
select throws_ok(
  $$ insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity)
     values ('e0000000-0000-4000-8000-000000000000','e1000000-0000-4000-8000-000000000000','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','waste',-1) $$,
  '42501', null, 'Garson stok hareketi yazamaz');

-- Kiracı izolasyonu.
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000001","tenant_id":"a0000000-0000-4000-8000-000000000000","branch_id":"a1000000-0000-4000-8000-000000000000","app_role":"owner"}';

select is_empty($$ select 1 from public.stock_movements $$, 'Başka tenant hareketleri göremez');
select is_empty($$ select 1 from public.v_low_stock $$, 'Başka tenant kritik listeyi göremez');

reset role;
select * from finish();

rollback;
