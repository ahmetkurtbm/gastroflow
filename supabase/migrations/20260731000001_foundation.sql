-- =============================================================================
-- 0001 · Temel: uzantılar, tipler, RLS yardımcıları
-- =============================================================================
-- Bu dosya hiçbir tablo oluşturmaz. Sonraki tüm migration'ların dayandığı
-- sözlüğü ve RLS politikalarının çağıracağı fonksiyonları kurar.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- -----------------------------------------------------------------------------
-- Roller
-- -----------------------------------------------------------------------------
-- Metin yerine enum: yazım hatası ('waitor') bir güvenlik açığı değil, veritabanı
-- hatası olsun istiyoruz. Yeni rol eklemek migration gerektirir — bilinçli tercih.
create type public.app_role as enum (
  'owner',       -- patron
  'manager',     -- müdür
  'chef',        -- mutfak
  'waiter',      -- garson
  'cashier',     -- kasa
  'storekeeper', -- depo
  'accountant'   -- muhasebe
);

-- -----------------------------------------------------------------------------
-- RLS yardımcı fonksiyonları
-- -----------------------------------------------------------------------------
-- Politikaların tamamı bu üç fonksiyona dayanır. Değerleri JWT'den okurlar;
-- JWT'yi imzalayan Supabase Auth'tur, kullanıcı içeriğini değiştiremez.
--
-- `set search_path = ''` KRİTİK: fonksiyon gövdesindeki her isim tam nitelikli
-- yazılmak zorunda kalır. Aksi hâlde kullanıcı kendi şemasına sahte bir `auth`
-- tanımlayıp fonksiyonu kandırabilir.

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
$$;

comment on function public.current_tenant_id() is
  'Oturumdaki kullanıcının tenant kimliği. Oturum yoksa NULL — bu durumda tenant_id = NULL karşılaştırması hiçbir satır döndürmez, yani varsayılan davranış "kapalı"dır.';

create or replace function public.current_branch_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'branch_id', '')::uuid;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'app_role', '')::public.app_role;
$$;

-- Sık kullanılan kısayol: yazma yetkisi olan yönetici rolleri.
create or replace function public.is_manager()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.current_app_role() in ('owner', 'manager');
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.current_app_role() = 'owner';
$$;

-- -----------------------------------------------------------------------------
-- updated_at otomatiği
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Varsayılanı kapatmak
-- -----------------------------------------------------------------------------
-- Postgres'te public şemaya yeni tablo eklendiğinde bazı roller varsayılan hak
-- alabiliyor. Bunu baştan kesiyoruz: her yetki açıkça verilecek.
revoke all on schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
