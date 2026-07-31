-- =============================================================================
-- 0007 · Reçeteler ve versiyonlama
-- =============================================================================
-- Neden versiyonlama:
-- Gramajı veya bir malzemeyi değiştirdiğinde GEÇMİŞ ayların maliyet raporu
-- değişmemeli. Reçete tek bir düzenlenebilir kayıt olsaydı, mart ayında yapılan
-- bir değişiklik ocak ayının kârlılık raporunu geriye dönük bozardı — ve kimse
-- bunu fark etmezdi. Rakiplerin 9. maddedeki sorunu tam olarak bu.
--
-- Model: reçete bir kimlik, versiyon bir fotoğraf.
--   draft    → serbestçe düzenlenir
--   active   → dondurulmuş, aynı anda reçete başına yalnızca bir tane
--   archived → dondurulmuş, geçmiş kayıt
--
-- Dondurma yetkiyle değil TRIGGER ile sağlanıyor: bir gün biri yanlışlıkla
-- UPDATE hakkı verse bile aktif versiyonun satırları değişmez.
-- =============================================================================

create type public.recipe_version_status as enum ('draft', 'active', 'archived');
create type public.recipe_component_type as enum ('ingredient', 'sub_recipe');

-- -----------------------------------------------------------------------------
-- recipes — reçetenin kimliği
-- -----------------------------------------------------------------------------
-- menu_item_id NULL ise bu bir YARI MAMUL'dür (sos, hamur, marine et).
-- Doluysa satılan bir menü ürününün reçetesidir.
create table public.recipes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 120),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (tenant_id, name)
);

-- Bir menü ürününün en fazla bir reçetesi olur.
create unique index recipes_one_per_menu_item
  on public.recipes (menu_item_id)
  where menu_item_id is not null;

create index recipes_tenant_idx on public.recipes (tenant_id, name);

-- -----------------------------------------------------------------------------
-- recipe_versions
-- -----------------------------------------------------------------------------
create table public.recipe_versions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  recipe_id      uuid not null references public.recipes(id) on delete cascade,
  version_no     integer not null check (version_no > 0),
  status         public.recipe_version_status not null default 'draft',
  -- Bu reçete bir kez uygulandığında kaç birim çıktı verir.
  yield_quantity numeric(18,6) not null check (yield_quantity > 0),
  yield_unit     public.unit_code not null,
  note           text check (note is null or length(note) <= 500),
  activated_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (recipe_id, version_no)
);

-- Aynı anda tek aktif versiyon. Maliyet hesabı "hangi versiyon?" diye
-- sormak zorunda kalmasın.
create unique index recipe_versions_one_active
  on public.recipe_versions (recipe_id)
  where status = 'active';

create index recipe_versions_recipe_idx
  on public.recipe_versions (tenant_id, recipe_id, version_no desc);

-- -----------------------------------------------------------------------------
-- recipe_lines
-- -----------------------------------------------------------------------------
create table public.recipe_lines (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  recipe_version_id  uuid not null references public.recipe_versions(id) on delete cascade,
  line_no            integer not null check (line_no > 0),
  component_type     public.recipe_component_type not null,
  inventory_item_id  uuid references public.inventory_items(id) on delete restrict,
  sub_recipe_id      uuid references public.recipes(id) on delete restrict,
  quantity           numeric(18,6) not null check (quantity > 0),
  unit               public.unit_code not null,
  -- Fire yüzdesi. Reçetedeki miktar TEMİZLENMİŞ miktardır; gereken ham miktar
  -- `quantity / (1 - waste_percent/100)` ile bulunur. Bkz. src/core/recipe.ts.
  -- 100 hariç: %100 fire sonsuz hammadde demek olurdu.
  waste_percent      numeric(5,2) not null default 0
                       check (waste_percent >= 0 and waste_percent < 100),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (recipe_version_id, line_no),

  -- Satır ya hammadde ya yarı mamul; ikisi birden veya hiçbiri olamaz.
  check (
    (component_type = 'ingredient' and inventory_item_id is not null and sub_recipe_id is null)
    or
    (component_type = 'sub_recipe' and sub_recipe_id is not null and inventory_item_id is null)
  )
);

create index recipe_lines_version_idx on public.recipe_lines (tenant_id, recipe_version_id, line_no);
create index recipe_lines_item_idx on public.recipe_lines (inventory_item_id) where inventory_item_id is not null;
create index recipe_lines_sub_idx on public.recipe_lines (sub_recipe_id) where sub_recipe_id is not null;

-- =============================================================================
-- Dondurma: aktif/arşiv versiyon değiştirilemez
-- =============================================================================
create or replace function public.recipe_version_freeze_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    -- Yalnızca durum geçişine izin var (active → archived gibi).
    if new.yield_quantity is distinct from old.yield_quantity
       or new.yield_unit is distinct from old.yield_unit
       or new.recipe_id is distinct from old.recipe_id
       or new.version_no is distinct from old.version_no then
      raise exception
        'Yayınlanmış reçete versiyonu değiştirilemez. Yeni bir versiyon oluşturun.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger recipe_versions_freeze_guard
  before update on public.recipe_versions
  for each row execute function public.recipe_version_freeze_guard();

