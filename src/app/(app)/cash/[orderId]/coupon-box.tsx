"use client";

import { useActionState } from "react";

import { formatMoney, money } from "@/core/money";
import { applyCouponToOrder, removeCouponFromOrder, type ActionState } from "@/lib/coupons/actions";

const initial: ActionState = {};

export function CouponBox({
  orderId,
  coupon,
}: {
  orderId: string;
  coupon: { code: string; discount: number } | null;
}) {
  const [state, action] = useActionState(applyCouponToOrder, initial);

  if (coupon) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm">
        <span className="text-ink">
          Kupon <span className="font-semibold">{coupon.code}</span> ·{" "}
          {formatMoney(money(coupon.discount))} indirim
        </span>
        <form action={removeCouponFromOrder}>
          <input type="hidden" name="orderId" value={orderId} />
          <button type="submit" className="text-xs text-danger hover:underline">
            Kaldır
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-1.5">
      <div className="flex gap-2">
        <input type="hidden" name="orderId" value={orderId} />
        <input
          type="text"
          name="code"
          placeholder="Kupon kodu"
          maxLength={30}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
        >
          Uygula
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
