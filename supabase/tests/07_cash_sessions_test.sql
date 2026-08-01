-- =============================================================================
-- Kasa oturumu (vardiya) davranış testleri
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('dddddddd-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p@t6.test','{"full_name":"T6 Patron"}'),
  ('dddddddd-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c@t6.test','{"full_name":"T6 Kasa"}'),
  ('dddddddd-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w@t6.test','{"full_name":"T6 Garson"}');

insert into public.tenants (id, name, slug) values ('d0000000-0000-4000-8000-000000000000','Test Altı','test-alti');
insert into public.branches (id, tenant_id, name) values
  ('d1000000-0000-4000-8000-000000000000','d0000000-0000-4000-8000-000000000000','Merkez'),
  ('d2000000-0000-4000-8000-000000000000','d0000000-0000-4000-8000-000000000000','Şube 2');
insert into public.memberships (user_id, tenant_id, branch_id, role) values
  ('dddddddd-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','owner'),
  ('dddddddd-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','cashier'),
  ('dddddddd-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','waiter');

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000002","tenant_id":"d0000000-0000-4000-8000-000000000000","branch_id":"d1000000-0000-4000-8000-000000000000","app_role":"cashier"}';

insert into public.cash_sessions (id, tenant_id, branch_id, opening_float, opened_by)
  values ('d3000000-0000-4000-8000-000000000000','d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000',500,'dddddddd-0000-4000-8000-000000000002');
select is(
  (select status from public.cash_sessions where id='d3000000-0000-4000-8000-000000000000')::text,
  'open', 'Kasiyer kendi şubesinde oturum açabilir');

select throws_ok(
  $$ insert into public.cash_sessions (tenant_id, branch_id, opening_float, opened_by)
     values ('d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000',0,'dddddddd-0000-4000-8000-000000000002') $$,
  '23505', null, 'Aynı şubede ikinci açık oturum açılamaz');

select throws_ok(
  $$ insert into public.cash_sessions (tenant_id, branch_id, opening_float, opened_by)
     values ('d0000000-0000-4000-8000-000000000000','d2000000-0000-4000-8000-000000000000',0,'dddddddd-0000-4000-8000-000000000002') $$,
  '42501', null, 'Kasiyer başka şubede oturum açamaz');

set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000003","tenant_id":"d0000000-0000-4000-8000-000000000000","branch_id":"d1000000-0000-4000-8000-000000000000","app_role":"waiter"}';
select is_empty($$ select 1 from public.cash_sessions $$, 'Garson kasa oturumlarını göremez');

set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000001","tenant_id":"d0000000-0000-4000-8000-000000000000","branch_id":"d1000000-0000-4000-8000-000000000000","app_role":"owner"}';

insert into public.cash_sessions (id, tenant_id, branch_id, opening_float, opened_by)
  values ('d4000000-0000-4000-8000-000000000000','d0000000-0000-4000-8000-000000000000','d2000000-0000-4000-8000-000000000000',0,'dddddddd-0000-4000-8000-000000000001');
select is(
  (select count(*) from public.cash_sessions where status='open')::int,
  2, 'Patron başka şubede de oturum açabilir');

update public.cash_sessions
  set status = 'closed', counted_cash = 480, closed_by = 'dddddddd-0000-4000-8000-000000000001'
  where id = 'd3000000-0000-4000-8000-000000000000';
select isnt(
  (select closed_at from public.cash_sessions where id='d3000000-0000-4000-8000-000000000000'),
  null, 'Kapanış zamanı otomatik damgalanır');

insert into public.orders (id, tenant_id, branch_id, client_key) values
  ('d5000000-0000-4000-8000-000000000000','d0000000-0000-4000-8000-000000000000','d1000000-0000-4000-8000-000000000000','order-1');
insert into public.payments (id, tenant_id, order_id, method, amount, cash_session_id, client_key)
  values ('d6000000-0000-4000-8000-000000000000','d0000000-0000-4000-8000-000000000000','d5000000-0000-4000-8000-000000000000','cash',150,'d4000000-0000-4000-8000-000000000000','pay-1');
select is(
  (select cash_session_id from public.payments where id='d6000000-0000-4000-8000-000000000000')::text,
  'd4000000-0000-4000-8000-000000000000', 'Ödeme açık kasa oturumuna bağlanır');

set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000001","tenant_id":"a0000000-0000-4000-8000-000000000000","branch_id":"a1000000-0000-4000-8000-000000000000","app_role":"owner"}';
select is_empty($$ select 1 from public.cash_sessions $$, 'Başka tenant kasa oturumlarını görmez');

reset role;
select is(
  (select count(*) from public.cash_sessions)::int, 2, 'İki oturum da veritabanında duruyor (sanity check)');

select * from finish();

rollback;
