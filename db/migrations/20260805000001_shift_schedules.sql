-- =============================================================================
-- 0018 · Personel vardiya planlama
-- =============================================================================
-- `cash_sessions` (migration 0006) "kasa vardiyası" — kasiyerin parayı açtığı/
-- kapattığı, para hareketiyle ilgili bir kayıt. Bu tablo TAMAMEN farklı bir
-- şey: "kim ne zaman çalışacak" planı, para hareketiyle hiç ilgisi yok,
-- vardiya BAŞLAMADAN GÜNLER ÖNCE oluşturulabilir. İkisini karıştırmamak için
-- bilerek ayrı tablo — `cash_sessions`'a bir "planlanan" durumu eklemek,
-- "gerçekleşen kasa hareketi" ile "gelecekteki plan" kavramlarını
-- birbirine karıştırırdı.
-- =============================================================================

create table public.shift_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (note is null or length(note) <= 200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint shift_schedules_ends_after_starts check (ends_at > starts_at)
);
create index shift_schedules_branch_time_idx
  on public.shift_schedules (tenant_id, branch_id, starts_at);
create index shift_schedules_user_time_idx
  on public.shift_schedules (tenant_id, user_id, starts_at);

create trigger shift_schedules_set_updated_at
  before update on public.shift_schedules
  for each row execute function public.set_updated_at();

alter table public.shift_schedules enable row level security;
alter table public.shift_schedules force row level security;

-- SELECT manager-gated değil: ekip "bu hafta ne zaman çalışıyorum"u kendi
-- görebilmeli — bu bir maliyet/gizlilik alanı değil, sade bir çizelge.
create policy shift_schedules_select on public.shift_schedules
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy shift_schedules_insert on public.shift_schedules
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy shift_schedules_update on public.shift_schedules
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager())
  with check (tenant_id = public.current_tenant_id() and public.is_manager());
create policy shift_schedules_delete on public.shift_schedules
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_manager());

grant select, insert, update, delete on public.shift_schedules to authenticated;
