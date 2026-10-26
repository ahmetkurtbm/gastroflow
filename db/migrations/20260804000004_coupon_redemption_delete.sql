-- =============================================================================
-- 0017 · Kupon uygulamasını geri alma
-- =============================================================================
-- `coupon_redemptions` migration 0015'te bilerek append-only (yalnızca
-- SELECT/INSERT) bırakılmıştı — ama ödeme tamamlanmadan ÖNCE kasiyerin
-- yanlış girdiği bir kodu geri alabilmesi gerekiyor (bkz.
-- `removeCouponFromOrder`, src/lib/coupons/actions.ts). DELETE'i yalnızca bu
-- dar amaç için açıyoruz; adisyon zaten kapandıysa aksiyon kendi içinde
-- reddediyor (RLS bunu bilmiyor, adisyon durumunu göremiyor).
-- =============================================================================

create policy coupon_redemptions_delete on public.coupon_redemptions
  for delete to authenticated
  using (tenant_id = public.current_tenant_id());

grant delete on public.coupon_redemptions to authenticated;