create or replace function public.recipe_lines_freeze_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.recipe_version_status;
  v_version uuid := coalesce(new.recipe_version_id, old.recipe_version_id);
begin
  select rv.status into v_status
  from public.recipe_versions rv
  where rv.id = v_version;

  if v_status is distinct from 'draft' then
    raise exception
      'Yayınlanmış reçete versiyonunun satırları değiştirilemez. Yeni bir versiyon oluşturun.'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger recipe_lines_freeze_guard
  before insert or update or delete on public.recipe_lines
  for each row execute function public.recipe_lines_freeze_guard();

-- =============================================================================
-- Tutarlılık kontrolleri
-- =============================================================================
-- Satırdaki hammadde/alt reçete aynı işletmeden ve DÖNGÜ oluşturmuyor olmalı.
create or replace function public.recipe_lines_integrity_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_recipe uuid;
  v_cycle boolean;
begin
  select rv.recipe_id into v_owner_recipe
  from public.recipe_versions rv
  where rv.id = new.recipe_version_id;

  if new.component_type = 'ingredient' then
    if not exists (
      select 1 from public.inventory_items i
      where i.id = new.inventory_item_id and i.tenant_id = new.tenant_id
    ) then
      raise exception 'Hammadde bu işletmeye ait değil' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if not exists (
    select 1 from public.recipes r
    where r.id = new.sub_recipe_id and r.tenant_id = new.tenant_id
  ) then
    raise exception 'Alt reçete bu işletmeye ait değil' using errcode = 'check_violation';
  end if;

  -- Doğrudan kendini içerme.
  if new.sub_recipe_id = v_owner_recipe then
    raise exception 'Bir reçete kendini içeremez' using errcode = 'check_violation';
  end if;

  -- Dolaylı döngü: A → B → A.
  -- Uygulama katmanı da bunu yakalıyor (src/core/recipe.ts), ama veritabanının
  -- hiç ulaşılamayacak bir durumu barındırmaması daha iyi.
  with recursive reachable(recipe_id) as (
    select new.sub_recipe_id
    union
    select rl.sub_recipe_id
    from reachable rc
    join public.recipe_versions rv
      on rv.recipe_id = rc.recipe_id and rv.status in ('draft', 'active')
    join public.recipe_lines rl
      on rl.recipe_version_id = rv.id and rl.sub_recipe_id is not null
  )
  select exists (select 1 from reachable where recipe_id = v_owner_recipe)
  into v_cycle;

  if v_cycle then
    raise exception 'Bu alt reçete döngü oluşturur (A → B → A)'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger recipe_lines_integrity_guard
  before insert or update on public.recipe_lines
  for each row execute function public.recipe_lines_integrity_guard();

-- Bir versiyon aktifleştirildiğinde öncekini otomatik arşivle.
-- Elle yapılsaydı, unutulan bir adım "tek aktif versiyon" indeksine takılıp
-- kullanıcıya anlamsız bir hata gösterirdi.
create or replace function public.recipe_version_activate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    update public.recipe_versions
      set status = 'archived'
      where recipe_id = new.recipe_id
        and id <> new.id
        and status = 'active';

    new.activated_at := now();
  end if;
  return new;
end;
$$;

create trigger recipe_versions_activate
  before update of status on public.recipe_versions
  for each row execute function public.recipe_version_activate();

-- =============================================================================
-- updated_at + denetim
-- =============================================================================
create trigger recipes_set_updated_at         before update on public.recipes         for each row execute function public.set_updated_at();
create trigger recipe_versions_set_updated_at before update on public.recipe_versions for each row execute function public.set_updated_at();
create trigger recipe_lines_set_updated_at    before update on public.recipe_lines    for each row execute function public.set_updated_at();

-- Reçete değişikliği maliyeti değiştirir; iz bırakmalı.
create trigger recipe_versions_audit
  after insert or update or delete on public.recipe_versions
  for each row execute function public.audit_trigger();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.recipes         enable row level security;
alter table public.recipes         force row level security;
alter table public.recipe_versions enable row level security;
alter table public.recipe_versions force row level security;
alter table public.recipe_lines    enable row level security;
alter table public.recipe_lines    force row level security;

-- Reçete = maliyet bilgisi. Garson ve kasiyer göremez.
create policy recipes_select on public.recipes
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_read_costs());

create policy recipes_write on public.recipes
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

create policy recipe_versions_select on public.recipe_versions
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_read_costs());

create policy recipe_versions_write on public.recipe_versions
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

create policy recipe_lines_select on public.recipe_lines
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_read_costs());

create policy recipe_lines_write on public.recipe_lines
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

-- =============================================================================
-- Yetkiler
-- =============================================================================
grant select, insert, update, delete on public.recipes         to authenticated;
grant select, insert, update, delete on public.recipe_versions to authenticated;
grant select, insert, update, delete on public.recipe_lines    to authenticated;

revoke execute on function public.recipe_version_freeze_guard()   from public, anon, authenticated;
revoke execute on function public.recipe_lines_freeze_guard()     from public, anon, authenticated;
revoke execute on function public.recipe_lines_integrity_guard()  from public, anon, authenticated;
revoke execute on function public.recipe_version_activate()       from public, anon, authenticated;
