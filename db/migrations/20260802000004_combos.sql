-- =============================================================================
-- 0012 · Kombo / menü kampanyası
-- =============================================================================
-- "Büyük menü = burger + patates + içecek, tek fiyat" gibi paket ürünler.
--
-- BİLİNÇLİ TASARIM KARARI: bir kombo satıldığında AYRI bir "kombo satırı"
-- türü YARATMIYORUZ. `addComboToOrder` (bkz. src/lib/orders/actions.ts)
-- kombonun sabit fiyatını bileşenlerine `allocate()` (aynı hesap bölme
-- fonksiyonu) ile PAYLAŞTIRIP her bileşen için normal bir `order_lines`
-- satırı açıyor. Sebep: stok düşümü, reçete maliyeti, KDS, raporlama —
-- hepsi zaten `order_lines.menu_item_id`'ye dayanıyor. Ayrı bir "kombo
-- satırı" kavramı bu altyapının TAMAMINI (depletion.ts, KDS, varyans
-- raporu) kombo farkındalıklı hale getirmeyi gerektirirdi. Bunun yerine
-- kombo yalnızca bir "fiyatlandırma kısayolu" — satıldıktan sonra sistemin
-- geri kalanı için sıradan N adet ayrı satırdan farksız.
-- =============================================================================

create table public.combos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  -- Kombonun TOPLAM sabit fiyatı — bileşenlerin tek tek fiyatları toplamı
  -- değil, kasıtlı olarak daha düşük bir kampanya fiyatı olabilir.
  price       numeric(14,4) not null check (price >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (tenant_id, name)
);
create index combos_tenant_idx on public.combos (tenant_id) where is_active;

create table public.combo_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  combo_id      uuid not null references public.combos(id) on delete cascade,
  menu_item_id  uuid not null references public.menu_items(id) on delete restrict,
  quantity      numeric(12,3) not null default 1 check (quantity > 0),
  created_at    timestamptz not null default now(),

  unique (combo_id, menu_item_id)
);
create index combo_items_combo_idx on public.combo_items (tenant_id, combo_id);

-- Bileşen ürün, kombonun AYNI işletmesinden olmalı — menu_items_category_tenant_guard
-- ile aynı desen (bkz. migration 0006).
create or replace function public.combo_items_tenant_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.menu_items mi
    where mi.id = new.menu_item_id and mi.tenant_id = new.tenant_id
  ) then
    raise exception 'Kombo bileşeni bu işletmeye ait değil'
      using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.combos c
    where c.id = new.combo_id and c.tenant_id = new.tenant_id
  ) then
    raise exception 'Kombo bu işletmeye ait değil'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger combo_items_tenant_guard
  before insert or update of combo_id, menu_item_id, tenant_id on public.combo_items
  for each row execute function public.combo_items_tenant_guard();

create trigger combos_set_updated_at before update on public.combos
  for each row execute function public.set_updated_at();

alter table public.combos      enable row level security;
alter table public.combos      force row level security;
alter table public.combo_items enable row level security;
alter table public.combo_items force row level security;

create policy combos_select on public.combos
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy combos_insert on public.combos
  for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy combos_update on public.combos
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy combos_delete on public.combos
  for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

create policy combo_items_select on public.combo_items
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy combo_items_insert on public.combo_items
  for insert to authenticated with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy combo_items_update on public.combo_items
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy combo_items_delete on public.combo_items
  for delete to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

grant select, insert, update, delete on public.combos      to authenticated;
grant select, insert, update, delete on public.combo_items to authenticated;

revoke execute on function public.combo_items_tenant_guard() from public, anon, authenticated;
