-- =============================================================================
-- Bildirim motoru (outbox) davranış testleri
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('99999999-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@t10.test','{"full_name":"T10 Patron"}'),
  ('99999999-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w@t10.test','{"full_name":"T10 Garson"}');

insert into public.tenants (id, name, slug) values ('90000000-0000-4000-8000-000000000000','Test On','test-on');
insert into public.branches (id, tenant_id, name) values ('91000000-0000-4000-8000-000000000000','90000000-0000-4000-8000-000000000000','Merkez');
insert into public.memberships (user_id, tenant_id, branch_id, role) values
  ('99999999-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000000','91000000-0000-4000-8000-000000000000','owner'),
  ('99999999-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000000','91000000-0000-4000-8000-000000000000','waiter');

insert into public.stock_locations (id, tenant_id, branch_id, name, kind)
  values ('92000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000000','91000000-0000-4000-8000-000000000000','Ana Depo','storage');
insert into public.inventory_items (id, tenant_id, name, base_unit, cost_per_base_unit)
  values ('93000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000000','Un','kg',30);
insert into public.par_levels (tenant_id, location_id, inventory_item_id, reorder_point)
  values ('90000000-0000-4000-8000-000000000000','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',10);

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-0000-4000-8000-000000000001","tenant_id":"90000000-0000-4000-8000-000000000000","branch_id":"91000000-0000-4000-8000-000000000000","app_role":"owner"}';

-- Bakiye 5 (eşik 10'un altında) → low_stock kuyruğa girmeli.
insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity)
  values ('90000000-0000-4000-8000-000000000000','91000000-0000-4000-8000-000000000000','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','purchase_in',5);
select is(
  (select count(*) from public.notification_outbox where tenant_id='90000000-0000-4000-8000-000000000000' and event_type='low_stock')::int,
  1, 'Eşiğin altına düşünce low_stock kuyruğa girer');

-- Aynı ürün/lokasyonda ikinci hareket → dedup, ikinci satır AÇILMAMALI.
insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, waste_reason)
  values ('90000000-0000-4000-8000-000000000000','91000000-0000-4000-8000-000000000000','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','waste',-1,'spoilage');
select is(
  (select count(*) from public.notification_outbox where tenant_id='90000000-0000-4000-8000-000000000000' and event_type='low_stock')::int,
  1, 'Aynı gün içinde ikinci düşüş için tekrar kuyruğa girmez (dedup)');

-- Bakiyeyi negatife çek → negative_stock kuyruğa girmeli.
insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, waste_reason)
  values ('90000000-0000-4000-8000-000000000000','91000000-0000-4000-8000-000000000000','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','waste',-10,'other');
select is(
  (select count(*) from public.notification_outbox where tenant_id='90000000-0000-4000-8000-000000000000' and event_type='negative_stock')::int,
  1, 'Negatif bakiyede negative_stock kuyruğa girer');

-- İkram isteği → approval_pending.
insert into public.categories (id, tenant_id, name) values ('9a000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000000','Yiyecek');
insert into public.menu_items (id, tenant_id, category_id, name) values ('9b000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000000','9a000000-0000-4000-8000-000000000001','Test Ürün');
insert into public.orders (id, tenant_id, branch_id, client_key)
  values ('94000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000000','91000000-0000-4000-8000-000000000000','order-1');
insert into public.order_lines (id, tenant_id, order_id, menu_item_id, quantity, unit_price, client_key)
  values ('95000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000000','94000000-0000-4000-8000-000000000001',
    '9b000000-0000-4000-8000-000000000001', 1, 10, 'line-1');

set local request.jwt.claims = '{"sub":"99999999-0000-4000-8000-000000000002","tenant_id":"90000000-0000-4000-8000-000000000000","branch_id":"91000000-0000-4000-8000-000000000000","app_role":"waiter"}';
insert into public.line_discounts (tenant_id, order_line_id, kind, value, reason, requested_by)
  values ('90000000-0000-4000-8000-000000000000','95000000-0000-4000-8000-000000000001','comp',0,'Test','99999999-0000-4000-8000-000000000002');

