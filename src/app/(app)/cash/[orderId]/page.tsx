import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { allocate, formatMoney, isZero, money, toLira } from "@/core/money";
import { requireAppUser } from "@/lib/auth/current-user";
import { loadOrderForPayment } from "@/lib/cash/queries";
import { getServerDictionary } from "@/lib/i18n/server";
import { closeZeroOrder } from "@/lib/cash/actions";
import { loadCustomerForOrder } from "@/lib/loyalty/queries";

import { CouponBox } from "./coupon-box";
import { LoyaltyBox } from "./loyalty-box";
import { PaymentForm } from "./payment-form";

export const metadata: Metadata = { title: "Ödeme" };

const METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  meal_card: "Yemek kartı",
  on_account: "Açık hesap",
};

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  await requireAppUser();

  const [order, { dict }] = await Promise.all([loadOrderForPayment(orderId), getServerDictionary()]);
  if (!order) notFound();

  const customer = await loadCustomerForOrder(orderId);
  const isClosed = order.status !== "open";

  // Kalan bakiyeyi 2/3/4 kişiye böl ve ilk payı öner. money.allocate
  // kullanıldığı için toplam her zaman bakiyeye eşit — kuruş kaybolmaz.
  const splitSuggestions = isZero(order.remaining)
    ? []
    : [2, 3, 4].map((parts) => ({
        parts,
        shareLira: toLira(allocate(order.remaining, parts)[0]),
      }));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/cash" className="text-sm text-ink-muted hover:text-ink">
        {dict.cash.backToCash}
      </Link>

      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {order.tableName ? `Masa ${order.tableName}` : "Adisyon"}
          {order.orderNo ? ` · #${order.orderNo}` : ""}
        </h1>
        {isClosed ? (
          <span className="mt-1 inline-block rounded-full bg-ok/15 px-2.5 py-0.5 text-xs font-medium text-ok">
            Kapandı
          </span>
        ) : null}
      </div>

      <section className="rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          {dict.cash.products}
        </h2>
        <ul className="divide-y divide-line">
          {order.lines.map((line, index) => {
            const discount = line.discount;
            const isCompOrApproved = discount?.status === "approved";
            return (
              <li key={index} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink">
                    <span className="tabular-nums font-medium">{line.quantity}×</span>{" "}
                    {line.menuItemName}
                  </span>
                  <span className="tabular-nums text-ink-muted">
                    {formatMoney(money(line.total))}
                  </span>
                </div>
                {line.modifiers.length > 0 ? (
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {line.modifiers
                      .map(
                        (m) =>
                          `${m.name}${m.priceDelta !== 0 ? ` (${m.priceDelta > 0 ? "+" : ""}${m.priceDelta.toLocaleString("tr-TR")} ₺)` : ""}`,
                      )
                      .join(", ")}
                  </p>
                ) : null}
                {discount ? (
                  <p
                    className={`mt-0.5 text-xs font-medium ${
                      isCompOrApproved
                        ? "text-ok"
                        : discount.status === "pending"
                          ? "text-warn"
                          : "text-danger"
                    }`}
                  >
                    {discount.kind === "comp"
                      ? "İkram"
                      : discount.kind === "percent"
                        ? `%${discount.value} indirim`
                        : `${discount.value.toLocaleString("tr-TR")} ₺ indirim`}
                    {discount.status === "pending" ? " · onay bekliyor" : ""}
                    {discount.status === "rejected" ? " · reddedildi" : ""}
                    {" · "}
                    {discount.reason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="space-y-1 border-t border-line px-4 py-3">
          {order.coupon || order.pointsRedeemed ? (
            <div className="flex items-center justify-between text-sm text-ink-muted">
              <span>Ara toplam</span>
              <span className="tabular-nums">{formatMoney(order.subtotal)}</span>
            </div>
          ) : null}
          {order.coupon ? (
            <div className="flex items-center justify-between text-sm text-ok">
              <span>Kupon {order.coupon.code}</span>
              <span className="tabular-nums">−{formatMoney(order.coupon.discount)}</span>
            </div>
          ) : null}
          {order.pointsRedeemed ? (
            <div className="flex items-center justify-between text-sm text-ok">
              <span>{order.pointsRedeemed.points} puan</span>
              <span className="tabular-nums">−{formatMoney(order.pointsRedeemed.discount)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">Toplam</span>
            <span className="text-lg font-bold tabular-nums text-ink">
              {formatMoney(order.total)}
            </span>
          </div>
        </div>
      </section>

      {!isClosed ? (
        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface-raised p-4">
            <h2 className="mb-2 text-sm font-semibold text-ink">Kupon</h2>
            <CouponBox
              orderId={order.id}
              coupon={order.coupon ? { code: order.coupon.code, discount: toLira(order.coupon.discount) } : null}
            />
          </div>
          <div className="rounded-xl border border-line bg-surface-raised p-4">
            <h2 className="mb-2 text-sm font-semibold text-ink">Sadakat</h2>
            <LoyaltyBox
              orderId={order.id}
              customer={customer ? { phone: customer.phone, name: customer.name, pointsBalance: customer.pointsBalance } : null}
              alreadyRedeemed={order.pointsRedeemed !== null}
            />
          </div>
        </section>
      ) : null}

      {order.payments.length > 0 ? (
        <section className="mt-4 rounded-xl border border-line bg-surface-raised p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Alınan ödemeler</h2>
          <ul className="space-y-1.5">
            {order.payments.map((payment) => (
              <li key={payment.id} className="flex justify-between text-sm">
                <span className="text-ink-muted">
                  {METHOD_LABEL[payment.method] ?? payment.method}
                </span>
                <span className="tabular-nums text-ink">{formatMoney(payment.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isClosed ? (
        <p className="mt-4 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-center text-sm text-ok">
          {dict.cash.closed}
        </p>
      ) : isZero(order.total) ? (
        // İkram/iskonto/kupon/puan toplamı tam karşılamış — tahsil edilecek
        // bir tutar yok. Normal ödeme formu burada göstermiyoruz çünkü
        // "amount" alanı sıfırdan büyük olmak zorunda (bkz. `recordPayment`),
        // yani kasiyer hiçbir zaman gönderemezdi; adisyon süresiz açık kalırdı.
        <section className="mt-4 rounded-xl border border-line bg-surface-raised p-5 text-center">
          <p className="mb-3 text-sm text-ink-muted">
            Tahsil edilecek bir tutar yok — tamamı ikram/indirimle karşılandı.
          </p>
          <form action={closeZeroOrder}>
            <input type="hidden" name="orderId" value={order.id} />
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Adisyonu kapat (0 ₺)
            </button>
          </form>
        </section>
      ) : (
        <section className="mt-4 rounded-xl border border-line bg-surface-raised p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-ink-muted">{dict.cash.remaining}</span>
            <span className="text-xl font-bold tabular-nums text-ink">
              {formatMoney(order.remaining)}
            </span>
          </div>
          <PaymentForm
            orderId={order.id}
            remainingLira={toLira(order.remaining)}
            splitSuggestions={splitSuggestions}
            dict={dict.cash}
          />
        </section>
      )}
    </div>
  );
}
