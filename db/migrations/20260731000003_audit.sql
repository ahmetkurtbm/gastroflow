-- =============================================================================
-- 0003 · Denetim kaydı (audit log)
-- =============================================================================
-- Tasarım kararı: log'u uygulama DEĞİL, veritabanı yazar.
--
-- Uygulama yazsaydı, bir Server Action'da `await writeAuditLog(...)` satırını
-- yazmayı unutmak sessizce izsiz bir işlem bırakırdı. Trigger ile bu imkânsız:
-- satır değiştiyse kayıt düşer, kim hangi yoldan değiştirmiş olursa olsun.
-- =============================================================================

create table public.audit_log (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null,
  actor_id     uuid,                    -- auth.uid(); sistem/cron işlerinde NULL
  actor_role   public.app_role,
  action       text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name   text not null,
  record_id    text,
  before       jsonb,
  after        jsonb,
  occurred_at  timestamptz not null default now()
);

comment on table public.audit_log is
  'Değişiklik geçmişi. Yalnızca INSERT edilir; UPDATE/DELETE veritabanı seviyesinde engellidir.';

create index audit_log_tenant_time_idx on public.audit_log (tenant_id, occurred_at desc);
create index audit_log_table_record_idx on public.audit_log (tenant_id, table_name, record_id);
create index audit_log_actor_idx on public.audit_log (tenant_id, actor_id, occurred_at desc);

-- -----------------------------------------------------------------------------
-- Genel amaçlı denetim trigger'ı
-- -----------------------------------------------------------------------------
-- Kullanımı (her hassas tablo için):
--   create trigger <tablo>_audit
--     after insert or update or delete on public.<tablo>
--     for each row execute function public.audit_trigger();
--
-- security definer: audit_log'a INSERT yetkisi hiçbir kullanıcı rolünde yok;
-- yazabilen tek şey bu fonksiyon.
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec_before jsonb;
  rec_after  jsonb;
  rec_tenant uuid;
  rec_id     text;
begin
  if tg_op = 'DELETE' then
    rec_before := to_jsonb(old);
    rec_after  := null;
  elsif tg_op = 'INSERT' then
    rec_before := null;
    rec_after  := to_jsonb(new);
  else
    rec_before := to_jsonb(old);
    rec_after  := to_jsonb(new);

    -- Hiçbir alan değişmediyse kayıt açma. Aksi hâlde her "kaydet" tuşu,
    -- içerik aynı olsa bile log'u şişirir.
    if rec_before = rec_after then
      return new;
    end if;
  end if;

  rec_tenant := coalesce(rec_after ->> 'tenant_id', rec_before ->> 'tenant_id')::uuid;
  rec_id     := coalesce(rec_after ->> 'id', rec_before ->> 'id');

  -- tenant_id'si olmayan bir tabloya bu trigger takılmışsa bu bir programlama
  -- hatasıdır; sessizce loglamamak yerine yüksek sesle patlasın.
  if rec_tenant is null then
    raise exception
      'audit_trigger: %.% tablosunda tenant_id bulunamadı; bu trigger yalnızca tenant_id taşıyan tablolarda kullanılır',
      tg_table_schema, tg_table_name
      using errcode = 'raise_exception';
  end if;

  insert into public.audit_log (
    tenant_id, actor_id, actor_role, action, table_name, record_id, before, after
  )
  values (
    rec_tenant,
    auth.uid(),
    public.current_app_role(),
    tg_op,
    tg_table_name,
    rec_id,
    rec_before,
    rec_after
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Hassas tablolara bağla. Sonraki fazlarda eklenen her hassas tablo (fiyatlar,
-- stok hareketleri, ödemeler, iskontolar) buraya eklenecek.
create trigger branches_audit
  after insert or update or delete on public.branches
  for each row execute function public.audit_trigger();

create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function public.audit_trigger();

-- =============================================================================
-- Değiştirilemezlik
-- =============================================================================
-- Yetki iptali tek başına yeterli değil: bir gün bir migration yanlışlıkla
-- UPDATE hakkı verirse log sessizce değiştirilebilir hâle gelir. Trigger bunu
-- yetkiden bağımsız olarak engeller.
create or replace function public.audit_log_is_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'audit_log değiştirilemez: % işlemi reddedildi', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

-- Yalnızca patron, yalnızca kendi işletmesinin kaydını okur.
-- INSERT/UPDATE/DELETE politikası bilerek yazılmadı: politika yoksa işlem yok.
create policy audit_log_select_owner on public.audit_log
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner());

-- Sadece SELECT. Yazma hakkı kimseye verilmiyor; tek yazan audit_trigger().
grant select on public.audit_log to authenticated;
