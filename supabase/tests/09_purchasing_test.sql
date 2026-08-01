-- =============================================================================
-- Tedarik zinciri (satın alma) davranış testleri
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@t9.test','{"full_name":"T9 Patron"}'),
  ('aaaaaaaa-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s@t9.test','{"full_name":"T9 Depo"}'),
  ('aaaaaaaa-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@t9.test','{"full_name":"T9 Muhasebe"}');

insert into public.tenants (id, name, slug) values ('a0000000-0000-4000-8000-000000000000','Test Dokuz','test-dokuz');
insert into public.branches (id, tenant_id, name) values ('a1000000-0000-4000-8000-000000000000','a0000000-0000-4000-8000-000000000000','Merkez');
insert into public.memberships (user_id, tenant_id, branch_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000000','a1000000-0000-4000-8000-000000000000','owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000000','a1000000-0000-4000-8000-000000000000','storekeeper'),
  ('aaaaaaaa-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000000','a1000000-0000-4000-8000-000000000000','accountant');

insert into public.inventory_items (id, tenant_id, name, base_unit, cost_per_base_unit)
  values ('a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000000','Un','kg',30);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","tenant_id":"a0000000-0000-4000-8000-000000000000","branch_id":"a1000000-0000-4000-8000-000000000000","app_role":"storekeeper"}';

insert into public.suppliers (id, tenant_id, name, lead_time_days)
  values ('a3000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000000','Un Tedarik A.Ş.',2);
select is((select count(*) from public.suppliers)::int, 1, 'Depo tedarikçi ekleyebilir');

insert into public.supplier_items (id, tenant_id, supplier_id, inventory_item_id, price, min_order_quantity)
  values ('a4000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000000','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',28.5,25);

insert into public.purchase_orders (id, tenant_id, branch_id, supplier_id, requested_by, client_key)
  values ('a5000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000000','a1000000-0000-4000-8000-000000000000','a3000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002','po-1');
select is(
  (select status from public.purchase_orders where id='a5000000-0000-4000-8000-000000000001')::text,
  'pending_approval', 'Depo siparişi onay bekleyen olarak açar');

insert into public.po_lines (id, tenant_id, po_id, inventory_item_id, quantity, unit_price)
  values ('a6000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000000','a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',50,28.5);
select is((select count(*) from public.po_lines)::int, 1, 'Onay bekleyen siparişe satır eklenebilir');

-- Depo kendi siparişini onaylayamaz (trigger is_manager() şart koşuyor).
select throws_ok(
  $$ update public.purchase_orders set status='approved' where id='a5000000-0000-4000-8000-000000000001' $$,
  'P0001', null, 'Depo siparişi onaylayamaz');

set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","tenant_id":"a0000000-0000-4000-8000-000000000000","branch_id":"a1000000-0000-4000-8000-000000000000","app_role":"owner"}';

update public.purchase_orders set status='approved' where id='a5000000-0000-4000-8000-000000000001';
select is(
  (select status from public.purchase_orders where id='a5000000-0000-4000-8000-000000000001')::text,
  'approved', 'Patron onay bekleyen siparişi onaylayabilir');
select isnt(
  (select decided_at from public.purchase_orders where id='a5000000-0000-4000-8000-000000000001'),
  null, 'Onay zamanı otomatik damgalanır');

-- Onaylanmış siparişe artık yeni satır eklenemez.
select throws_ok(
  $$ insert into public.po_lines (tenant_id, po_id, inventory_item_id, quantity, unit_price)
     values ('a0000000-0000-4000-8000-000000000000','a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',1,28.5) $$,
  null, null, 'Onaylanmış siparişe yeni satır eklenemez (aynı üründen zaten var, ikinci kez denense de reddedilir)');

set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","tenant_id":"a0000000-0000-4000-8000-000000000000","branch_id":"a1000000-0000-4000-8000-000000000000","app_role":"storekeeper"}';

-- Mal kabul: depo, onaylanmış siparişte satırı güncelleyebilir.
update public.po_lines set received_quantity = 48 where id='a6000000-0000-4000-8000-000000000001';
select is(
  (select received_quantity from public.po_lines where id='a6000000-0000-4000-8000-000000000001')::numeric,
  48::numeric, 'Depo mal kabulde alınan miktarı girebilir');

update public.purchase_orders set status='received' where id='a5000000-0000-4000-8000-000000000001';
select is(
  (select status from public.purchase_orders where id='a5000000-0000-4000-8000-000000000001')::text,
  'received', 'Depo mal kabul sonrası siparişi kapatabilir');
select isnt(
  (select received_at from public.purchase_orders where id='a5000000-0000-4000-8000-000000000001'),
  null, 'Mal kabul zamanı otomatik damgalanır');

-- Onaydan önceki bir siparişte mal kabul yapılamaz (yeni bir sipariş üzerinden).
insert into public.purchase_orders (id, tenant_id, branch_id, supplier_id, requested_by, client_key)
  values ('a5000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000000','a1000000-0000-4000-8000-000000000000','a3000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002','po-2');
select throws_ok(
  $$ update public.purchase_orders set status='received' where id='a5000000-0000-4000-8000-000000000002' $$,
  'P0001', null, 'Onay bekleyen sipariş doğrudan mal kabul edilemez');

-- Muhasebe okuyabilir ama yazamaz.
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","tenant_id":"a0000000-0000-4000-8000-000000000000","branch_id":"a1000000-0000-4000-8000-000000000000","app_role":"accountant"}';
select is((select count(*) from public.purchase_orders)::int, 2, 'Muhasebe siparişleri görür');
select throws_ok(
  $$ insert into public.suppliers (tenant_id, name) values ('a0000000-0000-4000-8000-000000000000','Yeni Tedarikçi') $$,
  '42501', null, 'Muhasebe tedarikçi ekleyemez');

set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","tenant_id":"c0000000-0000-4000-8000-000000000000","branch_id":"c1000000-0000-4000-8000-000000000000","app_role":"owner"}';
select is_empty($$ select 1 from public.purchase_orders $$, 'Başka tenant siparişleri görmez');

reset role;
select * from finish();

rollback;