set local request.jwt.claims = '{"sub":"99999999-0000-4000-8000-000000000001","tenant_id":"90000000-0000-4000-8000-000000000000","branch_id":"91000000-0000-4000-8000-000000000000","app_role":"owner"}';
select is(
  (select count(*) from public.notification_outbox where tenant_id='90000000-0000-4000-8000-000000000000' and event_type='approval_pending')::int,
  1, 'İkram isteği açılınca approval_pending kuyruğa girer');

-- Satın alma siparişi → approval_pending sayısı 2 olmalı.
insert into public.suppliers (id, tenant_id, name) values ('96000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000000','Test Tedarikçi');
insert into public.purchase_orders (id, tenant_id, branch_id, supplier_id, requested_by, client_key)
  values ('97000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000000','91000000-0000-4000-8000-000000000000','96000000-0000-4000-8000-000000000001','99999999-0000-4000-8000-000000000001','po-1');
select is(
  (select count(*) from public.notification_outbox where tenant_id='90000000-0000-4000-8000-000000000000' and event_type='approval_pending')::int,
  2, 'Satın alma siparişi de approval_pending kuyruğuna eklenir');

-- Sipariş onaylanınca po_approved.
update public.purchase_orders set status='approved' where id='97000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from public.notification_outbox where tenant_id='90000000-0000-4000-8000-000000000000' and event_type='po_approved')::int,
  1, 'Sipariş onaylanınca po_approved kuyruğa girer');

-- Kasa oturumu: küçük fark (eşik altı) → yalnızca day_end_summary, cash_shortage YOK.
insert into public.cash_sessions (id, tenant_id, branch_id, opening_float, opened_by)
  values ('98000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000000','91000000-0000-4000-8000-000000000000',100,'99999999-0000-4000-8000-000000000001');
update public.cash_sessions set status='closed', counted_cash=105, closed_by='99999999-0000-4000-8000-000000000001'
  where id='98000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from public.notification_outbox where tenant_id='90000000-0000-4000-8000-000000000000' and event_type='day_end_summary')::int,
  1, 'Kasa kapanışında day_end_summary her zaman kuyruğa girer');
select is(
  (select count(*) from public.notification_outbox where tenant_id='90000000-0000-4000-8000-000000000000' and event_type='cash_shortage')::int,
  0, 'Eşik altı fark cash_shortage tetiklemez');

-- Büyük fark (eşik üstü) → cash_shortage de girmeli.
insert into public.cash_sessions (id, tenant_id, branch_id, opening_float, opened_by)
  values ('98000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000000','91000000-0000-4000-8000-000000000000',100,'99999999-0000-4000-8000-000000000001');
update public.cash_sessions set status='closed', counted_cash=50, closed_by='99999999-0000-4000-8000-000000000001'
  where id='98000000-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.notification_outbox where tenant_id='90000000-0000-4000-8000-000000000000' and event_type='cash_shortage')::int,
  1, 'Eşik üstü fark cash_shortage tetikler');

-- notification_rules: patron yazabilir.
insert into public.notification_rules (tenant_id, event_type, recipient_roles)
  values ('90000000-0000-4000-8000-000000000000','low_stock', array['manager','owner']::public.app_role[]);
select is((select count(*) from public.notification_rules)::int, 1, 'Patron bildirim kuralı ekleyebilir');

-- RLS: garson outbox'ı göremez.
set local request.jwt.claims = '{"sub":"99999999-0000-4000-8000-000000000002","tenant_id":"90000000-0000-4000-8000-000000000000","branch_id":"91000000-0000-4000-8000-000000000000","app_role":"waiter"}';
select is_empty($$ select 1 from public.notification_outbox $$, 'Garson bildirim kuyruğunu göremez');
select throws_ok(
  $$ insert into public.notification_rules (tenant_id, event_type, recipient_roles)
     values ('90000000-0000-4000-8000-000000000000','negative_stock', array['owner']::public.app_role[]) $$,
  '42501', null, 'Garson bildirim kuralı ekleyemez');

-- Kiracı izolasyonu.
set local request.jwt.claims = '{"sub":"99999999-0000-4000-8000-000000000001","tenant_id":"a0000000-0000-4000-8000-000000000000","branch_id":"a1000000-0000-4000-8000-000000000000","app_role":"owner"}';
select is_empty($$ select 1 from public.notification_outbox $$, 'Başka tenant bildirim kuyruğunu görmez');

reset role;
select * from finish();

rollback;
