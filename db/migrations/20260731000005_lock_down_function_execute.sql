-- =============================================================================
-- 0005 · Fonksiyon çalıştırma yetkilerini kapat
-- =============================================================================
-- Bu migration bir hatayı düzeltiyor; kayda değer, çünkü kolay gözden kaçan
-- bir davranış:
--
--   Postgres, yeni oluşturulan bir fonksiyona varsayılan olarak PUBLIC rolüne
--   EXECUTE verir. PUBLIC herkesi kapsar — anon dâhil.
--
-- 0001'de `alter default privileges ... revoke all on functions from anon,
-- authenticated` yazmıştık; ama bu PUBLIC'e verilen hakkı iptal etmiyor.
-- Sonuç: `audit_trigger()` ve `handle_new_user()` gibi SECURITY DEFINER
-- fonksiyonlar PostgREST üzerinden /rest/v1/rpc/... olarak dışarıya açık kaldı.
-- Supabase'in güvenlik denetçisi (get_advisors) bunu yakaladı.
--
-- Not: trigger fonksiyonlarında EXECUTE yetkisi, trigger tetiklenirken kontrol
-- edilmez. Dolayısıyla iptal etmek trigger'ları bozmaz — testlerle doğrulandı.
-- =============================================================================

-- --- Trigger fonksiyonları: hiç kimse doğrudan çağıramaz ---------------------
revoke execute on function public.audit_trigger()                    from public, anon, authenticated;
revoke execute on function public.handle_new_user()                  from public, anon, authenticated;
revoke execute on function public.set_updated_at()                   from public, anon, authenticated;
revoke execute on function public.memberships_branch_tenant_guard()  from public, anon, authenticated;
revoke execute on function public.audit_log_is_append_only()         from public, anon, authenticated;

-- --- Auth hook: yalnızca Auth servisi ----------------------------------------
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

-- --- RLS yardımcıları -------------------------------------------------------
-- Politika ifadeleri çağıran kullanıcının haklarıyla değerlendirilir, bu yüzden
-- authenticated'in EXECUTE yetkisi ŞART. Olmazsa her sorgu
-- "permission denied for function current_tenant_id" ile patlar.
-- Dışarı açık olmaları zararsız: kullanıcıya yalnızca kendi claim'ini döndürürler.
revoke execute on function public.current_tenant_id()  from public, anon;
revoke execute on function public.current_branch_id()  from public, anon;
revoke execute on function public.current_app_role()   from public, anon;
revoke execute on function public.is_manager()         from public, anon;
revoke execute on function public.is_owner()           from public, anon;

grant execute on function public.current_tenant_id()  to authenticated;
grant execute on function public.current_branch_id()  to authenticated;
grant execute on function public.current_app_role()   to authenticated;
grant execute on function public.is_manager()         to authenticated;
grant execute on function public.is_owner()           to authenticated;
