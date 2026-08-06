-- =============================================================================
-- Kombo/menü kampanyası davranış testleri
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('bbbbbbbb-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p@t11.test','{"full_name":"T11 Patron"}'),
  ('bbbbbbbb-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w@t11.test','{"full_name":"T11 Garson"}');

insert into public.tenants (id, name, slug) values ('b1100000-0000-4000-8000-000000000000','Test Onbir','test-onbir');
insert into public.branches (id, tenant_id, name) values ('b1100000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000000','Merkez');
insert into public.memberships (user_id, tenant_id, branch_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000011','b1100000-0000-4000-8000-000000000000','b1100000-0000-4000-8000-000000000001','owner'),
  ('bbbbbbbb-0000-4000-8000-000000000012','b1100000-0000-4000-8000-000000000000','b1100000-0000-4000-8000-000000000001','waiter');
insert into public.categories (id, tenant_id, name) values ('b1100000-0000-4000-8000-000000000002','b1100000-0000-4000-8000-000000000000','Yiyecek');
insert into public.menu_items (id, tenant_id, category_id, name) values
  ('b1100000-0000-4000-8000-000000000003','b1100000-0000-4000-8000-000000000000','b1100000-0000-4000-8000-000000000002','Burger'),
  ('b1100000-0000-4000-8000-000000000004','b1100000-0000-4000-8000-000000000000','b1100000-0000-4000-8000-000000000002','Patates');

-- Başka bir tenant'ın ürünü — cross-tenant guard testinde kullanılacak.
insert into public.tenants (id, name, slug) values ('c1100000-0000-4000-8000-000000000000','Diğer Tenant','test-diger-onbir');
insert into public.categories (id, tenant_id, name) values ('c1100000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000000','Yiyecek');
insert into public.menu_items (id, tenant_id, category_id, name) values
  ('c1100000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000000','c1100000-0000-4000-8000-000000000002','Yabancı Ürün');

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000011","tenant_id":"b1100000-0000-4000-8000-000000000000","branch_id":"b1100000-0000-4000-8000-000000000001","app_role":"owner"}';

insert into public.combos (id, tenant_id, name, price)
  values ('b1100000-0000-4000-8000-000000000005','b1100000-0000-4000-8000-000000000000','Büyük Menü',120);
select is((select count(*) from public.combos)::int, 1, 'Patron kombo oluşturabilir');

insert into public.combo_items (tenant_id, combo_id, menu_item_id, quantity) values
  ('b1100000-0000-4000-8000-000000000000','b1100000-0000-4000-8000-000000000005','b1100000-0000-4000-8000-000000000003',1),
  ('b1100000-0000-4000-8000-000000000000','b1100000-0000-4000-8000-000000000005','b1100000-0000-4000-8000-000000000004',1);
select is((select count(*) from public.combo_items where combo_id='b1100000-0000-4000-8000-000000000005')::int, 2,
          'Kombo bileşenleri eklenebilir');

select throws_ok(
  $$ insert into public.combo_items (tenant_id, combo_id, menu_item_id, quantity)
     values ('b1100000-0000-4000-8000-000000000000','b1100000-0000-4000-8000-000000000005','c1100000-0000-4000-8000-000000000003',1) $$,
  '23514', null, 'Başka tenant''ın ürünü kombo bileşeni olamaz');

select throws_ok(
  $$ insert into public.combo_items (tenant_id, combo_id, menu_item_id, quantity)
     values ('b1100000-0000-4000-8000-000000000000', gen_random_uuid(), 'b1100000-0000-4000-8000-000000000003',1) $$,
  null, null, 'Var olmayan komboya bileşen eklenemez');

select throws_ok(
  $$ insert into public.combos (tenant_id, name, price) values ('b1100000-0000-4000-8000-000000000000','Büyük Menü',100) $$,
  '23505', null, 'Aynı isimde ikinci kombo açılamaz');

set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000012","tenant_id":"b1100000-0000-4000-8000-000000000000","branch_id":"b1100000-0000-4000-8000-000000000001","app_role":"waiter"}';

select is((select count(*) from public.combos)::int, 1, 'Garson komboları görür (POS''a gerekli)');
select is((select count(*) from public.combo_items)::int, 2, 'Garson kombo bileşenlerini görür');
select throws_ok(
  $$ insert into public.combos (tenant_id, name, price) values ('b1100000-0000-4000-8000-000000000000','Yeni Kombo',50) $$,
  '42501', null, 'Garson kombo oluşturamaz');

set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000011","tenant_id":"c1100000-0000-4000-8000-000000000000","branch_id":"c1100000-0000-4000-8000-000000000001","app_role":"owner"}';
select is_empty($$ select 1 from public.combos $$, 'Başka tenant komboları görmez');

reset role;
select * from finish();

rollback;
