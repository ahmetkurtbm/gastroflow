-- =============================================================================
-- İlk kurulum: bir işletme, bir şube, bir patron hesabı
-- =============================================================================
-- Bu dosya sıfırdan bir ortam ayağa kaldırmak içindir (yeni geliştirici, yeni
-- Supabase projesi, local stack). Migration DEĞİLDİR — otomatik çalışmaz.
--
-- Kullanımı:
--   1. Aşağıdaki üç değişkeni doldur.
--   2. Supabase SQL Editor'de veya `psql` ile çalıştır.
--   3. Girişten sonra şifreyi değiştir.
--
-- UYARI: Gerçek bir şifreyi bu dosyaya yazıp commit etme. Değerleri çalıştırma
-- anında doldur.
--
-- Faz 8'de bu iş bir provizyon akışına dönüşecek (onboarding sihirbazı);
-- o zamana kadar yeni işletme kurmanın yolu burası.
-- =============================================================================

do $$
declare
  -- >>> DOLDUR <<<
  v_email       text := 'patron@ornek-restoran.com';
  v_password    text := 'BURAYA_GUCLU_BIR_SIFRE';
  v_full_name   text := 'Ad Soyad';
  v_tenant_name text := 'Örnek Restoran';
  v_tenant_slug text := 'ornek-restoran';   -- küçük harf, rakam ve tire
  v_branch_name text := 'Merkez';
  -- <<< DOLDUR >>>

  v_user_id   uuid := gen_random_uuid();
  v_tenant_id uuid;
  v_branch_id uuid;
begin
  if v_password = 'BURAYA_GUCLU_BIR_SIFRE' then
    raise exception 'Önce dosyadaki değişkenleri doldur.';
  end if;

  -- auth.users'a doğrudan yazıyoruz. Normalde bu iş Admin API'nin ama ilk
  -- kullanıcı için henüz oturum açabilecek kimse yok — yumurta/tavuk problemi.
  --
  -- Boş string atanan token kolonları bilinçli: GoTrue bazı sürümlerde bu
  -- alanlarda NULL görünce hata veriyor.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_full_name),
    '', '', '', ''
  );

  -- Şifreyle giriş yapılabilmesi için identity kaydı da şart.
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text, 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    now(), now(), now()
  );

  -- public.profiles satırını handle_new_user() trigger'ı kendisi açıyor.

  insert into public.tenants (name, slug)
  values (v_tenant_name, v_tenant_slug)
  returning id into v_tenant_id;

  insert into public.branches (tenant_id, name)
  values (v_tenant_id, v_branch_name)
  returning id into v_branch_id;

  insert into public.memberships (user_id, tenant_id, branch_id, role)
  values (v_user_id, v_tenant_id, v_branch_id, 'owner');

  raise notice 'Kurulum tamam. Giriş: %', v_email;
end $$;
