-- =============================================================================
-- İkram/iskonto onay akışı davranış testleri
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('eeeeeeee-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p@t5.test','{"full_name":"T5 Patron"}'),
  ('eeeeeeee-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w@t5.test','{"full_name":"T5 Garson"}');

insert into public.tenants (id, name, slug) values ('e0000000-0000-4000-8000-000000000000','Test Beş','test-bes');
insert into public.branches (id, tenant_id, name) values ('e1000000-0000-4000-8000-000000000000','e0000000-0000-4000-8000-000000000000','Merkez');
insert into public.memberships (user_id, tenant_id, branch_id, role) values
  ('eeeeeeee-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000000','e1000000-0000-4000-8000-000000000000','owner'),
  ('eeeeeeee-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000000','e1000000-0000-4000-8000-000000000000','waiter');
insert into public.categories (id, tenant_id, name) values ('e2000000-0000-4000-8000-000000000000','e0000000-0000-4000-8000-000000000000','Yiyecek');
insert into public.menu_items (id, tenant_id, category_id, name) values ('e3000000-0000-4000-8000-000000000000','e0000000-0000-4000-8000-000000000000','e2000000-0000-4000-8000-000000000000','Pizza');
insert into public.orders (id, tenant_id, branch_id, client_key) values
  ('e4000000-0000-4000-8000-000000000000','e0000000-0000-4000-8000-000000000000','e1000000-0000-4000-8000-000000000000','order-1');
insert into public.order_lines (id, tenant_id, order_id, menu_item_id, quantity, unit_price, client_key) values
  ('e5000000-0000-4000-8000-000000000000','e0000000-0000-4000-8000-000000000000','e4000000-0000-4000-8000-000000000000','e3000000-0000-4000-8000-000000000000',1,180,'line-1'),
  ('e6000000-0000-4000-8000-000000000000','e0000000-0000-4000-8000-000000000000','e4000000-0000-4000-8000-000000000000','e3000000-0000-4000-8000-000000000000',1,180,'line-2');

set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000002","tenant_id":"e0000000-0000-4000-8000-000000000000","branch_id":"e1000000-0000-4000-8000-000000000000","app_role":"waiter"}';

insert into public.line_discounts (id, tenant_id, order_line_id, kind, value, reason, requested_by)
  values ('e7000000-0000-4000-8000-000000000000','e0000000-0000-4000-8000-000000000000','e5000000-0000-4000-8000-000000000000','comp',0,'Müşteri şikayeti','eeeeeeee-0000-4000-8000-000000000002');
select is(
  (select status from public.line_discounts where id='e7000000-0000-4000-8000-000000000000')::text,
  'pending', 'Garsonun isteği bekleyen olarak açılır');

select throws_ok(
  $$ insert into public.line_discounts (tenant_id, order_line_id, kind, value, reason, requested_by, status)
     values ('e0000000-0000-4000-8000-000000000000','e6000000-0000-4000-8000-000000000000','comp',0,'Kendi onayım','eeeeeeee-0000-4000-8000-000000000002','approved') $$,
  '42501', null, 'Garson kendi isteğini onaylanmış olarak açamaz');

select throws_ok(
  $$ insert into public.line_discounts (tenant_id, order_line_id, kind, value, reason, requested_by)
     values ('e0000000-0000-4000-8000-000000000000','e5000000-0000-4000-8000-000000000000','percent',10,'Tekrar dene','eeeeeeee-0000-4000-8000-000000000002') $$,
  '23505', null, 'Aynı satırda ikinci bekleyen istek açılamaz');

-- RLS'in UPDATE'te USING yan tümcesi eşleşmeyen satırları sessizce
-- atlar (istisna fırlatmaz) — o yüzden burada "satır hiç değişmedi mi?"
-- diye kontrol ediyoruz, throws_ok değil.
update public.line_discounts set status='approved' where id='e7000000-0000-4000-8000-000000000000';
select is(
  (select status from public.line_discounts where id='e7000000-0000-4000-8000-000000000000')::text,
  'pending', 'Garson bekleyen isteği onaylayamaz (RLS satırı sessizce atlar)');

set local request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000001","tenant_id":"e0000000-0000-4000-8000-000000000000","branch_id":"e1000000-0000-4000-8000-000000000000","app_role":"owner"}';

update public.line_discounts
  set status = 'approved', decided_by = 'eeeeeeee-0000-4000-8000-000000000001'
  where id = 'e7000000-0000-4000-8000-000000000000';
select is(
  (select status from public.line_discounts where id='e7000000-0000-4000-8000-000000000000')::text,
  'approved', 'Patron bekleyen isteği onaylayabilir');
select isnt(
  (select decided_at from public.line_discounts where id='e7000000-0000-4000-8000-000000000000'),
  null, 'Onay zamanı otomatik damgalanır');

insert into public.line_discounts (id, tenant_id, order_line_id, kind, value, reason, requested_by, status, decided_by)
  values ('e8000000-0000-4000-8000-000000000000','e0000000-0000-4000-8000-000000000000','e6000000-0000-4000-8000-000000000000','percent',20,'Personel indirimi','eeeeeeee-0000-4000-8000-000000000001','approved','eeeeeeee-0000-4000-8000-000000000001');
select is(
  (select status from public.line_discounts where id='e8000000-0000-4000-8000-000000000000')::text,
  'approved', 'Patron kendi isteğini doğrudan onaylanmış açabilir');

select throws_ok(
  $$ insert into public.line_discounts (tenant_id, order_line_id, kind, value, reason, requested_by, status, decided_by)
     values ('e0000000-0000-4000-8000-000000000000', 'e6000000-0000-4000-8000-000000000000', 'percent', 150, 'Aşırı', 'eeeeeeee-0000-4000-8000-000000000001', 'approved', 'eeeeeeee-0000-4000-8000-000000000001') $$,
  '23514', null, 'Yüzde 100''ü aşamaz');

select throws_ok(
  $$ insert into public.line_discounts (tenant_id, order_line_id, kind, value, reason, requested_by, status, decided_by)
     values ('e0000000-0000-4000-8000-000000000000', gen_random_uuid(), 'comp', 0, 'Hayalet satır', 'eeeeeeee-0000-4000-8000-000000000001', 'approved', 'eeeeeeee-0000-4000-8000-000000000001') $$,
  null, null, 'Var olmayan order_line''a istek açılamaz');

set local request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000002","tenant_id":"e0000000-0000-4000-8000-000000000000","branch_id":"e1000000-0000-4000-8000-000000000000","app_role":"waiter"}';
select is((select count(*) from public.line_discounts)::int, 2, 'Garson onaylanmış istekleri de görür (kasa/sepet hesaplamasına gerekli)');

set local request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000001","tenant_id":"a0000000-0000-4000-8000-000000000000","branch_id":"a1000000-0000-4000-8000-000000000000","app_role":"owner"}';
select is_empty($$ select 1 from public.line_discounts $$, 'Başka tenant indirim isteklerini görmez');

reset role;
select * from finish();

rollback;
