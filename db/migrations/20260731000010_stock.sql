-- =============================================================================
-- 0010 · Stok defteri (append-only ledger) ve par-level
-- =============================================================================
-- Merkez tasarım kararı: STOK BİR SAYI DEĞİL, BİR DEFTERDİR.
--
-- `stock_movements` tablosuna yalnızca INSERT yapılır. UPDATE/DELETE hem
-- yetkiyle hem de trigger'la (audit_log ile aynı desen) kapatılır. Düzeltme
-- ters kayıtla (movement_type = 'reversal') yapılır. Sonuç: "bu ürün neden
-- eksik?" sorusunun cevabı her zaman tek bir hareket listesinde — hiçbir satır
-- sonradan değiştirilip iz kaybedilemez.
--
-- İkinci karar: her hareket İLGİLİ ÜRÜNÜN base_unit'inde yazılır. Ledger'da
-- birim kolonu YOK — çünkü "bazı satırlar gram, bazıları kilogram" karışıklığı
-- SUM() ile anlamsız bir toplam üretirdi. Farklı birimden bir olay (örn. koli
-- ile alım) yazılmadan önce item_unit_conversions ile base_unit'e çevrilir.
-- =============================================================================

create type public.stock_location_kind as enum ('storage', 'kitchen', 'bar');

create type public.stock_movement_type as enum (
  'purchase_in',    -- tedarikçiden mal kabul
  'sale_out',       -- satıştan reçeteye göre otomatik düşüm
  'waste',          -- fire/zayiat
  'transfer_in',    -- başka lokasyondan gelen
  'transfer_out',   -- başka lokasyona giden
  'production_in',  -- yarı mamul üretimi: çıktı
  'production_out', -- yarı mamul üretimi: girdi tüketimi
  'count_adjustment', -- fiziksel sayım düzeltmesi
  'reversal'        -- bir önceki hareketi geri alma
);

create or replace function public.can_read_stock()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.current_app_role() in ('owner', 'manager', 'chef', 'storekeeper', 'accountant');
$$;

create or replace function public.can_write_stock()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.current_app_role() in ('owner', 'manager', 'chef', 'storekeeper');
$$;

-- -----------------------------------------------------------------------------
-- stock_locations
-- -----------------------------------------------------------------------------
create table public.stock_locations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  branch_id  uuid not null references public.branches(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  kind       public.stock_location_kind not null default 'storage',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (branch_id, name)
);

create index stock_locations_branch_idx on public.stock_locations (tenant_id, branch_id);

