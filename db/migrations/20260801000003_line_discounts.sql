-- =============================================================================
-- 0011 · İkram / iskonto onay akışı
-- =============================================================================
-- Plan §4: "ikram, eşik üstü indirim ... onay gerektiren aksiyonlar" —
-- müdür/patron dışındaki roller adisyon satırına ikram veya indirim
-- İSTEYEBİLİR ama bunu tek başına yürürlüğe koyamaz; müdür/patron onaylar.
-- Müdür/patron kendi isteğini anında onaylanmış olarak açar (kendi kendini
-- onaylatmaya gerek yok — RLS zaten yalnızca onların anında karar
-- vermesine izin veriyor, bkz. `line_discounts_write` politikası).
--
-- Tutar satırda DONDURULUR (comp/percent/amount ayrımı ve değeri) — tıpkı
-- `order_lines.unit_price` gibi, sonradan biri "indirim kuralı"nı değiştirse
-- bile geçmiş adisyonun tutarı değişmez.
-- =============================================================================

create type public.line_discount_kind   as enum ('comp', 'percent', 'amount');
create type public.line_discount_status as enum ('pending', 'approved', 'rejected');

create table public.line_discounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_line_id uuid not null references public.order_lines(id) on delete cascade,
  kind public.line_discount_kind not null,
  -- comp: yok sayılır (satır tamamen ikram). percent: 0-100. amount: TL, satır
  -- tutarını aşamaz (aşağıdaki check yalnızca negatif olmamasını garanti eder;
  -- üst sınır uygulama katmanında kontrol edilir çünkü satır tutarı burada bilinmez).
  value numeric(14,4) not null default 0 check (value >= 0),
  reason text not null check (length(btrim(reason)) between 3 and 200),
  status public.line_discount_status not null default 'pending',
  requested_by uuid not null references auth.users(id) on delete restrict,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);
create index line_discounts_order_line_idx on public.line_discounts (tenant_id, order_line_id);
create index line_discounts_pending_idx on public.line_discounts (tenant_id, status) where status = 'pending';

-- Bir satırda aynı anda tek bekleyen istek olabilir — art arda üç kez
-- "ikram" tuşuna basılırsa üç onay isteği birikmesin.
create unique index line_discounts_one_pending_per_line
  on public.line_discounts (order_line_id) where status = 'pending';

-- order_line'ın tenant'ı ile satırınki eşleşmeli.
create or replace function public.line_discounts_tenant_guard()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_line_tenant uuid;
begin
  select ol.tenant_id into v_line_tenant
  from public.order_lines ol where ol.id = new.order_line_id;

  if v_line_tenant is null or v_line_tenant <> new.tenant_id then
    raise exception 'line_discounts: order_line yanlış tenant''a ait';
  end if;

  return new;
end;
$$;

create trigger line_discounts_tenant_guard
  before insert or update on public.line_discounts
  for each row execute function public.line_discounts_tenant_guard();

create trigger line_discounts_set_updated_at
  before update on public.line_discounts
  for each row execute function public.set_updated_at();

-- Karar zamanını otomatik damgala; uygulama unutsa bile tutarlı kalsın.
create or replace function public.line_discounts_stamp_decision()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    if new.decided_at is null then new.decided_at := now(); end if;
  end if;
  return new;
end;
$$;

create trigger line_discounts_stamp_decision
  before update on public.line_discounts
  for each row execute function public.line_discounts_stamp_decision();

create trigger line_discounts_audit
  after insert or update or delete on public.line_discounts
  for each row execute function public.audit_trigger();

alter table public.line_discounts enable row level security;
alter table public.line_discounts force row level security;

create policy line_discounts_select on public.line_discounts
  for select to authenticated using (tenant_id = public.current_tenant_id());

-- Herkes (branch personeli) istek AÇABİLİR — kendi isteğini 'pending' olarak,
-- müdür/patron ise doğrudan 'approved' olarak oluşturabilir. 'rejected' asla
-- insert anında kullanılamaz (bir talep önce var olmalı).
create policy line_discounts_insert on public.line_discounts
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and requested_by = (select auth.uid())
    and (
      (public.is_manager() and status = 'approved' and decided_by = (select auth.uid()))
      or (not public.is_manager() and status = 'pending' and decided_by is null)
    )
  );

-- Yalnızca müdür/patron bekleyen bir isteği karara bağlayabilir.
create policy line_discounts_update on public.line_discounts
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_manager()
    and decided_by = (select auth.uid())
  );

grant select, insert, update on public.line_discounts to authenticated;

revoke execute on function public.line_discounts_tenant_guard()    from public, anon, authenticated;
revoke execute on function public.line_discounts_stamp_decision()  from public, anon, authenticated;

alter publication supabase_realtime add table public.line_discounts;
