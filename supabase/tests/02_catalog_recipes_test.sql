-- =============================================================================
-- Katalog ve reçete davranış testleri
-- =============================================================================
-- İki iddiayı kanıtlar:
--
--   1. "Yayınlanmış reçete dondurulur" — gramajı değiştirmek geçmiş maliyet
--      raporlarını bozamaz. Yeni versiyon açmak zorunludur.
--   2. "Garson maliyeti göremez" — menüyü görür (POS'a şart), ama hammadde
--      fiyatını ve reçeteyi göremez.
--
-- Ayrıca döngüsel reçete ve tutarsız satır tanımlarının veritabanı seviyesinde
-- engellendiğini gösterir.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- -----------------------------------------------------------------------------
-- Kurulum
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('cccccccc-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p@t1.test','{"full_name":"T1 Patron"}'),
  ('cccccccc-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','g@t1.test','{"full_name":"T1 Garson"}');

insert into public.tenants (id, name, slug)
  values ('c0000000-0000-4000-8000-000000000000','Test 1','test-bir');
insert into public.branches (id, tenant_id, name)
  values ('c1000000-0000-4000-8000-000000000000','c0000000-0000-4000-8000-000000000000','Merkez');
insert into public.memberships (user_id, tenant_id, branch_id, role) values
  ('cccccccc-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000000','c1000000-0000-4000-8000-000000000000','owner'),
  ('cccccccc-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000000','c1000000-0000-4000-8000-000000000000','waiter');

insert into public.inventory_items (id, tenant_id, name, base_unit, cost_per_base_unit) values
  ('c2000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000000','Un','kg',30),
  ('c2000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000000','Mozzarella','kg',300);

insert into public.categories (id, tenant_id, name)
  values ('c3000000-0000-4000-8000-000000000000','c0000000-0000-4000-8000-000000000000','Pizzalar');
insert into public.menu_items (id, tenant_id, category_id, name)
  values ('c4000000-0000-4000-8000-000000000000','c0000000-0000-4000-8000-000000000000','c3000000-0000-4000-8000-000000000000','Margarita');
insert into public.menu_prices (tenant_id, menu_item_id, price)
  values ('c0000000-0000-4000-8000-000000000000','c4000000-0000-4000-8000-000000000000',180);

insert into public.recipes (id, tenant_id, name) values
  ('c5000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000000','Hamur'),
  ('c5000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000000','Margarita reçetesi');

insert into public.recipe_versions (id, tenant_id, recipe_id, version_no, yield_quantity, yield_unit) values
  ('c6000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000000','c5000000-0000-4000-8000-000000000001',1,1000,'g'),
  ('c6000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000000','c5000000-0000-4000-8000-000000000002',1,1,'adet');

insert into public.recipe_lines (tenant_id, recipe_version_id, line_no, component_type, inventory_item_id, quantity, unit)
  values ('c0000000-0000-4000-8000-000000000000','c6000000-0000-4000-8000-000000000001',1,'ingredient','c2000000-0000-4000-8000-000000000001',600,'g');

select is((select count(*) from public.recipe_lines)::int, 1,
          'Taslak versiyona satır eklenebilir');

-- -----------------------------------------------------------------------------
-- Döngü ve tutarlılık korumaları
-- -----------------------------------------------------------------------------
-- Margarita → Hamur bağını kur, sonra Hamur → Margarita ile döngü dene.
insert into public.recipe_lines (tenant_id, recipe_version_id, line_no, component_type, sub_recipe_id, quantity, unit)
  values ('c0000000-0000-4000-8000-000000000000','c6000000-0000-4000-8000-000000000002',1,'sub_recipe','c5000000-0000-4000-8000-000000000001',250,'g');

select throws_ok(
  $$ insert into public.recipe_lines (tenant_id, recipe_version_id, line_no, component_type, sub_recipe_id, quantity, unit)
     values ('c0000000-0000-4000-8000-000000000000','c6000000-0000-4000-8000-000000000001',9,'sub_recipe','c5000000-0000-4000-8000-000000000002',1,'adet') $$,
  null, null, 'Dolaylı döngü (A → B → A) reddedilir');

select throws_ok(
  $$ insert into public.recipe_lines (tenant_id, recipe_version_id, line_no, component_type, sub_recipe_id, quantity, unit)
     values ('c0000000-0000-4000-8000-000000000000','c6000000-0000-4000-8000-000000000001',8,'sub_recipe','c5000000-0000-4000-8000-000000000001',1,'g') $$,
  null, null, 'Doğrudan kendini içerme reddedilir');

select throws_ok(
  $$ insert into public.recipe_lines (tenant_id, recipe_version_id, line_no, component_type, inventory_item_id, sub_recipe_id, quantity, unit)
     values ('c0000000-0000-4000-8000-000000000000','c6000000-0000-4000-8000-000000000001',7,'ingredient','c2000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001',1,'g') $$,
  null, null, 'Hem hammadde hem alt reçete olan satır reddedilir');

select throws_ok(
  $$ insert into public.recipe_lines (tenant_id, recipe_version_id, line_no, component_type, inventory_item_id, quantity, unit, waste_percent)
     values ('c0000000-0000-4000-8000-000000000000','c6000000-0000-4000-8000-000000000001',6,'ingredient','c2000000-0000-4000-8000-000000000001',1,'g',100) $$,
  null, null, '%100 fire reddedilir (sonsuz hammadde anlamına gelirdi)');

-- -----------------------------------------------------------------------------
-- Dondurma — Faz 1'in asıl iddiası
-- -----------------------------------------------------------------------------
update public.recipe_versions set status = 'active'
  where id = 'c6000000-0000-4000-8000-000000000001';

select isnt(
  (select activated_at from public.recipe_versions where id='c6000000-0000-4000-8000-000000000001'),
  null, 'Yayınlanma zamanı otomatik yazılır');

select throws_ok(
  $$ update public.recipe_versions set yield_quantity = 2000 where id = 'c6000000-0000-4000-8000-000000000001' $$,
  null, null, 'Yayınlanmış versiyonun çıktı miktarı değiştirilemez');

select throws_ok(
  $$ update public.recipe_lines set quantity = 999 where recipe_version_id = 'c6000000-0000-4000-8000-000000000001' $$,
  null, null, 'Yayınlanmış versiyonun satırları değiştirilemez');

select throws_ok(
  $$ delete from public.recipe_lines where recipe_version_id = 'c6000000-0000-4000-8000-000000000001' $$,
  null, null, 'Yayınlanmış versiyonun satırları silinemez');

-- Yeni versiyon yayınlanınca eskisi otomatik arşivlenmeli.
insert into public.recipe_versions (id, tenant_id, recipe_id, version_no, yield_quantity, yield_unit)
  values ('c6000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000000','c5000000-0000-4000-8000-000000000001',2,1200,'g');
update public.recipe_versions set status='active' where id='c6000000-0000-4000-8000-000000000003';

select is(
  (select status::text from public.recipe_versions where id='c6000000-0000-4000-8000-000000000001'),
  'archived', 'Yeni versiyon yayınlanınca eskisi arşivlenir');

select is(
  (select count(*) from public.recipe_versions
   where recipe_id='c5000000-0000-4000-8000-000000000001' and status='active')::int,
  1, 'Aynı anda yalnızca bir aktif versiyon olur');

-- -----------------------------------------------------------------------------
-- Rol bazlı görünürlük
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000002","tenant_id":"c0000000-0000-4000-8000-000000000000","branch_id":"c1000000-0000-4000-8000-000000000000","app_role":"waiter"}';

select is((select count(*) from public.menu_items)::int, 1,
          'Garson menüyü görür — POS ekranı buna muhtaç');
select is_empty($$ select 1 from public.inventory_items $$,
                'Garson hammadde maliyetini göremez');
select is_empty($$ select 1 from public.recipe_lines $$,
                'Garson reçete satırlarını göremez');

reset role;
select * from finish();

rollback;
