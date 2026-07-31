-- =============================================================================
-- Yapısal güvenlik testi
-- =============================================================================
-- Bu test bir özelliği değil, bir KURALI korur:
--
--   "public şemasındaki her tablo RLS ile korunur ve tenant_id taşır."
--
-- Faz 4'te aceleyle eklenen bir `supplier_invoices` tablosunda RLS açmayı unutmak,
-- tüm müşterilerin fatura verisini birbirine açar. Bu testin varlık sebebi o anı
-- kod incelemesine değil, CI'ya yakalatmak.
--
-- Yeni bir muafiyet eklemek istiyorsan: gerçekten tenant'a ait olmayan bir tablo mu?
-- Cevap "hayır"sa muafiyet değil, tenant_id eklemek gerekiyor.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

-- -----------------------------------------------------------------------------
-- Muafiyetler
-- -----------------------------------------------------------------------------
create temporary table tenant_id_exempt (table_name text primary key);
insert into tenant_id_exempt (table_name) values
  ('tenants'),   -- kendisi tenant; ayrım `id` kolonuyla yapılır
  ('profiles');  -- auth.users'a bire bir bağlı; tenant ilişkisi memberships üzerinden

-- -----------------------------------------------------------------------------
-- 1) Her tabloda RLS etkin mi?
-- -----------------------------------------------------------------------------
select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
    order by c.relname
  $$,
  'public şemasındaki her tabloda row level security etkin olmalı'
);

-- -----------------------------------------------------------------------------
-- 2) Her tabloda RLS "force" mu?
-- -----------------------------------------------------------------------------
-- FORCE olmadan, tabloyu oluşturan rol politikaları atlar. Migration'lar o rolle
-- çalıştığı için bu gerçek bir sızıntı yolu.
select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relforcerowsecurity
    order by c.relname
  $$,
  'public şemasındaki her tabloda row level security "force" olmalı'
);

-- -----------------------------------------------------------------------------
-- 3) Her tabloda tenant_id var mı?
-- -----------------------------------------------------------------------------
select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in (select table_name from tenant_id_exempt)
      and not exists (
        select 1
        from pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'tenant_id'
          and a.attnum > 0
          and not a.attisdropped
      )
    order by c.relname
  $$,
  'muaf olmayan her tablo tenant_id kolonu taşımalı'
);

select * from finish();

rollback;