-- -----------------------------------------------------------------------------
-- stock_movements — defter
-- -----------------------------------------------------------------------------
create table public.stock_movements (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  branch_id         uuid not null references public.branches(id) on delete cascade,
  location_id       uuid not null references public.stock_locations(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type     public.stock_movement_type not null,
  -- İşaret yönü taşır: pozitif = artış, negatif = azalış. `SUM(quantity)`
  -- anlık stok demektir; movement_type yalnızca raporlama/denetim içindir.
  quantity          numeric(18,6) not null check (quantity <> 0),
  -- Bu hareketin hangi olaydan doğduğu (ör. 'order_line', adisyon satırının id'si).
  -- Depletion işleminin idempotency'si buna dayanır — aşağıdaki kısıtlı
  -- unique indekse bakın.
  reference_type    text,
  reference_id      uuid,
  note              text check (note is null or length(note) <= 300),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index stock_movements_balance_idx
  on public.stock_movements (tenant_id, location_id, inventory_item_id);
create index stock_movements_item_time_idx
  on public.stock_movements (tenant_id, inventory_item_id, created_at desc);
create index stock_movements_reference_idx
  on public.stock_movements (reference_type, reference_id) where reference_type is not null;

-- Aynı olayın aynı ürün için İKİNCİ KEZ deftere yazılmasını engeller. Satış
-- düşümü iki kez tetiklense bile (ör. ödeme kapanışı yeniden denenirse) bu
-- kısıt ikinci denemeyi reddeder — depletion kodu bunu "zaten yapılmış" sayar.
create unique index stock_movements_reference_item_unique
  on public.stock_movements (reference_type, reference_id, inventory_item_id)
  where reference_type is not null;

-- -----------------------------------------------------------------------------
-- Değiştirilemezlik (audit_log ile aynı desen)
-- -----------------------------------------------------------------------------
create trigger stock_movements_no_update_delete
  before update or delete on public.stock_movements
  for each row execute function public.audit_log_is_append_only();

-- Denetim: stok hareketleri para hareketi kadar hassas.
create trigger stock_movements_audit
  after insert on public.stock_movements
  for each row execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- par_levels
-- -----------------------------------------------------------------------------
create table public.par_levels (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  location_id       uuid not null references public.stock_locations(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  reorder_point     numeric(18,6) not null default 0 check (reorder_point >= 0),
  min_quantity      numeric(18,6) check (min_quantity is null or min_quantity >= 0),
  max_quantity      numeric(18,6) check (max_quantity is null or max_quantity >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (location_id, inventory_item_id)
);

create index par_levels_location_idx on public.par_levels (tenant_id, location_id);

create trigger stock_locations_set_updated_at before update on public.stock_locations for each row execute function public.set_updated_at();
create trigger par_levels_set_updated_at      before update on public.par_levels      for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Görünümler
-- -----------------------------------------------------------------------------
-- security_invoker: görünüm sorguyu yapan kullanıcının RLS'iyle çalışır.
-- Bu olmadan görünüm sahibinin haklarıyla çalışabilir ve RLS'i etkisiz kılabilir.
create view public.v_stock_balance
  with (security_invoker = true) as
select
  tenant_id,
  branch_id,
  location_id,
  inventory_item_id,
  sum(quantity) as balance
from public.stock_movements
group by tenant_id, branch_id, location_id, inventory_item_id;

create view public.v_low_stock
  with (security_invoker = true) as
select
  p.tenant_id,
  p.location_id,
  l.name as location_name,
  p.inventory_item_id,
  i.name as item_name,
  i.base_unit,
  coalesce(b.balance, 0) as balance,
  p.reorder_point
from public.par_levels p
join public.stock_locations l on l.id = p.location_id
join public.inventory_items i on i.id = p.inventory_item_id
left join public.v_stock_balance b
  on b.location_id = p.location_id and b.inventory_item_id = p.inventory_item_id
where coalesce(b.balance, 0) <= p.reorder_point;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.stock_locations enable row level security;
alter table public.stock_locations force row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_movements force row level security;
alter table public.par_levels      enable row level security;
alter table public.par_levels      force row level security;

create policy stock_locations_select on public.stock_locations
  for select to authenticated using (tenant_id = public.current_tenant_id() and public.can_read_stock());
create policy stock_locations_write on public.stock_locations
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

-- DİKKAT: UPDATE/DELETE politikası yok — append-only. INSERT + SELECT yeter.
create policy stock_movements_select on public.stock_movements
  for select to authenticated using (tenant_id = public.current_tenant_id() and public.can_read_stock());
create policy stock_movements_insert on public.stock_movements
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.can_write_stock());

create policy par_levels_select on public.par_levels
  for select to authenticated using (tenant_id = public.current_tenant_id() and public.can_read_stock());
create policy par_levels_write on public.par_levels
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

-- =============================================================================
-- Yetkiler
-- =============================================================================
grant select, insert, update, delete on public.stock_locations to authenticated;
-- stock_movements: UPDATE/DELETE KASITLI OLARAK VERİLMİYOR.
grant select, insert                 on public.stock_movements to authenticated;
grant select, insert, update, delete on public.par_levels      to authenticated;

grant select on public.v_stock_balance to authenticated;
grant select on public.v_low_stock     to authenticated;

grant execute on function public.can_read_stock()  to authenticated;
grant execute on function public.can_write_stock() to authenticated;
revoke execute on function public.can_read_stock()  from public, anon;
revoke execute on function public.can_write_stock() from public, anon;
