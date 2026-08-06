import type { Metadata } from "next";
import Link from "next/link";

import { formatMoney, money } from "@/core/money";
import { deleteCombo, toggleComboActive } from "@/lib/combos/actions";
import { loadCombosAdmin, loadMenuItemOptions } from "@/lib/combos/queries";

import { ComboForm } from "./combo-form";

export const metadata: Metadata = { title: "Kombolar" };

/**
 * Kombo/menü kampanyası yönetimi — "Büyük Menü = burger+patates+içecek tek
 * fiyat" gibi paket ürünler. Bir kombo AYRI bir satılabilir varlık değil,
 * yalnızca bir fiyatlandırma kısayolu: POS'ta seçilince mevcut menü
 * ürünlerine (kombonun fiyatına orantılı dağıtılmış fiyatlarla) dönüşür —
 * bkz. `addComboToOrder` (src/lib/orders/actions.ts). Bu sayede stok
 * düşümü, KDS, reçete maliyeti hiçbir şey bilmeden çalışmaya devam eder.
 */
export default async function KomboPage() {
  const [combos, menuItems] = await Promise.all([loadCombosAdmin(), loadMenuItemOptions()]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/recipes" className="text-sm text-ink-muted hover:text-ink">
        ← Reçeteler
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold tracking-tight text-ink">Kombolar</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Birden fazla ürünü tek bir kampanya fiyatına paketler. POS&apos;ta seçilince
        bileşenlere, kombonun fiyatına orantılı dağıtılmış birim fiyatlarla ayrılır.
      </p>

      <section className="rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Yeni kombo
        </h2>
        {menuItems.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Önce en az bir menü ürünü tanımlamalısın.
          </p>
        ) : (
          <ComboForm menuItems={menuItems} />
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Tanımlı kombolar ({combos.length})
        </h2>
        {combos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">Henüz kombo yok.</p>
        ) : (
          <ul className="divide-y divide-line">
            {combos.map((combo) => (
              <li key={combo.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${combo.isActive ? "text-ink" : "text-ink-muted line-through"}`}>
                      {combo.name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {combo.items.map((item) => `${item.quantity}× ${item.menuItemName}`).join(" + ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(money(combo.price))}
                  </span>
                </div>
                <div className="mt-2 flex gap-3">
                  <form action={toggleComboActive}>
                    <input type="hidden" name="id" value={combo.id} />
                    <input type="hidden" name="isActive" value={String(combo.isActive)} />
                    <button type="submit" className="text-xs font-medium text-ink-muted hover:text-ink">
                      {combo.isActive ? "Pasif et" : "Aktive et"}
                    </button>
                  </form>
                  <form action={deleteCombo}>
                    <input type="hidden" name="id" value={combo.id} />
                    <button type="submit" className="text-xs font-medium text-danger hover:underline">
                      Sil
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
