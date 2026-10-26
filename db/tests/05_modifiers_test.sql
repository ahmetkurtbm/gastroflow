-- =============================================================================
-- Modifier davranış testleri
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('ffffffff-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p@t4.test','{"full_name":"T4 Patron"}'),
  ('ffffffff-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w@t4.test','{"full_name":"T4 Garson"}');

insert into public.tenants (id, name, slug) values ('f0000000-0000-4000-8000-000000000000','Test 4','test-dort');
insert into public.branches (id, tenant_id, name) values ('f1000000-0000-4000-8000-000000000000','f0000000-0000-4000-8000-000000000000','Merkez');
insert into public.memberships (user_id, tenant_id, branch_id, role) values
  ('ffffffff-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000000','f1000000-0000-4000-8000-000000000000','owner'),
  ('ffffffff-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000000','f1000000-0000-4000-8000-000000000000','waiter');
insert into public.categories (id, tenant_id, name) values ('f2000000-0000-4000-8000-000000000000','f0000000-0000-4000-8000-000000000000','Yiyecek');
insert into public.menu_items (id, tenant_id, category_id, name) values ('f3000000-0000-4000-8000-000000000000','f0000000-0000-4000-8000-000000000000','f2000000-0000-4000-8000-000000000000','Pizza');

set local role authenticated;
set local request.jwt.claims = '{"sub":"ffffffff-0000-4000-8000-000000000001","tenant_id":"f0000000-0000-4000-8000-000000000000","branch_id":"f1000000-0000-4000-8000-000000000000","app_role":"owner"}';

insert into public.modifier_groups (id, tenant_id, menu_item_id, name, min_select, max_select)
  values ('f4000000-0000-4000-8000-000000000000','f0000000-0000-4000-8000-000000000000','f3000000-0000-4000-8000-000000000000','Boyut',1,1);
select is((select count(*) from public.modifier_groups)::int, 1, 'Patron modifier grubu ekleyebilir');

insert into public.modifiers (id, tenant_id, modifier_group_id, name, price_delta)
  values ('f5000000-0000-4000-8000-000000000000','f0000000-0000-4000-8000-000000000000','f4000000-0000-4000-8000-000000000000','Büyük boy',20);
select is(
  (select price_delta from public.modifiers where id='f5000000-0000-4000-8000-000000000000')::numeric,
  20::numeric, 'Modifier fiyat farkı doğru kaydedilir');

select throws_ok(
  $$ insert into public.modifiers (tenant_id, modifier_group_id, name, price_delta)
     values ('f0000000-0000-4000-8000-000000000000', gen_random_uuid(), 'Hayalet', 5) $$,
  null, null, 'Var olmayan gruba modifier eklenemez');

select throws_ok(
  $$ insert into public.modifier_groups (tenant_id, menu_item_id, name, min_select, max_select)
     values ('f0000000-0000-4000-8000-000000000000','f3000000-0000-4000-8000-000000000000','Kötü',3,1) $$,
  '23514', null, 'max_select min_select''ten küçük olamaz');

set local request.jwt.claims = '{"sub":"ffffffff-0000-4000-8000-000000000002","tenant_id":"f0000000-0000-4000-8000-000000000000","branch_id":"f1000000-0000-4000-8000-000000000000","app_role":"waiter"}';
select is((select count(*) from public.modifier_groups)::int, 1, 'Garson modifier gruplarını görür (POS''a gerekli)');
select is((select count(*) from public.modifiers)::int, 1, 'Garson modifier''ları görür');
select throws_ok(
  $$ insert into public.modifier_groups (tenant_id, menu_item_id, name) values ('f0000000-0000-4000-8000-000000000000','f3000000-0000-4000-8000-000000000000','Yeni') $$,
  '42501', null, 'Garson modifier grubu yazamaz');

set local request.jwt.claims = '{"sub":"ffffffff-0000-4000-8000-000000000001","tenant_id":"a0000000-0000-4000-8000-000000000000","branch_id":"a1000000-0000-4000-8000-000000000000","app_role":"owner"}';
select is_empty($$ select 1 from public.modifier_groups $$, 'Başka tenant modifier görmez');

reset role;
select * from finish();

rollback;
