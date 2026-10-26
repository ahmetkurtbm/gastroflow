-- =============================================================================
-- 0014 · Tedarik zinciri: tedarikçi, fiyat listesi, sipariş, mal kabul
-- =============================================================================
-- Plan §8 Faz 4'ün "gerçek entegrasyon gerektirmeyen" kısmı: tedarikçi
-- kartları, fiyat listeleri, PO onay akışı, mal kabul → stok girişi.
-- OCR fatura okuma ve tedarikçiye otomatik mail (Faz 5 bildirim motoruna
-- bağlı) bilinçli olarak DIŞARIDA — ikisi de gerçek dış servis ister
-- (ReceiptFlow OCR köprüsü, Resend), plan §0 "adapter arayüzü + mock"
-- ilkesi burada da geçerli: önce çekirdek akış, entegrasyon sonra takılır.
--
-- Mal kabul AYRI bir tablo değil — `po_lines.received_quantity` doluyor ve
-- karşılığında `stock_movements`'a `purchase_in` yazılıyor. Sipariş ile gelen
-- arasındaki fark bu iki kolonun (quantity vs received_quantity) farkından
-- doğrudan okunuyor, ayrı bir "fark" hesabı gerekmiyor.
-- =============================================================================

create type public.purchase_order_status as enum (
  'pending_approval', -- oluşturuldu, müdür/patron onayı bekliyor
  'approved',          -- onaylandı, mal kabule hazır
  'rejected',          -- reddedildi
  'received',          -- mal kabul tamamlandı, stok girişi yazıldı
  'cancelled'          -- onaydan önce ya da sonra iptal edildi
);

create or replace function public.can_read_purchasing()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select public.current_app_role() in ('owner', 'manager', 'storekeeper', 'accountant');
$$;

create or replace function public.can_write_purchasing()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select public.current_app_role() in ('owner', 'manager', 'storekeeper');
$$;

-- -----------------------------------------------------------------------------
-- suppliers
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  contact_name  text check (contact_name is null or length(contact_name) <= 120),
  phone         text check (phone is null or length(phone) <= 30),
  email         text check (email is null or length(email) <= 200),
  lead_time_days smallint not null default 1 check (lead_time_days >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, name)
);
create index suppliers_tenant_idx on public.suppliers (tenant_id);

-- -----------------------------------------------------------------------------
-- supplier_items — fiyat listesi
-- -----------------------------------------------------------------------------
create table public.supplier_items (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  supplier_id        uuid not null references public.suppliers(id) on delete cascade,
  inventory_item_id  uuid not null references public.inventory_items(id) on delete cascade,
  supplier_sku       text check (supplier_sku is null or length(supplier_sku) <= 60),
  -- Ürünün base_unit'i cinsinden fiyat — mevcut birim dönüşüm/reçete motoruyla
  -- aynı prensip (bkz. migration 0007): tek birim sisteminde yaşamak, koli/adet
  -- karışıklığını PO ekranına taşımamak.
  price              numeric(14,4) not null check (price >= 0),
  min_order_quantity numeric(14,4) not null default 0 check (min_order_quantity >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (supplier_id, inventory_item_id)
);
create index supplier_items_tenant_idx on public.supplier_items (tenant_id, supplier_id);
create index supplier_items_item_idx on public.supplier_items (tenant_id, inventory_item_id);

create or replace function public.supplier_items_tenant_guard()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_supplier_tenant uuid;
begin
  select s.tenant_id into v_supplier_tenant from public.suppliers s where s.id = new.supplier_id;
  if v_supplier_tenant is null or v_supplier_tenant <> new.tenant_id then
    raise exception 'supplier_items: tedarikçi yanlış tenant''a ait';
  end if;
  return new;
end;
$$;
create trigger supplier_items_tenant_guard
  before insert or update on public.supplier_items
  for each row execute function public.supplier_items_tenant_guard();

-- -----------------------------------------------------------------------------
-- purchase_orders
-- -----------------------------------------------------------------------------
create table public.purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  branch_id    uuid not null references public.branches(id) on delete cascade,
  supplier_id  uuid not null references public.suppliers(id) on delete restrict,
  status       public.purchase_order_status not null default 'pending_approval',
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  decided_by   uuid references auth.users(id) on delete set null,
  decided_at   timestamptz,
  received_by  uuid references auth.users(id) on delete set null,
  received_at  timestamptz,
  note         text check (note is null or length(note) <= 300),
  client_key   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (branch_id, client_key)
);
create index purchase_orders_branch_idx on public.purchase_orders (tenant_id, branch_id, requested_at desc);
create index purchase_orders_status_idx on public.purchase_orders (tenant_id, status);

