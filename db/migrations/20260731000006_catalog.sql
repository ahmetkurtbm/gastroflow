-- =============================================================================
-- 0006 · Katalog: kategoriler, menü ürünleri, fiyatlar, hammaddeler
-- =============================================================================
-- Birim kodları neden ayrı bir tabloda değil:
-- Evrensel birimler (kg, g, lt, ml, adet) uygulamada sabit tanımlı
-- (src/core/units.ts). Ambalaj birimleri ("koli", "kasa") ise ürüne özeldir —
-- 1 koli kola 24 adet, 1 koli cips 12 pakettir. Bunları global bir birim
-- tablosuna koymak, motorun engellemek için var olduğu hatanın kendisi olurdu.
-- Bu yüzden birim `text`, ürüne özel ilişkiler `item_unit_conversions` tablosunda.
-- =============================================================================

-- Birim kodu biçimi: küçük harf, Türkçe karakter serbest, 1-16 karakter.
create domain public.unit_code as text
  check (value ~ '^[a-zçğıöşü]{1,16}$');

-- -----------------------------------------------------------------------------
-- Maliyet görme yetkisi
-- -----------------------------------------------------------------------------
-- Garson ve kasiyer menüyü ve fiyatı görür ama HAMMADDE MALİYETİNİ görmez.
-- Bu ayrım rakip sistemlerin en sık atladığı yer (araştırmadaki 10. madde).
create or replace function public.can_read_costs()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.current_app_role() in ('owner', 'manager', 'chef', 'accountant');
$$;

-- =============================================================================
-- Kategoriler
-- =============================================================================
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (tenant_id, name)
);

create index categories_tenant_idx on public.categories (tenant_id, sort_order);

-- =============================================================================
-- Menü ürünleri (satılan şeyler)
-- =============================================================================
create table public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name        text not null check (length(btrim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 500),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (tenant_id, name)
);

create index menu_items_tenant_idx on public.menu_items (tenant_id, category_id, sort_order);

-- Kategori aynı işletmeden olmalı.
create or replace function public.menu_items_category_tenant_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.tenant_id = new.tenant_id
  ) then
    raise exception 'Kategori bu işletmeye ait değil'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger menu_items_category_tenant_guard
  before insert or update of category_id, tenant_id on public.menu_items
  for each row execute function public.menu_items_category_tenant_guard();

-- =============================================================================
-- Menü fiyatları — tarihli ve şube bazlı
-- =============================================================================
-- Fiyat menü ürününün üstünde bir kolon DEĞİL, ayrı ve tarihli bir tablo.
-- Sebep: fiyat değiştiğinde geçmiş satışların hangi fiyattan yapıldığı
-- bilinmeli. Kolon olsaydı zam yapıldığı anda geçmiş ciro raporları bozulurdu.
create table public.menu_prices (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  -- NULL = tüm şubeler için geçerli varsayılan fiyat.
  branch_id    uuid references public.branches(id) on delete cascade,
  price        numeric(14,4) not null check (price >= 0),
  vat_rate     numeric(5,2) not null default 10.00 check (vat_rate between 0 and 100),
  valid_from   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (menu_item_id, branch_id, valid_from)
);

create index menu_prices_lookup_idx
  on public.menu_prices (tenant_id, menu_item_id, valid_from desc);

comment on column public.menu_prices.price is
  'KDV dahil satış fiyatı. numeric(14,4) — asla float, kuruş farkları gün sonu mutabakatında geri döner.';

-- =============================================================================
-- Hammaddeler (satın alınan, stoklanan, reçetede kullanılan)
-- =============================================================================
create table public.inventory_items (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  name                text not null check (length(btrim(name)) between 1 and 120),
  -- Stok ve maliyetin tanımlı olduğu birim. Reçetede başka birim kullanılabilir;
  -- dönüşüm item_unit_conversions üzerinden yapılır.
  base_unit           public.unit_code not null,
  -- 1 base_unit'in TL maliyeti. Faz 4'te alış faturalarından otomatik güncellenecek.
  cost_per_base_unit  numeric(14,4) not null default 0 check (cost_per_base_unit >= 0),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (tenant_id, name)
);

create index inventory_items_tenant_idx on public.inventory_items (tenant_id, name);

