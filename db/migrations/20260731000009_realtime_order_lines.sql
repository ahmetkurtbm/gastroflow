-- =============================================================================
-- 0009 · Mutfak ekranı için Realtime
-- =============================================================================
-- Realtime postgres_changes olayları da RLS'ten geçer (aynı authenticated
-- rolüyle değerlendirilir). Yani bu tabloyu yayına eklemek başka bir
-- işletmenin verisini sızdırmaz — biri zaten SELECT ile göremediği bir
-- satırın değişikliğini de göremez.
-- =============================================================================

alter publication supabase_realtime add table public.order_lines;
