-- =============================================================================
-- 0002 · Kiracılık: tenants, branches, profiles, memberships
-- =============================================================================
-- Buradaki dört tablo sistemin iskeleti. Sonraki her tablo `tenant_id` taşıyacak
-- ve politikaları bu dosyadaki desene birebir uyacak.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- tenants — işletme (marka)
-- -----------------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 2 and 120),
  slug        extensions.citext not null unique
                check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.tenants is
  'İşletme/marka. Sistemdeki izolasyonun en üst sınırı: bir tenant''ın verisi başka bir tenant''a asla görünmez.';

-- -----------------------------------------------------------------------------
-- branches — şube
-- -----------------------------------------------------------------------------
-- Tek şubeyle başlıyoruz ama şema baştan çok şubeli. Sonradan eklemek her tabloyu
-- ve her politikayı yeniden yazmak demekti.
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  timezone    text not null default 'Europe/Istanbul',
  currency    char(3) not null default 'TRY' check (currency ~ '^[A-Z]{3}$'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (tenant_id, name)
);

create index branches_tenant_idx on public.branches (tenant_id);

-- -----------------------------------------------------------------------------
-- profiles — auth.users'ın uygulama tarafındaki karşılığı
-- -----------------------------------------------------------------------------
-- auth.users'a doğrudan dokunmuyoruz; Supabase orayı yönetiyor. İsim/telefon gibi
-- uygulama alanları burada yaşar.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(btrim(full_name)) between 2 and 120),
  phone       text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- auth.users'a yeni kayıt düştüğünde profil satırını otomatik aç.
--
-- Neden trigger: profil oluşturmayı uygulamaya bırakırsak, davet akışının bir
-- adımı hata alınca profilsiz kullanıcı kalır ve o kullanıcı hiçbir ekranda
-- adıyla görünmez. Trigger bunu atomik hâle getirir.
--
-- security definer gerekiyor: tetikleyen rol (supabase_auth_admin) public.profiles
-- üzerinde yazma hakkına sahip değil.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    -- Davet/kayıt sırasında metadata'ya yazılan ad; yoksa e-postanın yerel kısmı.
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'kullanici'), '@', 1)
    ),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- memberships — kim, hangi işletmede, hangi şubede, hangi rolde
-- -----------------------------------------------------------------------------
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  branch_id   uuid references public.branches(id) on delete set null,
  role        public.app_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (user_id, tenant_id)
);

-- Bir kullanıcının AYNI ANDA yalnızca bir aktif üyeliği olabilir.
-- Sebep: JWT tek bir tenant_id taşıyor; iki aktif üyelik olsaydı token'a hangisinin
-- yazılacağı belirsiz kalırdı — yani sessiz bir yetki karışıklığı riski.
-- Faz 8'de tenant değiştirici geldiğinde bu kısıt kaldırılacak.
create unique index memberships_one_active_per_user
  on public.memberships (user_id)
  where is_active;

create index memberships_tenant_idx on public.memberships (tenant_id);
create index memberships_branch_idx on public.memberships (branch_id) where branch_id is not null;

-- Şube, üyelikle aynı tenant'a ait olmak zorunda. Aksi hâlde bir kullanıcı
-- A tenant'ının üyesi olup B tenant'ının şubesine bağlanabilirdi.
create or replace function public.memberships_branch_tenant_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.branch_id is not null then
    if not exists (
      select 1 from public.branches b
      where b.id = new.branch_id and b.tenant_id = new.tenant_id
    ) then
      raise exception 'Şube (%) bu işletmeye (%) ait değil', new.branch_id, new.tenant_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger memberships_branch_tenant_guard
  before insert or update of branch_id, tenant_id on public.memberships
  for each row execute function public.memberships_branch_tenant_guard();

-- -----------------------------------------------------------------------------
-- updated_at trigger'ları
-- -----------------------------------------------------------------------------
create trigger tenants_set_updated_at     before update on public.tenants     for each row execute function public.set_updated_at();
create trigger branches_set_updated_at    before update on public.branches    for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at    before update on public.profiles    for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
-- FORCE: tablo sahibi bile politikalara tabi olur. Bu olmadan, tabloyu oluşturan
-- rol ile çalışan bir sorgu tüm satırları görebilir.
alter table public.tenants     enable row level security;
alter table public.tenants     force row level security;
alter table public.branches    enable row level security;
alter table public.branches    force row level security;
alter table public.profiles    enable row level security;
alter table public.profiles    force row level security;
alter table public.memberships enable row level security;
alter table public.memberships force row level security;

-- --- tenants ---------------------------------------------------------------
-- Kullanıcı yalnızca kendi işletmesini görür. Yazma yok: tenant oluşturma ve
-- düzenleme provizyon işidir, service_role ile yapılır (Faz 8).
create policy tenants_select_own on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id());

-- --- branches --------------------------------------------------------------
create policy branches_select_own_tenant on public.branches
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy branches_write_owner on public.branches
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner())
  with check (tenant_id = public.current_tenant_id() and public.is_owner());

-- --- profiles --------------------------------------------------------------
-- Aynı işletmedeki kullanıcılar birbirinin adını görebilir (siparişte "garson: Ali"
-- yazabilmek için). Telefon gibi alanlar da bu kapsamda — ekip içi bilgi.
create policy profiles_select_same_tenant on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      where m.user_id = profiles.id
        and m.tenant_id = public.current_tenant_id()
    )
  );

-- Herkes yalnızca kendi profilini düzenler.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- --- memberships -----------------------------------------------------------
-- DİKKAT: bu politika memberships tablosuna alt sorgu ATMAZ, JWT claim'ini okur.
-- Alt sorgu atsaydı politika kendi kendini tetikleyip sonsuz özyinelemeye girerdi.
create policy memberships_select_own_tenant on public.memberships
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- Personel ekleme/çıkarma/rol değiştirme yalnızca patronda.
create policy memberships_write_owner on public.memberships
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner())
  with check (tenant_id = public.current_tenant_id() and public.is_owner());

-- =============================================================================
-- Yetkiler
-- =============================================================================
-- 0001'de varsayılan haklar iptal edilmişti; burada tablo tablo, işlem işlem
-- açıkça veriyoruz. RLS'e ek ikinci kemer: politikada bir hata olsa bile
-- authenticated rolünün tenants tablosuna INSERT yetkisi hiç yok.
grant select                        on public.tenants     to authenticated;
grant select, insert, update, delete on public.branches    to authenticated;
grant select, update                on public.profiles    to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;

-- anon (giriş yapmamış) hiçbir tabloya erişemez. Açıkça hiçbir grant verilmiyor.
