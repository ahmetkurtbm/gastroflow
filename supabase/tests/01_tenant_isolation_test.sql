-- =============================================================================
-- Kiracı izolasyonu testi
-- =============================================================================
-- Projenin en önemli güvenlik iddiasını kanıtlar:
--
--   "A restoranının kullanıcısı, B restoranının hiçbir satırını göremez."
--
-- Test JWT'yi taklit ederek (`request.jwt.claims`) gerçek politikaları çalıştırır.
-- Uygulama kodu devrede değil — yani bu test, Next.js tarafında bir kontrol
-- unutulsa bile veritabanının tek başına koruduğunu gösterir.
--
-- Beklenen sayılar kurulum verisinden geliyor; kurulumu değiştirirsen sayıları
-- yeniden hesapla (log kayıtları: her branches/memberships INSERT'i bir satır).
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- -----------------------------------------------------------------------------
-- Kurulum: iki ayrı işletme
--   Restoran A → 1 şube, 2 personel (patron + garson)
--   Restoran B → 1 şube, 1 personel (patron)
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','patron@restoran-a.test','{"full_name":"A Patron"}'),
  ('aaaaaaaa-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','garson@restoran-a.test','{"full_name":"A Garson"}'),
  ('bbbbbbbb-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','patron@restoran-b.test','{"full_name":"B Patron"}');

insert into public.tenants (id, name, slug) values
  ('a0000000-0000-4000-8000-000000000000','Restoran A','restoran-a'),
  ('b0000000-0000-4000-8000-000000000000','Restoran B','restoran-b');

insert into public.branches (id, tenant_id, name) values
  ('a1000000-0000-4000-8000-000000000000','a0000000-0000-4000-8000-000000000000','A Merkez'),
  ('b1000000-0000-4000-8000-000000000000','b0000000-0000-4000-8000-000000000000','B Merkez');

insert into public.memberships (user_id, tenant_id, branch_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000000','a1000000-0000-4000-8000-000000000000','owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000000','a1000000-0000-4000-8000-000000000000','waiter'),
  ('bbbbbbbb-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000000','b1000000-0000-4000-8000-000000000000','owner');

-- --- Trigger'lar çalışıyor mu? ----------------------------------------------
select is(
  (select full_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'A Patron',
  'auth.users kaydı düşünce profil otomatik oluşur'
);

-- 2 şube + 3 üyelik INSERT'i = 5 log satırı
select is(
  (select count(*) from public.audit_log)::int, 5,
  'Denetim trigger''ı her INSERT için kayıt açar'
);

-- --- Şube/işletme tutarlılığı ------------------------------------------------
select throws_ok(
  $$ insert into public.memberships (user_id, tenant_id, branch_id, role)
     values ('bbbbbbbb-0000-4000-8000-000000000001',
             'b0000000-0000-4000-8000-000000000000',
             'a1000000-0000-4000-8000-000000000000', 'manager') $$,
  null, null,
  'Bir kullanıcı, kendi işletmesine ait olmayan bir şubeye bağlanamaz'
);

-- -----------------------------------------------------------------------------
-- A işletmesinin patronu olarak
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","tenant_id":"a0000000-0000-4000-8000-000000000000","branch_id":"a1000000-0000-4000-8000-000000000000","app_role":"owner"}';

select is((select count(*) from public.tenants)::int, 1,
          'Patron yalnızca kendi işletmesini görür');
select is((select name from public.tenants), 'Restoran A',
          've gördüğü işletme kendi işletmesidir');
select is((select count(*) from public.branches)::int, 1,
          'Yalnızca kendi şubesini görür');
select is((select count(*) from public.memberships)::int, 2,
          'Yalnızca kendi ekibini görür (B patronu listede yok)');
select is((select count(*) from public.profiles)::int, 2,
          'Yalnızca kendi ekibinin profillerini görür');

-- "Kimliği biliyorsam çekerim" yolu kapalı.
select is_empty(
  $$ select 1 from public.branches where id = 'b1000000-0000-4000-8000-000000000000' $$,
  'Başka işletmenin şubesine kimliğini bilerek de erişemez'
);

select throws_ok(
  $$ insert into public.branches (tenant_id, name)
     values ('b0000000-0000-4000-8000-000000000000', 'Sızma Şubesi') $$,
  '42501', null,
  'Başka işletmeye şube ekleyemez'
);

-- --- Denetim kaydı izolasyonu (1 şube + 2 üyelik = 3) ------------------------
select is((select count(*) from public.audit_log)::int, 3,
          'Patron 5 log kaydının yalnızca kendine ait 3 tanesini görür');
select is_empty(
  $$ select 1 from public.audit_log where tenant_id = 'b0000000-0000-4000-8000-000000000000' $$,
  'B işletmesinin tek bir log satırı bile sızmaz'
);
select throws_ok(
  $$ update public.audit_log set actor_id = null $$,
  null, null,
  'Patron bile denetim kaydını değiştiremez (append-only)'
);

-- -----------------------------------------------------------------------------
-- A işletmesinin garsonu olarak — rol bazlı kısıtlar
-- -----------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","tenant_id":"a0000000-0000-4000-8000-000000000000","branch_id":"a1000000-0000-4000-8000-000000000000","app_role":"waiter"}';

select is((select count(*) from public.branches)::int, 1,
          'Garson kendi şubesini görebilir');
select throws_ok(
  $$ insert into public.branches (tenant_id, name)
     values ('a0000000-0000-4000-8000-000000000000', 'Garsonun Şubesi') $$,
  '42501', null,
  'Garson kendi işletmesine bile şube ekleyemez (yalnızca patron)'
);
select is_empty($$ select 1 from public.audit_log $$,
                'Garson denetim kaydını göremez');

-- -----------------------------------------------------------------------------
-- Oturumsuz (anon) erişim
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '';

select throws_ok($$ select 1 from public.tenants $$, '42501', null,
                 'Giriş yapmamış kullanıcı hiçbir tabloya erişemez');

reset role;
select * from finish();

rollback;
