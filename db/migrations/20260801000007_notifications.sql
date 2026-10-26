-- =============================================================================
-- 0015 · Bildirim & mail motoru (outbox deseni)
-- =============================================================================
-- Plan §7: "Uygulama mail göndermez; notification_outbox'a satır yazar.
-- Edge Function kuyruğu işler, notification_log'a yazar."
--
-- Bu migration'da GERÇEK mail göndermiyoruz (Resend entegrasyonu kapsam
-- dışı — kullanıcı bilinçli olarak mock istedi). `notification_log`,
-- "gönderilseydi ne olurdu" kaydını tutuyor; ileride gerçek gönderim
-- eklenince yalnızca Edge Function'ın içi değişir, şema/tetikleyiciler
-- aynı kalır.
--
-- audit_log ile AYNI güvenlik deseni: outbox/log'a hiçbir kullanıcı rolü
-- doğrudan INSERT yapamaz — yalnızca SECURITY DEFINER tetikleyiciler
-- (uygulama kodu bir satır eklemeyi UNUTAMAZ, çünkü hiç yazmıyor zaten;
-- olay veritabanı seviyesinde kendiliğinden doğuyor).
-- =============================================================================

create type public.notification_event_type as enum (
  'low_stock',          -- kritik stok
  'negative_stock',     -- negatif stok (anormallik)
  'approval_pending',   -- ikram/iskonto ya da satın alma onay bekliyor
  'po_approved',        -- satın alma siparişi onaylandı
  'cash_shortage',      -- kasa sayım farkı eşiği aştı
  'day_end_summary',    -- vardiya kapanış özeti
  'weekly_cost_report'  -- haftalık maliyet raporu (pg_cron, pazartesi)
);

create type public.notification_status as enum ('pending', 'sent', 'failed');

-- -----------------------------------------------------------------------------
-- notification_rules — hangi olay, hangi rollere gitsin
-- -----------------------------------------------------------------------------
create table public.notification_rules (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  event_type      public.notification_event_type not null,
  is_enabled      boolean not null default true,
  recipient_roles public.app_role[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, event_type)
);

create trigger notification_rules_set_updated_at
  before update on public.notification_rules
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- notification_outbox — "gönderilmesi gereken olay" kuyruğu
-- -----------------------------------------------------------------------------
create table public.notification_outbox (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  event_type   public.notification_event_type not null,
  payload      jsonb not null default '{}'::jsonb,
  status       public.notification_status not null default 'pending',
  attempts     smallint not null default 0,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index notification_outbox_pending_idx
  on public.notification_outbox (tenant_id, created_at) where status = 'pending';
-- Aynı (tenant, olay tipi, dedup anahtarı) 24 saat içinde tekrar kuyruğa
-- girmesin — her satışta kritik stok uyarısı tekrar tekrar düşmesin diye.
create index notification_outbox_dedup_idx
  on public.notification_outbox (tenant_id, event_type, (payload ->> 'dedupKey'), created_at);

-- -----------------------------------------------------------------------------
-- notification_log — kime, ne zaman, ne gönderildi (ya da gönderilemedi)
-- -----------------------------------------------------------------------------
create table public.notification_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  outbox_id       uuid references public.notification_outbox(id) on delete set null,
  event_type      public.notification_event_type not null,
  recipient_email text not null,
  recipient_role  public.app_role,
  subject         text not null,
  body            text not null,
  status          public.notification_status not null,
  error           text,
  sent_at         timestamptz not null default now()
);
create index notification_log_tenant_idx on public.notification_log (tenant_id, sent_at desc);