-- -----------------------------------------------------------------------------
-- Ürüne özel birim dönüşümleri
-- -----------------------------------------------------------------------------
-- Ambalaj (1 koli = 24 adet), yoğunluk (1 lt zeytinyağı = 916 g),
-- birim ağırlık (1 adet yumurta = 55 g).
create table public.item_unit_conversions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  from_unit         public.unit_code not null,
  to_unit           public.unit_code not null,
  -- 1 from_unit = factor × to_unit
  factor            numeric(18,6) not null check (factor > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  check (from_unit <> to_unit),
  unique (inventory_item_id, from_unit, to_unit)
);

create index item_unit_conversions_item_idx
  on public.item_unit_conversions (tenant_id, inventory_item_id);

create or replace function public.item_conversion_tenant_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.inventory_items i
    where i.id = new.inventory_item_id and i.tenant_id = new.tenant_id
  ) then
    raise exception 'Hammadde bu işletmeye ait değil'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger item_unit_conversions_tenant_guard
  before insert or update on public.item_unit_conversions
  for each row execute function public.item_conversion_tenant_guard();

-- =============================================================================
-- updated_at
-- =============================================================================
create trigger categories_set_updated_at            before update on public.categories            for each row execute function public.set_updated_at();
create trigger menu_items_set_updated_at            before update on public.menu_items            for each row execute function public.set_updated_at();
create trigger menu_prices_set_updated_at           before update on public.menu_prices           for each row execute function public.set_updated_at();
create trigger inventory_items_set_updated_at       before update on public.inventory_items       for each row execute function public.set_updated_at();
create trigger item_unit_conversions_set_updated_at before update on public.item_unit_conversions for each row execute function public.set_updated_at();

-- =============================================================================
-- Denetim
-- =============================================================================
-- Fiyat ve maliyet değişiklikleri para hareketi kadar hassas: kim ne zaman
-- zam yaptı, kim hammadde maliyetini elle değiştirdi — hepsi iz bırakmalı.
create trigger menu_prices_audit
  after insert or update or delete on public.menu_prices
  for each row execute function public.audit_trigger();

create trigger inventory_items_audit
  after insert or update or delete on public.inventory_items
  for each row execute function public.audit_trigger();

create trigger menu_items_audit
  after insert or update or delete on public.menu_items
  for each row execute function public.audit_trigger();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.categories            enable row level security;
alter table public.categories            force row level security;
alter table public.menu_items            enable row level security;
alter table public.menu_items            force row level security;
alter table public.menu_prices           enable row level security;
alter table public.menu_prices           force row level security;
alter table public.inventory_items       enable row level security;
alter table public.inventory_items       force row level security;
alter table public.item_unit_conversions enable row level security;
alter table public.item_unit_conversions force row level security;

-- --- Menü tarafı: herkes okur (POS ekranı buna muhtaç), yönetici yazar -------
create policy categories_select on public.categories
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy categories_write on public.categories
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

create policy menu_items_select on public.menu_items
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy menu_items_write on public.menu_items
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

create policy menu_prices_select on public.menu_prices
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- Fiyat değiştirmek yalnızca patronda: zam kararı müdür yetkisi değil.
create policy menu_prices_write on public.menu_prices
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner())
  with check (tenant_id = public.current_tenant_id() and public.is_owner());

-- --- Maliyet tarafı: garson ve kasiyer göremez ------------------------------
create policy inventory_items_select on public.inventory_items
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_read_costs());

create policy inventory_items_write on public.inventory_items
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

create policy item_unit_conversions_select on public.item_unit_conversions
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_read_costs());

create policy item_unit_conversions_write on public.item_unit_conversions
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

-- =============================================================================
-- Yetkiler (0001'de varsayılanlar iptal edilmişti)
-- =============================================================================
grant select, insert, update, delete on public.categories            to authenticated;
grant select, insert, update, delete on public.menu_items            to authenticated;
grant select, insert, update, delete on public.menu_prices           to authenticated;
grant select, insert, update, delete on public.inventory_items       to authenticated;
grant select, insert, update, delete on public.item_unit_conversions to authenticated;

grant execute on function public.can_read_costs() to authenticated;
revoke execute on function public.can_read_costs() from public, anon;
revoke execute on function public.menu_items_category_tenant_guard() from public, anon, authenticated;
revoke execute on function public.item_conversion_tenant_guard() from public, anon, authenticated;
