import { createClient } from "@/lib/supabase/server";

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export type CouponAdmin = {
  id: string;
  code: string;
  kind: "percent" | "amount";
  value: number;
  isActive: boolean;
  maxUses: number | null;
  usedCount: number;
  validUntil: string | null;
};

/** Ayarlar → Kuponlar ekranı için: tüm kuponlar + kaç kez kullanıldığı. */
export async function loadCouponsAdmin(): Promise<CouponAdmin[]> {
  const supabase = await createClient();

  const [couponsResult, redemptionsResult] = await Promise.all([
    supabase
      .from("coupons")
      .select("id, code, kind, value, is_active, max_uses, valid_until")
      .order("created_at", { ascending: false }),
    supabase.from("coupon_redemptions").select("coupon_id"),
  ]);

  const usedCountByCoupon = new Map<string, number>();
  for (const row of redemptionsResult.data ?? []) {
    usedCountByCoupon.set(row.coupon_id, (usedCountByCoupon.get(row.coupon_id) ?? 0) + 1);
  }

  return (couponsResult.data ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    kind: c.kind as "percent" | "amount",
    value: toNumber(c.value),
    isActive: c.is_active,
    maxUses: c.max_uses,
    usedCount: usedCountByCoupon.get(c.id) ?? 0,
    validUntil: c.valid_until,
  }));
}
