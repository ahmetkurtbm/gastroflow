"use client";

import { useActionState } from "react";

import { attachCustomerToOrder, redeemPointsForOrder, type ActionState } from "@/lib/loyalty/actions";

const initial: ActionState = {};

export function LoyaltyBox({
  orderId,
  customer,
  alreadyRedeemed,
}: {
  orderId: string;
  customer: { phone: string; name: string | null; pointsBalance: number } | null;
  /** Bu adisyonda zaten puan kullanılmışsa (bkz. `redeemPointsForOrder`'daki
   * "bir adisyona bir kez" kısıtı) ikinci bir kullanım formu göstermenin
   * anlamı yok — kullanıcı zaten reddedilecek bir isteği tekrar denerdi. */
  alreadyRedeemed: boolean;
}) {
  const [attachState, attachAction] = useActionState(attachCustomerToOrder, initial);
  const [redeemState, redeemAction] = useActionState(redeemPointsForOrder, initial);

  if (!customer) {
    return (
      <form action={attachAction} className="space-y-1.5">
        <input type="hidden" name="orderId" value={orderId} />
        <div className="flex gap-2">
          <input
            type="tel"
            name="phone"
            placeholder="Telefon (sadakat)"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60"
          />
          <input
            type="text"
            name="name"
            placeholder="Ad (opsiyonel)"
            maxLength={80}
            className="w-32 shrink-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
          >
            Bağla
          </button>
        </div>
        {attachState.error ? (
          <p role="alert" className="text-xs text-danger">
            {attachState.error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-ink">
        {customer.name ?? customer.phone} ·{" "}
        <span className="font-semibold tabular-nums">{customer.pointsBalance} puan</span>
      </p>
      {alreadyRedeemed ? (
        <p className="text-xs text-ink-muted">Bu adisyonda puan kullanıldı.</p>
      ) : customer.pointsBalance > 0 ? (
        <form action={redeemAction} className="flex items-center gap-2">
          <input type="hidden" name="orderId" value={orderId} />
          <input
            type="number"
            name="points"
            min={1}
            max={customer.pointsBalance}
            step={1}
            placeholder="Puan"
            className="w-24 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
          >
            Puan kullan
          </button>
        </form>
      ) : null}
      {redeemState.error ? (
        <p role="alert" className="text-xs text-danger">
          {redeemState.error}
        </p>
      ) : null}
    </div>
  );
}
