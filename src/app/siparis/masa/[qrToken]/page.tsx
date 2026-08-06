import type { Metadata } from "next";

import { loadQrMenu } from "@/lib/qr-order/queries";

import { QrOrderScreen } from "./qr-order-screen";

export const metadata: Metadata = { title: "Sipariş Ver" };

/**
 * Masaya yapıştırılan QR kodun açtığı sayfa — GİRİŞ GEREKTİRMEZ.
 *
 * `(app)` rota grubunun dışında olduğu için `requireAppUser()` zinciriyle
 * hiç kesişmiyor (bkz. `src/app/(app)/layout.tsx`). Güvenlik sınırı token'ın
 * kendisi — bkz. `loadQrMenu` ve `placeQrOrder` doc-comment'leri.
 */
export default async function QrOrderPage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  const menu = await loadQrMenu(qrToken);

  if (!menu) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-xl border border-line bg-surface-raised p-6 text-center">
          <h1 className="text-lg font-semibold text-ink">Bu QR kod artık geçerli değil</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Lütfen personelden yardım isteyin.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <QrOrderScreen
        qrToken={qrToken}
        tableName={menu.table.name}
        categories={menu.categories}
        combos={menu.combos}
      />
    </main>
  );
}
