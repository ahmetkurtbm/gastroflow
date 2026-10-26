-- =============================================================================
-- 0004 · Custom Access Token Hook
-- =============================================================================
-- Kullanıcının tenant/şube/rol bilgisini JWT'ye yazar. Tüm RLS politikaları bu
-- claim'leri okur.
--
-- Neden JWT'ye gömüyoruz da her politikada memberships tablosuna bakmıyoruz?
--   1. Performans: her satır kontrolünde ek sorgu olmaz.
--   2. Özyineleme: memberships politikası memberships'e bakamaz — sonsuz döngü.
--   3. Güvenilirlik: JWT'yi Supabase Auth imzalar, kullanıcı içeriğini değiştiremez.
--
-- Bedeli: rol/şube değişikliği token yenilenene kadar (≈1 saat, ya da kullanıcı
-- yeniden giriş yapana kadar) yansımaz. Rol düşürme anında etkili olsun istenirse
-- ilgili oturumlar sonlandırılmalı — Faz 8'de personel yönetimi ekranında ele alınacak.
--
-- KURULUM (migration bunu yapamaz, panelden yapılır):
--   Supabase Dashboard → Authentication → Hooks → Customize Access Token (JWT) Claims
--   → public.custom_access_token_hook seçilip etkinleştirilecek.
-- =============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims     jsonb;
  membership record;
begin
  select m.tenant_id, m.branch_id, m.role
    into membership
  from public.memberships m
  where m.user_id = (event ->> 'user_id')::uuid
    and m.is_active
  limit 1;  -- memberships_one_active_per_user indeksi tekliği garanti ediyor

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if membership.tenant_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(membership.tenant_id::text));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(membership.role::text));
    claims := jsonb_set(
      claims,
      '{branch_id}',
      case
        when membership.branch_id is null then 'null'::jsonb
        else to_jsonb(membership.branch_id::text)
      end
    );
  else
    -- Aktif üyeliği olmayan kullanıcı: claim yazılmaz. Sonuç olarak
    -- current_tenant_id() NULL döner ve hiçbir politika eşleşmez — yani
    -- kullanıcı giriş yapabilir ama hiçbir veriyi göremez. Doğru varsayılan bu.
    claims := claims - 'tenant_id' - 'app_role' - 'branch_id';
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Supabase Auth tarafından her token üretiminde çağrılır. tenant_id/branch_id/app_role claim''lerini ekler.';

-- -----------------------------------------------------------------------------
-- Yetkiler
-- -----------------------------------------------------------------------------
-- Hook'u yalnızca Auth servisi çalıştırabilmeli. Bir kullanıcı bunu kendi
-- çağırabilseydi, keyfi bir user_id vererek başkasının rolünü öğrenebilirdi.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- Hook, memberships tablosunu okumak zorunda. RLS "force" olduğu için yetki
-- vermek yetmez, politika da gerekiyor.
grant select on public.memberships to supabase_auth_admin;

create policy memberships_read_by_auth_admin on public.memberships
  for select to supabase_auth_admin
  using (true);
