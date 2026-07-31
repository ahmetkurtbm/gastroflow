-- =============================================================================
-- 0011 · Modifier'lar (ekstra seçenekler)
-- =============================================================================
-- "Acılı", "büyük boy", "ekstra peynir" gibi bir ürüne bağlı seçenekler.
-- Fiyat farkı seçenekte TANIMLANIR, ADİSYON SATIRINDA DONDURULUR — menü fiyatı
-- gibi aynı prensip: modifier fiyatı sonradan değişse bile geçmiş satışın
-- tutarı değişmemeli.
-- =============================================================================

create table public.modifier_groups (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  menu_item_id  uuid not null references public.menu_items(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 60),
  -- 0 = opsiyonel. min_select > 0 ise adisyona eklemeden önce seçim zorunlu.
  min_select    smallint not null default 0 check (min_select >= 0),
  max_select    smallint not null default 1 check (max_select >= 1),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  check (max_select >= min_select),
  unique (menu_item_id, name)
);

create index modifier_groups_menu_item_idx on public.modifier_groups (tenant_id, menu_item_id, sort_order);

create table public.modifiers (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  modifier_group_id  uuid not null references public.modifier_groups(id) on delete cascade,
  name               text not null check (length(btrim(name)) between 1 and 60),
  -- Menü fiyatına eklenen fark. Negatif olabilir (ör. "sossuz" -2 TL) ama
  -- toplamı sıfırın altına düşürmek POS tarafında ayrıca kontrol edilecek.
  price_delta        numeric(14,4) not null default 0,
  sort_order         integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (modifier_group_id, name)
);

create index modifiers_group_idx on public.modifiers (tenant_id, modifier_group_id, sort_order);

-- -----------------------------------------------------------------------------
-- order_line_modifiers — adisyon satırına eklenen seçim, fiyatı dondurulmuş
-- -----------------------------------------------------------------------------
create table public.order_line_modifiers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  order_line_id  uuid not null references public.order_lines(id) on delete cascade,
  modifier_id    uuid references public.modifiers(id) on delete set null,
  -- Modifier adı ve fiyatı da AYRICA burada dondurulur: modifier sonradan
  -- silinse/değişse bile adisyon fişi "ekstra peynir +15 TL" demeye devam eder.
  name           text not null,
  price_delta    numeric(14,4) not null,
  created_at     timestamptz not null default now()
);

create index order_line_modifiers_line_idx on public.order_line_modifiers (tenant_id, order_line_id);

-- -----------------------------------------------------------------------------
-- Tutarlılık: grup/modifier aynı işletmeye ve doğru üst kayda ait olmalı.
-- -----------------------------------------------------------------------------
create or replace function public.modifiers_group_tenant_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.modifier_groups g
    where g.id = new.modifier_group_id and g.tenant_id = new.tenant_id
  ) then
    raise exception 'Modifier grubu bu işletmeye ait değil' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger modifiers_group_tenant_guard
  before insert or update on public.modifiers
  for each row execute function public.modifiers_group_tenant_guard();

create trigger modifier_groups_set_updated_at before update on public.modifier_groups for each row execute function public.set_updated_at();
create trigger modifiers_set_updated_at       before update on public.modifiers       for each row execute function public.set_updated_at();

create trigger modifier_groups_audit after insert or update or delete on public.modifier_groups for each row execute function public.audit_trigger();
create trigger modifiers_audit       after insert or update or delete on public.modifiers       for each row execute function public.audit_trigger();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.modifier_groups       enable row level security;
alter table public.modifier_groups       force row level security;
alter table public.modifiers             enable row level security;
alter table public.modifiers             force row level security;
alter table public.order_line_modifiers  enable row level security;
alter table public.order_line_modifiers  force row level security;

-- Menü verisiyle aynı görünürlük: herkes okur (POS'a gerekli), yönetici yazar.
create policy modifier_groups_select on public.modifier_groups
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy modifier_groups_write on public.modifier_groups
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

create policy modifiers_select on public.modifiers
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy modifiers_write on public.modifiers
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());

-- order_line_modifiers: order_lines ile aynı görünürlük (tüm işletme personeli).
create policy order_line_modifiers_select on public.order_line_modifiers
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy order_line_modifiers_write on public.order_line_modifiers
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.modifier_groups      to authenticated;
grant select, insert, update, delete on public.modifiers            to authenticated;
grant select, insert, update, delete on public.order_line_modifiers to authenticated;

revoke execute on function public.modifiers_group_tenant_guard() from public, anon, authenticated;
