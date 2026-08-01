-- =============================================================================
-- Zayiat (waste_reason) kısıt testleri
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('bbbbbbbb-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@t8.test','{"full_name":"T8 Patron"}');
insert into public.tenants (id, name, slug) values ('b0000000-0000-4000-8000-000000000000','Test Sekiz','test-sekiz');
insert into public.branches (id, tenant_id, name) values ('b1000000-0000-4000-8000-000000000000','b0000000-0000-4000-8000-000000000000','Merkez');
insert into public.memberships (user_id, tenant_id, branch_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000000','b1000000-0000-4000-8000-000000000000','owner');
insert into public.stock_locations (id, tenant_id, branch_id, name, kind)
  values ('b2000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000000','b1000000-0000-4000-8000-000000000000','Ana Depo','storage');
insert into public.inventory_items (id, tenant_id, name, base_unit, cost_per_base_unit)
  values ('b3000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000000','Domates','kg',20);

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","tenant_id":"b0000000-0000-4000-8000-000000000000","branch_id":"b1000000-0000-4000-8000-000000000000","app_role":"owner"}';

insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, waste_reason, note)
  values ('b0000000-0000-4000-8000-000000000000','b1000000-0000-4000-8000-000000000000','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','waste',-2,'spoilage','Bozulmuş domates');
select is(
  (select waste_reason from public.stock_movements where inventory_item_id='b3000000-0000-4000-8000-000000000001')::text,
  'spoilage', 'Sebep koduyla zayiat kaydı açılır');

select throws_ok(
  $$ insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity)
     values ('b0000000-0000-4000-8000-000000000000','b1000000-0000-4000-8000-000000000000','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','waste',-1) $$,
  '23514', null, 'Sebep kodu olmadan zayiat kaydı açılamaz');

select throws_ok(
  $$ insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity, waste_reason)
     values ('b0000000-0000-4000-8000-000000000000','b1000000-0000-4000-8000-000000000000','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','purchase_in',5,'spoilage') $$,
  '23514', null, 'Zayiat dışı harekette sebep kodu olamaz');

insert into public.stock_movements (tenant_id, branch_id, location_id, inventory_item_id, movement_type, quantity)
  values ('b0000000-0000-4000-8000-000000000000','b1000000-0000-4000-8000-000000000000','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','purchase_in',5);
select is(
  (select balance from public.v_stock_balance where inventory_item_id='b3000000-0000-4000-8000-000000000001')::numeric,
  3::numeric, 'Zayiat ve alış birlikte doğru bakiyeyi verir (-2 + 5 = 3)');

reset role;
select * from finish();

rollback;
