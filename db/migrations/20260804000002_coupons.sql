-- =============================================================================
-- 0015 · Kupon / kampanya indirim kodu
-- =============================================================================
-- Bileşen düzeyinde ikram/iskonto (`line_discounts`, migration 0011) zaten
-- vardı ama o ONAY GEREKTİREN, personel-başlatan bir akış. Kupon kodu farklı
-- bir şey: müşterinin getirdiği/söylediği bir kodu kasiyer ödeme ekranında
-- giriyor, onay beklemiyor — kodun kendisi zaten "yetki".
--
-- `coupons.used_count` gibi mutlanabilir bir sayaç YOK — stok defterindeki
-- (`stock_movements`) append-only ledger deseni burada da geçerli:
-- `coupon_redemptions`'a INSERT edilen her satır bir kullanım, limit kontrolü
-- bu tabloyu SAYARAK yapılıyor. Bunun iki faydası var: (1) `coupons` tablosu
-- yalnızca müdür/patron tarafından YAZILABİLİR kalıyor (`coupons_update`
-- manager-gated) — kasiyerin kupon değerini/limitini değiştirebilmesi
-- gerekmiyor; (2) "hangi adisyon hangi kuponu kaç TL indirimle kullandı"
-- sorusu her zaman tek bir satırdan cevaplanabiliyor (denetlenebilirlik).
--
-- `unique (order_id)`: bir adisyona en fazla BİR kupon uygulanabilir —
-- kuponların üst üste binmesi (iki kod + ikram + iskonto aynı anda)
-- fiyatlandırmayı tahmin edilemez kılardı.
-- =============================================================================

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null check (length(btrim(code)) between 2 and 30),
  kind text not null check (kind in ('percent', 'amount')),
  value numeric(14, 4) not null check (value > 0),
  is_active boolean not null default true,
  max_uses int check (max_uses is null or max_uses > 0),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create index coupons_tenant_idx on public.coupons (tenant_id);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  discount_amount numeric(14, 4) not null check (discount_amount >= 0),
  redeemed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (order_id)
);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (tenant_id, coupon_id);

create trigger coupons_set_updated_at
  before update on public.coupons
  for each row execute function public.set_updated_at();

alter table public.coupons enable row level security;
alter table public.coupons force row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.coupon_redemptions force row level security;

create policy coupons_select on public.coupons
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy coupons_insert on public.coupons
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy coupons_update on public.coupons
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy coupons_delete on public.coupons
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager());

create policy coupon_redemptions_select on public.coupon_redemptions
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
-- Herhangi bir tenant üyesi (kasiyer/garson) ödeme ekranında kupon
-- uygulayabilmeli — bu yüzden insert manager-gated DEĞİL. Yazma yüzeyi zaten
-- dar: yalnızca INSERT var, UPDATE/DELETE grant edilmiyor (append-only).
create policy coupon_redemptions_insert on public.coupon_redemptions
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.coupons             to authenticated;
grant select, insert                 on public.coupon_redemptions  to authenticated;
