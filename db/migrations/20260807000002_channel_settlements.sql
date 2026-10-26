-- =============================================================================
-- 0021 · Paket platformu hakediş mutabakatı
-- =============================================================================
-- `fiscal_receipts` (migration 0020) ile AYNI mantık, farklı kaynak:
-- Yemeksepeti/Getir/Trendyol Go gerçek API'yle bağlı değil (bkz.
-- `src/lib/integrations`, mock adaptör) — platform her dönem kendi hakediş
-- raporunu (kaç sipariş, ne kadar kesinti, net ödeme) mail/panel üzerinden
-- gönderiyor, GastroFlow bunu OTOMATİK görmüyor. Bu tablo o raporun toplamını
-- GastroFlow'un kendi `takeaway`/`self_service` kanal cirosuyla karşılaştırmak
-- için — hangi platformdan geldiğini `platform` metin alanı taşıyor (sabit bir
-- liste değil; entegre olmayan bir platformun adını uydurmuyoruz).
-- =============================================================================

create table public.channel_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  platform text not null check (length(btrim(platform)) between 1 and 60),
  settlement_date date not null,
  amount numeric(14, 4) not null check (amount > 0),
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index channel_settlements_branch_date_idx
  on public.channel_settlements (tenant_id, branch_id, settlement_date);

alter table public.channel_settlements enable row level security;
alter table public.channel_settlements force row level security;

create policy channel_settlements_select on public.channel_settlements
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy channel_settlements_insert on public.channel_settlements
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy channel_settlements_delete on public.channel_settlements
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager());

grant select, insert, delete on public.channel_settlements to authenticated;