-- -----------------------------------------------------------------------------
-- po_lines
-- -----------------------------------------------------------------------------
create table public.po_lines (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  po_id              uuid not null references public.purchase_orders(id) on delete cascade,
  inventory_item_id  uuid not null references public.inventory_items(id) on delete restrict,
  quantity           numeric(14,4) not null check (quantity > 0),
  -- Fiyat PO oluşturulduğu anda supplier_items'tan DONDURULUR — aynı fiyat
  -- dondurma prensibi menü/reçete tarafında da var (bkz. migration 0008).
  unit_price         numeric(14,4) not null check (unit_price >= 0),
  received_quantity  numeric(14,4) check (received_quantity is null or received_quantity >= 0),
  created_at         timestamptz not null default now(),
  unique (po_id, inventory_item_id)
);
create index po_lines_po_idx on public.po_lines (tenant_id, po_id);

-- Bir satır yalnızca ait olduğu siparişin durumu uygunken eklenebilir/güncellenebilir:
-- INSERT → sipariş hâlâ onay bekliyor olmalı (satır ekleme = sipariş kurma aşaması).
-- UPDATE → sipariş onaylanmış olmalı (mal kabulde received_quantity yazılır).
create or replace function public.po_lines_guard()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_po record;
begin
  select tenant_id, status into v_po from public.purchase_orders where id = new.po_id;

  if v_po.tenant_id is null or v_po.tenant_id <> new.tenant_id then
    raise exception 'po_lines: sipariş yanlış tenant''a ait';
  end if;

  if TG_OP = 'INSERT' and v_po.status <> 'pending_approval' then
    raise exception 'po_lines: yalnızca onay bekleyen siparişe satır eklenebilir';
  end if;

  if TG_OP = 'UPDATE' and v_po.status <> 'approved' then
    raise exception 'po_lines: mal kabul yalnızca onaylanmış siparişte yapılabilir';
  end if;

  return new;
end;
$$;
create trigger po_lines_guard
  before insert or update on public.po_lines
  for each row execute function public.po_lines_guard();

-- -----------------------------------------------------------------------------
-- purchase_orders durum geçişi koruması
-- -----------------------------------------------------------------------------
-- RLS yalnızca "bu role bu tabloya dokunabilir mi" sorusuna cevap verir;
-- "bu geçiş bu rolden bu durumdan yapılabilir mi" sorusu burada, tek yerde
-- cevaplanıyor — istemci hangi status'ü göndermeye çalışırsa çalışsın atlanamaz.
create or replace function public.purchase_orders_guard_transition()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('approved', 'rejected') then
      if old.status <> 'pending_approval' then
        raise exception 'purchase_orders: yalnızca onay bekleyen sipariş onaylanabilir/reddedilebilir';
      end if;
      if not public.is_manager() then
        raise exception 'purchase_orders: yalnızca müdür/patron onaylayabilir';
      end if;
      new.decided_by := (select auth.uid());
      new.decided_at := now();
    elsif new.status = 'received' then
      if old.status <> 'approved' then
        raise exception 'purchase_orders: yalnızca onaylanmış sipariş mal kabul edilebilir';
      end if;
      new.received_by := (select auth.uid());
      new.received_at := now();
    elsif new.status = 'cancelled' then
      if old.status not in ('pending_approval', 'approved') then
        raise exception 'purchase_orders: bu durumdaki sipariş iptal edilemez';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger purchase_orders_guard_transition
  before update on public.purchase_orders
  for each row execute function public.purchase_orders_guard_transition();

