-- =============================================================================
-- 0016 · Sadakat / puan sistemi
-- =============================================================================
-- `customers.points_balance` diye mutlanabilir bir sütun YOK — stok defteri
-- (`stock_movements`/`v_stock_balance`, migration 0007) ile BİREBİR aynı
-- desen: bakiye asla doğrudan yazılmaz, yalnızca `loyalty_transactions`'a
-- append edilir; `v_customer_points` bunun toplamı. Doğrudan bir sütun olsaydı
-- iki eşzamanlı ödeme "puanı düş" derken race condition'la bakiyeyi
-- bozabilirdi; ledger + toplam görünüm bu sınıf hatayı yapısal olarak ortadan
-- kaldırıyor.
--
-- `orders.customer_id`: adisyonun HANGİ müşteriye ait olduğunun kaydı — bu
-- bir parasal değer değil, sade bir kimlik bağı, o yüzden ledger deseni
-- dışında (ledger yalnızca PUAN hareketlerine uygulanıyor).
-- =============================================================================

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone text not null check (phone ~ '^[0-9+][0-9 ]{6,19}$'),
  name text check (name is null or length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (tenant_id, phone)
);
create index customers_tenant_idx on public.customers (tenant_id);

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  kind text not null check (kind in ('earn', 'redeem', 'adjustment')),
  points_delta int not null check (
    (kind = 'earn' and points_delta > 0)
    or (kind = 'redeem' and points_delta < 0)
    or (kind = 'adjustment')
  ),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index loyalty_transactions_customer_idx on public.loyalty_transactions (tenant_id, customer_id);

-- security_invoker: RLS'siz görünüm sahibi haklarıyla çalışıp tenant sınırını
-- delmesin diye (bkz. migration 0007'deki aynı gerekçe, v_stock_balance).
create view public.v_customer_points
  with (security_invoker = true) as
select
  tenant_id,
  customer_id,
  coalesce(sum(points_delta), 0)::int as balance
from public.loyalty_transactions
group by tenant_id, customer_id;

alter table public.orders
  add column customer_id uuid references public.customers(id) on delete set null;

alter table public.customers enable row level security;
alter table public.customers force row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.loyalty_transactions force row level security;

create policy customers_select on public.customers
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
-- Herhangi bir tenant üyesi kasada yeni müşteri açabilmeli/adını
-- düzeltebilmeli — manager-gated değil, `line_discounts` değil bir kimlik
-- kartı bu, hassas bir alan taşımıyor.
create policy customers_insert on public.customers
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());
create policy customers_update on public.customers
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy loyalty_transactions_select on public.loyalty_transactions
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy loyalty_transactions_insert on public.loyalty_transactions
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

grant select, insert, update on public.customers             to authenticated;
grant select, insert         on public.loyalty_transactions  to authenticated;
grant select on public.v_customer_points to authenticated;
