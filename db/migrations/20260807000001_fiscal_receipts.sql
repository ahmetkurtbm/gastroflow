-- =============================================================================
-- 0020 · Fiş mutabakatı
-- =============================================================================
-- ÖKC entegrasyonu gerçek değil (bkz. src/lib/integrations, mock adaptör) —
-- gerçek kullanımda kasiyer günü hem GastroFlow'a hem AYRI, fiziksel
-- yazarkasaya giriyor. İki sistem arasında elle çift giriş = insan hatası
-- riski (araştırmadaki 3. madde, "Banka/POS mutabakatsızlığı"). Bu tablo
-- o riski YAKALAMAK için: gün sonunda yazarkasadan çıkan fişler Excel'le
-- toplu girilir, GastroFlow'un kendi kayıtlı cirosuyla karşılaştırılır.
--
-- Append-only (yalnızca INSERT) — bir fiş kaydı "düzeltilmez", yanlış
-- girilmişse silinip yeniden girilir (bkz. `fiscal_receipts_delete` policy,
-- yalnızca manager). Ledger değil (para hareketi değil, dış sistemin
-- BEYANI) ama aynı "geçmişi bozma" endişesiyle UPDATE hiç açılmıyor.
-- =============================================================================

create table public.fiscal_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  receipt_date date not null,
  receipt_no text check (receipt_no is null or length(receipt_no) <= 40),
  amount numeric(14, 4) not null check (amount > 0),
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index fiscal_receipts_branch_date_idx on public.fiscal_receipts (tenant_id, branch_id, receipt_date);

alter table public.fiscal_receipts enable row level security;
alter table public.fiscal_receipts force row level security;

create policy fiscal_receipts_select on public.fiscal_receipts
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy fiscal_receipts_insert on public.fiscal_receipts
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy fiscal_receipts_delete on public.fiscal_receipts
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager());

grant select, insert, delete on public.fiscal_receipts to authenticated;
