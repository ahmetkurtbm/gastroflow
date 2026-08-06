import type { Metadata } from "next";
import Link from "next/link";

import { deleteCoupon, toggleCouponActive } from "@/lib/coupons/actions";
import { loadCouponsAdmin } from "@/lib/coupons/queries";

import { CouponForm } from "./coupon-form";

export const metadata: Metadata = { title: "Kuponlar" };

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" });

/**
 * Ayarlar → Kuponlar: indirim kodu tanımlama.
 *
 * Kodun ödeme ekranında NASIL uygulandığı burada değil — bkz.
 * `/cash/[orderId]` (`applyCouponToOrder`, src/lib/coupons/actions.ts).
 * Burası yalnızca "hangi kodlar var, kaçı kullanılmış" yönetimi.
 */
export default async function CouponsSettingsPage() {
  const coupons = await loadCouponsAdmin();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/settings" className="text-sm text-ink-muted hover:text-ink">
        ← Ayarlar
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold tracking-tight text-ink">Kuponlar</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Kasiyer ödeme ekranında bu kodlardan birini girip adisyona indirim uygulayabilir.
      </p>

      <section className="rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Yeni kupon</h2>
        <CouponForm />
      </section>

      {coupons.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
          Henüz kupon tanımlanmamış.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-xl border border-line bg-surface-raised">
          {coupons.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className={`text-sm font-medium ${c.isActive ? "text-ink" : "text-ink-muted line-through"}`}>
                  {c.code}
                </p>
                <p className="text-xs text-ink-muted">
                  {c.kind === "percent" ? `%${c.value} indirim` : `${c.value.toLocaleString("tr-TR")} ₺ indirim`}
                  {" · "}
                  {c.usedCount}
                  {c.maxUses !== null ? `/${c.maxUses}` : ""} kullanım
                  {c.validUntil ? ` · ${dateFormatter.format(new Date(c.validUntil))}'e kadar` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <form action={toggleCouponActive}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="isActive" value={String(c.isActive)} />
                  <button type="submit" className="text-xs text-ink-muted hover:text-ink hover:underline">
                    {c.isActive ? "Pasifleştir" : "Aktifleştir"}
                  </button>
                </form>
                <form action={deleteCoupon}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="text-xs text-danger hover:underline">
                    Sil
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
