-- =============================================================================
-- 0008 · Salon, masa, adisyon, ödeme
-- =============================================================================
-- Faz 2'nin veri temeli. Üç tasarım kararı öne çıkıyor:
--
--   1. FİYAT SATIRDA DONDURULUR. `order_lines.unit_price` menü fiyatına
--      referans değil, kopyadır. Zam yapıldığında dün kesilen adisyonun
--      tutarı değişmez.
--
--   2. REÇETE VERSİYONU SATIRDA DONDURULUR. Faz 3'teki stok düşümü, satışın
--      yapıldığı andaki reçeteyi kullanacak — dün satılan pizza dünkü
--      gramajıyla düşülmeli.
--
--   3. `client_key` + unique kısıtı. Offline alınan bir sipariş bağlantı
--      dönünce iki kez gönderilse bile veritabanı ikincisini reddeder.
--      Koruma uygulama mantığında değil kısıtta — yani atlanamaz.
-- =============================================================================

create type public.order_status      as enum ('open','closed','cancelled');
create type public.order_channel     as enum ('dine_in','takeaway','delivery');
create type public.order_line_status as enum ('pending','sent','preparing','ready','served','cancelled');
create type public.payment_method    as enum ('cash','card','meal_card','on_account');

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, name)
);
create index areas_branch_idx on public.areas (tenant_id, branch_id, sort_order);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 30),
  seats smallint not null default 4 check (seats between 1 and 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, name)
);
create index tables_branch_idx on public.tables (tenant_id, branch_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  order_no bigint,
  channel public.order_channel not null default 'dine_in',
  status public.order_status not null default 'open',
  guest_count smallint check (guest_count is null or guest_count between 1 and 60),
  note text check (note is null or length(note) <= 300),
  opened_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  -- Offline istemcinin ürettiği anahtar; çift kaydı kısıt engeller.
  client_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, client_key),
  unique (branch_id, order_no)
);
create index orders_open_idx on public.orders (tenant_id, branch_id, status, opened_at desc);
create index orders_table_idx on public.orders (table_id) where status = 'open';

-- Bir masada aynı anda tek açık adisyon.
create unique index orders_one_open_per_table
  on public.orders (table_id) where status = 'open' and table_id is not null;

-- Şube bazlı sıra numarası: garson "42 numaralı adisyon" diyebilsin.
create or replace function public.orders_assign_number()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.order_no is null then
    select coalesce(max(o.order_no), 0) + 1 into new.order_no
    from public.orders o where o.branch_id = new.branch_id;
  end if;
  return new;
end;
$$;

create trigger orders_assign_number before insert on public.orders
  for each row execute function public.orders_assign_number();

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  -- Menü fiyatının KOPYASI; referans değil.
  unit_price numeric(14,4) not null check (unit_price >= 0),
  vat_rate numeric(5,2) not null default 10 check (vat_rate between 0 and 100),
  -- Satış anındaki reçete; Faz 3 stok düşümü bunu kullanacak.
  recipe_version_id uuid references public.recipe_versions(id) on delete set null,
  status public.order_line_status not null default 'pending',
  station text check (station is null or length(station) <= 40),
  note text check (note is null or length(note) <= 200),
  sent_at timestamptz,
  ready_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_key text not null,
  unique (order_id, client_key)
);
create index order_lines_order_idx on public.order_lines (tenant_id, order_id);
create index order_lines_kds_idx on public.order_lines (tenant_id, status, sent_at)
  where status in ('sent','preparing');

-- Durum geçiş zamanları: KDS'deki süre sayacı buna dayanacak.
create or replace function public.order_lines_stamp_status()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'sent'  and new.sent_at  is null then new.sent_at  := now(); end if;
    if new.status = 'ready' and new.ready_at is null then new.ready_at := now(); end if;
  end if;
  return new;
end;
$$;

create trigger order_lines_stamp_status before update on public.order_lines
  for each row execute function public.order_lines_stamp_status();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  method public.payment_method not null,
  amount numeric(14,4) not null check (amount > 0),
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  client_key text not null,
  unique (order_id, client_key)
);
create index payments_order_idx on public.payments (tenant_id, order_id);

create trigger areas_set_updated_at       before update on public.areas       for each row execute function public.set_updated_at();
create trigger tables_set_updated_at      before update on public.tables      for each row execute function public.set_updated_at();
create trigger orders_set_updated_at      before update on public.orders      for each row execute function public.set_updated_at();
create trigger order_lines_set_updated_at before update on public.order_lines for each row execute function public.set_updated_at();

-- Para hareketi ve iptaller iz bırakmalı.
create trigger orders_audit      after insert or update or delete on public.orders      for each row execute function public.audit_trigger();
create trigger order_lines_audit after insert or update or delete on public.order_lines for each row execute function public.audit_trigger();
create trigger payments_audit    after insert or update or delete on public.payments    for each row execute function public.audit_trigger();

alter table public.areas       enable row level security;
alter table public.areas       force row level security;
alter table public.tables      enable row level security;
alter table public.tables      force row level security;
alter table public.orders      enable row level security;
alter table public.orders      force row level security;
alter table public.order_lines enable row level security;
alter table public.order_lines force row level security;
alter table public.payments    enable row level security;
alter table public.payments    force row level security;

create policy areas_select on public.areas
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy areas_write on public.areas
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

create policy tables_select on public.tables
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tables_write on public.tables
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

-- Şube kısıtı önemli: personel başka şubenin adisyonuna dokunamaz.
create policy orders_select on public.orders
  for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and (public.is_manager() or branch_id = public.current_branch_id()));
create policy orders_write on public.orders
  for all to authenticated
  using (tenant_id = public.current_tenant_id()
         and (public.is_manager() or branch_id = public.current_branch_id()))
  with check (tenant_id = public.current_tenant_id()
         and (public.is_manager() or branch_id = public.current_branch_id()));

create policy order_lines_select on public.order_lines
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy order_lines_write on public.order_lines
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy payments_select on public.payments
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy payments_write on public.payments
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.areas       to authenticated;
grant select, insert, update, delete on public.tables      to authenticated;
grant select, insert, update, delete on public.orders      to authenticated;
grant select, insert, update, delete on public.order_lines to authenticated;
grant select, insert, update, delete on public.payments    to authenticated;

revoke execute on function public.orders_assign_number()     from public, anon, authenticated;
revoke execute on function public.order_lines_stamp_status() from public, anon, authenticated;