create trigger suppliers_set_updated_at       before update on public.suppliers       for each row execute function public.set_updated_at();
create trigger supplier_items_set_updated_at  before update on public.supplier_items  for each row execute function public.set_updated_at();
create trigger purchase_orders_set_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at();

create trigger suppliers_audit       after insert or update or delete on public.suppliers       for each row execute function public.audit_trigger();
create trigger supplier_items_audit  after insert or update or delete on public.supplier_items  for each row execute function public.audit_trigger();
create trigger purchase_orders_audit after insert or update or delete on public.purchase_orders for each row execute function public.audit_trigger();
create trigger po_lines_audit        after insert or update or delete on public.po_lines        for each row execute function public.audit_trigger();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.suppliers       enable row level security;
alter table public.suppliers       force row level security;
alter table public.supplier_items  enable row level security;
alter table public.supplier_items  force row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_orders force row level security;
alter table public.po_lines        enable row level security;
alter table public.po_lines        force row level security;

create policy suppliers_select on public.suppliers
  for select to authenticated using (tenant_id = public.current_tenant_id() and public.can_read_purchasing());
create policy suppliers_write on public.suppliers
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_write_purchasing())
  with check (tenant_id = public.current_tenant_id() and public.can_write_purchasing());

create policy supplier_items_select on public.supplier_items
  for select to authenticated using (tenant_id = public.current_tenant_id() and public.can_read_purchasing());
create policy supplier_items_write on public.supplier_items
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_write_purchasing())
  with check (tenant_id = public.current_tenant_id() and public.can_write_purchasing());

-- Şube kısıtı diğer branch-scoped tablolarla aynı desen (bkz. migration 0008
-- orders_write): müdür/patron tenant genelinde, diğerleri kendi şubesinde.
create policy purchase_orders_select on public.purchase_orders
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_read_purchasing()
    and (public.is_manager() or branch_id = public.current_branch_id())
  );
create policy purchase_orders_insert on public.purchase_orders
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.can_write_purchasing()
    and (public.is_manager() or branch_id = public.current_branch_id())
    and status = 'pending_approval'
    and requested_by = (select auth.uid())
  );
create policy purchase_orders_update on public.purchase_orders
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_write_purchasing()
    and (public.is_manager() or branch_id = public.current_branch_id())
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.can_write_purchasing()
    and (public.is_manager() or branch_id = public.current_branch_id())
  );

create policy po_lines_select on public.po_lines
  for select to authenticated using (tenant_id = public.current_tenant_id() and public.can_read_purchasing());
create policy po_lines_insert on public.po_lines
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.can_write_purchasing());
create policy po_lines_update on public.po_lines
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_write_purchasing())
  with check (tenant_id = public.current_tenant_id() and public.can_write_purchasing());

grant select, insert, update, delete on public.suppliers       to authenticated;
grant select, insert, update, delete on public.supplier_items  to authenticated;
grant select, insert, update         on public.purchase_orders to authenticated;
grant select, insert, update         on public.po_lines        to authenticated;

grant execute on function public.can_read_purchasing()  to authenticated;
grant execute on function public.can_write_purchasing() to authenticated;
revoke execute on function public.can_read_purchasing()  from public, anon;
revoke execute on function public.can_write_purchasing() from public, anon;
revoke execute on function public.supplier_items_tenant_guard()       from public, anon, authenticated;
revoke execute on function public.po_lines_guard()                    from public, anon, authenticated;
revoke execute on function public.purchase_orders_guard_transition()  from public, anon, authenticated;
