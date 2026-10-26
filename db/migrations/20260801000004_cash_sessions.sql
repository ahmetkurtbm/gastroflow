-- =============================================================================
-- 0012 · Kasa oturumu (vardiya) + gün sonu
-- =============================================================================
-- Plan §6: "/cash — Vardiya aç/kapat, kasa sayımı, ödeme türü kırılımı, fark,
-- tek tık kapanış". Tek şubede vardiya = kasa oturumu; ayrı bir `shifts`
-- tablosuna gerek yok, ikisi aynı gerçek dünya olayı.
--
-- Her ödeme AÇIK olan kasa oturumuna bağlanır (`payments.cash_session_id`).
-- Bu, kapanışta "bu vardiyada ne kadar nakit girmeliydi" sorusunu zaman
-- aralığı tahminiyle değil, doğrudan foreign key ile cevaplar — vardiya
-- sınırında alınan bir ödemenin yanlış vardiyaya sayılması imkansız olur.
-- =============================================================================

create type public.cash_session_status as enum ('open', 'closed');

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  status public.cash_session_status not null default 'open',
  opening_float numeric(14,4) not null default 0 check (opening_float >= 0),
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  -- Kapanışta fiziksel sayılan nakit; nakit dışı yöntemlerde fark hesabı
  -- gerekmiyor ama nakit için "sayım" bu ekranın asıl sebebi.
  counted_cash numeric(14,4) check (counted_cash is null or counted_cash >= 0),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bir şubede aynı anda tek açık kasa oturumu.
create unique index cash_sessions_one_open_per_branch
  on public.cash_sessions (branch_id) where status = 'open';
create index cash_sessions_branch_idx on public.cash_sessions (tenant_id, branch_id, opened_at desc);

alter table public.payments
  add column cash_session_id uuid references public.cash_sessions(id) on delete set null;
create index payments_cash_session_idx on public.payments (cash_session_id);

create or replace function public.cash_sessions_stamp_close()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.status = 'closed' and old.status = 'open' and new.closed_at is null then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

create trigger cash_sessions_stamp_close
  before update on public.cash_sessions
  for each row execute function public.cash_sessions_stamp_close();

create trigger cash_sessions_set_updated_at
  before update on public.cash_sessions
  for each row execute function public.set_updated_at();

create trigger cash_sessions_audit
  after insert or update or delete on public.cash_sessions
  for each row execute function public.audit_trigger();

alter table public.cash_sessions enable row level security;
alter table public.cash_sessions force row level security;

-- Finansal veri: yalnızca kasa/müdür/patron görebilir (garson/mutfak/depo değil).
create policy cash_sessions_select on public.cash_sessions
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_manager() or public.current_app_role() = 'cashier')
  );

-- Kasiyer yalnızca kendi şubesinde; müdür/patron tenant genelinde (diğer
-- yazma politikalarındaki desenle aynı, bkz. migration 0008 `orders_write`).
create policy cash_sessions_write on public.cash_sessions
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_manager()
      or (public.current_app_role() = 'cashier' and branch_id = public.current_branch_id())
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.is_manager()
      or (public.current_app_role() = 'cashier' and branch_id = public.current_branch_id())
    )
  );

grant select, insert, update on public.cash_sessions to authenticated;

revoke execute on function public.cash_sessions_stamp_close() from public, anon, authenticated;

alter publication supabase_realtime add table public.cash_sessions;