-- -----------------------------------------------------------------------------
-- Ortak yardımcı: kuyruğa ekle (dedup'lı)
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_tenant_id uuid,
  p_event_type public.notification_event_type,
  p_payload jsonb,
  p_dedup_key text default null,
  p_dedup_window interval default interval '24 hours'
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_dedup_key is not null then
    if exists (
      select 1 from public.notification_outbox o
      where o.tenant_id = p_tenant_id
        and o.event_type = p_event_type
        and o.payload ->> 'dedupKey' = p_dedup_key
        and o.created_at > now() - p_dedup_window
    ) then
      return;
    end if;
  end if;

  insert into public.notification_outbox (tenant_id, event_type, payload)
  values (p_tenant_id, p_event_type, p_payload);
end;
$$;

-- -----------------------------------------------------------------------------
-- Tetikleyici: stok hareketi sonrası kritik/negatif stok
-- -----------------------------------------------------------------------------
create or replace function public.notify_stock_thresholds()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_balance numeric;
  v_reorder numeric;
  v_dedup text;
begin
  select coalesce(sum(quantity), 0) into v_balance
  from public.stock_movements
  where tenant_id = new.tenant_id
    and location_id = new.location_id
    and inventory_item_id = new.inventory_item_id;

  v_dedup := new.location_id::text || ':' || new.inventory_item_id::text;

  if v_balance < 0 then
    perform public.enqueue_notification(
      new.tenant_id, 'negative_stock',
      jsonb_build_object(
        'dedupKey', v_dedup,
        'locationId', new.location_id,
        'itemId', new.inventory_item_id,
        'balance', v_balance
      ),
      v_dedup
    );
    return new;
  end if;

  select reorder_point into v_reorder
  from public.par_levels
  where location_id = new.location_id and inventory_item_id = new.inventory_item_id;

  if v_reorder is not null and v_balance <= v_reorder then
    perform public.enqueue_notification(
      new.tenant_id, 'low_stock',
      jsonb_build_object(
        'dedupKey', v_dedup,
        'locationId', new.location_id,
        'itemId', new.inventory_item_id,
        'balance', v_balance,
        'reorderPoint', v_reorder
      ),
      v_dedup
    );
  end if;

  return new;
end;
$$;
create trigger stock_movements_notify_thresholds
  after insert on public.stock_movements
  for each row execute function public.notify_stock_thresholds();

-- -----------------------------------------------------------------------------
-- Tetikleyici: ikram/iskonto onay bekliyor
-- -----------------------------------------------------------------------------
create or replace function public.notify_line_discount_pending()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'pending' then
    perform public.enqueue_notification(
      new.tenant_id, 'approval_pending',
      jsonb_build_object('kind', 'line_discount', 'id', new.id, 'orderLineId', new.order_line_id)
    );
  end if;
  return new;
end;
$$;
create trigger line_discounts_notify_pending
  after insert on public.line_discounts
  for each row execute function public.notify_line_discount_pending();

-- -----------------------------------------------------------------------------
-- Tetikleyici: satın alma siparişi onay bekliyor / onaylandı
-- -----------------------------------------------------------------------------
create or replace function public.notify_purchase_order_events()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' and new.status = 'pending_approval' then
    perform public.enqueue_notification(
      new.tenant_id, 'approval_pending',
      jsonb_build_object('kind', 'purchase_order', 'id', new.id, 'supplierId', new.supplier_id)
    );
  elsif TG_OP = 'UPDATE' and new.status = 'approved' and old.status = 'pending_approval' then
    perform public.enqueue_notification(
      new.tenant_id, 'po_approved',
      jsonb_build_object('id', new.id, 'supplierId', new.supplier_id)
    );
  end if;
  return new;
end;
$$;
create trigger purchase_orders_notify_events
  after insert or update on public.purchase_orders
  for each row execute function public.notify_purchase_order_events();

-- -----------------------------------------------------------------------------
-- Tetikleyici: kasa oturumu kapandı → gün sonu özeti + (eşik aşılırsa) açık uyarısı
-- -----------------------------------------------------------------------------
create or replace function public.notify_cash_session_closed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_cash_paid numeric;
  v_expected  numeric;
  v_diff      numeric;
begin
  if new.status = 'closed' and old.status = 'open' then
    perform public.enqueue_notification(
      new.tenant_id, 'day_end_summary',
      jsonb_build_object('sessionId', new.id)
    );

    select coalesce(sum(amount), 0) into v_cash_paid
    from public.payments
    where cash_session_id = new.id and method = 'cash';

    v_expected := new.opening_float + v_cash_paid;
    v_diff := coalesce(new.counted_cash, 0) - v_expected;

    -- Eşik: 20 TL ya da beklenenin %2'si, hangisi büyükse — küçük bozukluk
    -- farkları için gereksiz alarm çalmasın.
    if abs(v_diff) > greatest(20, v_expected * 0.02) then
      perform public.enqueue_notification(
        new.tenant_id, 'cash_shortage',
        jsonb_build_object('sessionId', new.id, 'expected', v_expected, 'counted', new.counted_cash, 'diff', v_diff)
      );
    end if;
  end if;
  return new;
end;
$$;
create trigger cash_sessions_notify_closed
  after update on public.cash_sessions
  for each row execute function public.notify_cash_session_closed();

-- -----------------------------------------------------------------------------
-- Haftalık maliyet raporu — pg_cron, her tenant için bir olay
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;

create or replace function public.enqueue_weekly_cost_reports()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant record;
begin
  for v_tenant in select id from public.tenants where is_active loop
    perform public.enqueue_notification(v_tenant.id, 'weekly_cost_report', '{}'::jsonb);
  end loop;
end;
$$;

-- 05:00 UTC pazartesi ≈ 08:00 Europe/Istanbul (yaz saati; pg_cron UTC
-- çalışır, kışın 1 saat kayar — bu ölçekte gözden kaçırılabilir bir fark).
select cron.schedule(
  'weekly-cost-report',
  '0 5 * * 1',
  $$select public.enqueue_weekly_cost_reports()$$
);

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.notification_rules  enable row level security;
alter table public.notification_rules  force row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_outbox force row level security;
alter table public.notification_log    enable row level security;
alter table public.notification_log    force row level security;

-- Kurallar: patron görür ve düzenler (Ayarlar ekranı patron-only, bkz. access.ts).
create policy notification_rules_select on public.notification_rules
  for select to authenticated using (tenant_id = public.current_tenant_id() and public.is_owner());
create policy notification_rules_write on public.notification_rules
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner())
  with check (tenant_id = public.current_tenant_id() and public.is_owner());

-- Outbox/log: yalnızca SELECT, yalnızca patron/müdür — audit_log ile aynı
-- desen (bkz. migration 0003). Yazma hiçbir role verilmiyor; tek yazan
-- SECURITY DEFINER fonksiyonlar (enqueue_notification) ve Edge Function
-- (service_role, RLS'i zaten atlar).
create policy notification_outbox_select on public.notification_outbox
  for select to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());
create policy notification_log_select on public.notification_log
  for select to authenticated using (tenant_id = public.current_tenant_id() and public.is_manager());

grant select, insert, update, delete on public.notification_rules to authenticated;
grant select on public.notification_outbox to authenticated;
grant select on public.notification_log    to authenticated;

revoke execute on function public.enqueue_notification(uuid, public.notification_event_type, jsonb, text, interval) from public, anon, authenticated;
revoke execute on function public.notify_stock_thresholds()         from public, anon, authenticated;
revoke execute on function public.notify_line_discount_pending()    from public, anon, authenticated;
revoke execute on function public.notify_purchase_order_events()    from public, anon, authenticated;
revoke execute on function public.notify_cash_session_closed()      from public, anon, authenticated;
revoke execute on function public.enqueue_weekly_cost_reports()     from public, anon, authenticated;
