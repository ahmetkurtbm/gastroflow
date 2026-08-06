import type { Metadata } from "next";
import Link from "next/link";

import { formatMoney, money } from "@/core/money";
import { requireAppUser } from "@/lib/auth/current-user";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getServerDictionary } from "@/lib/i18n/server";
import { loadFloorPlan, loadOpenChannelOrders } from "@/lib/orders/queries";
import { openChannelOrder, openTable } from "@/lib/orders/actions";

export const metadata: Metadata = { title: "Sipariş Al" };

const CHANNEL_LABEL = { takeaway: "Gel Al", self_service: "Self Servis" } as const;

/** "12:47" değil "18 dk" — garson saat değil geçen süreyle ilgilenir. */
function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

/**
 * Yerleşim canvas'ında masanın kutusu kişi sayısına göre büyür — 2 kişilik
 * bir masayla 10 kişilik bir masa gerçek salonda aynı yer kaplamıyor,
 * canvas'ta da aynı görünmemeli (bkz. `/settings/salon`'daki aynı ölçek).
 */
function seatBoxWidth(seats: number): string {
  if (seats <= 2) return "5rem";
  if (seats <= 4) return "6.5rem";
  if (seats <= 8) return "8rem";
  return "9.5rem";
}

export default async function PosFloorPlanPage() {
  await requireAppUser();
  const [areas, channelOrders, { dict }] = await Promise.all([
    loadFloorPlan(),
    loadOpenChannelOrders(),
    getServerDictionary(),
  ]);

  const hasAnyTable = areas.some((a) => a.tables.length > 0);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-ink">
        {dict.pos.floorTitle}
      </h1>

      {/* Masasız sipariş: Gel Al / Self Servis — her tıklama yeni bir
          sipariş açar (masalardaki "tek açık adisyon" kısıtı burada yok,
          bkz. openChannelOrder). */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(CHANNEL_LABEL) as (keyof typeof CHANNEL_LABEL)[]).map((channel) => (
          <form key={channel} action={openChannelOrder}>
            <input type="hidden" name="channel" value={channel} />
            <button
              type="submit"
              className="rounded-lg border border-dashed border-brand-400 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50/50"
            >
              + {CHANNEL_LABEL[channel]}
            </button>
          </form>
        ))}
      </div>

      {channelOrders.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-ink-muted">Açık paket siparişler</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {channelOrders.map((order) => {
              const minutes = minutesSince(order.openedAt);
              return (
                <div key={order.id} className="relative">
                  {order.total === 0 ? <ZeroTotalBadge /> : null}
                  <Link
                    href={`/pos/siparis/${order.id}`}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                      minutes >= 60
                        ? "border-warn/50 bg-warn/10"
                        : "border-brand-300 bg-brand-50/50 hover:bg-brand-50"
                    }`}
                  >
                    <span className="text-sm font-bold text-ink">{CHANNEL_LABEL[order.channel]}</span>
                    <span className="text-xs text-ink-muted">
                      {order.orderNo ? `#${order.orderNo} · ` : ""}
                      {minutes} dk
                    </span>
                    <span className="mt-2 text-sm font-semibold tabular-nums text-ink">
                      {formatMoney(money(order.total))}
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {!hasAnyTable ? (
        <p className="rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
          {dict.pos.noTables}
        </p>
      ) : (
        <div className="space-y-8">
          {areas
            .filter((area) => area.tables.length > 0)
            .map((area) => {
              // Bir alandaki masaların TAMAMI yerleştirilmişse (bkz.
              // /settings/salon görsel editörü), garson gerçek salon
              // yerleşimini görsün — ızgara yerine konumlarına göre canvas.
              // Kısmi yerleşimde ızgaraya düşülür: yarım-yamalak bir canvas
              // (bazı masalar üst üste sol üstte yığılmış) ızgaradan kötü
              // olurdu.
              const allPlaced = area.tables.every((t) => t.posX !== null && t.posY !== null);

              return (
                <section key={area.id}>
                  <h2 className="mb-3 text-sm font-semibold text-ink-muted">
                    {area.name}
                  </h2>
                  {allPlaced ? (
                    <div className="relative h-80 w-full rounded-xl border border-line bg-surface-raised">
                      {area.tables.map((table) => (
                        <div
                          key={table.id}
                          style={{
                            left: `${table.posX}%`,
                            top: `${table.posY}%`,
                            width: seatBoxWidth(table.seats),
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2"
                        >
                          <TableCard table={table} dict={dict.pos} compact />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {area.tables.map((table) => (
                        <TableCard key={table.id} table={table} dict={dict.pos} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
        </div>
      )}
    </div>
  );
}

/**
 * "Bu adisyonda tahsil edilecek bir şey kalmadı, kapatılmayı bekliyor"
 * işareti — tıklanabilir DEĞİL, salt görsel bir uyarı (kapatma işlemi
 * `/cash/[orderId]`'de, `closeZeroOrder`).
 */
function ZeroTotalBadge() {
  return (
    <span
      aria-hidden
      title="0 ₺ — kapatılmayı bekliyor"
      className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-danger/40 bg-surface text-xs font-bold text-danger"
    >
      ✕
    </span>
  );
}

function TableCard({
  table,
  dict,
  compact = false,
}: {
  table: Awaited<ReturnType<typeof loadFloorPlan>>[number]["tables"][number];
  dict: Dictionary["pos"];
  /** Canvas (görsel yerleşim) içinde küçük kart — bkz. yukarısı "allPlaced". */
  compact?: boolean;
}) {
  const { openOrder } = table;
  const padding = compact ? "p-2.5" : "p-4";

  if (!openOrder) {
    return (
      <form action={openTable}>
        <input type="hidden" name="tableId" value={table.id} />
        <button
          type="submit"
          className={`flex w-full flex-col items-start gap-1 rounded-xl border border-line bg-surface-raised text-left transition-colors hover:border-brand-400 hover:bg-brand-50/30 ${padding}`}
        >
          <span className={compact ? "text-sm font-bold text-ink" : "text-lg font-bold text-ink"}>
            {table.name}
          </span>
          {!compact ? (
            <span className="text-xs text-ink-muted">
              {table.seats} {dict.seats}
            </span>
          ) : null}
          <span className="mt-1 text-xs font-medium text-ok">{dict.empty}</span>
        </button>
      </form>
    );
  }

  const minutes = minutesSince(openOrder.openedAt);
  // Uzun süredir açık masa görsel olarak öne çıksın — garson unutup unutmadığını
  // sorgulamadan bir bakışta görsün.
  const urgent = minutes >= 60;

  return (
    <div className="relative">
      {openOrder.total === 0 ? <ZeroTotalBadge /> : null}
      <Link
        href={`/pos/masa/${table.id}`}
        className={`flex flex-col items-start gap-1 rounded-xl border text-left transition-colors ${padding} ${
          urgent
            ? "border-warn/50 bg-warn/10"
            : "border-brand-300 bg-brand-50/50 hover:bg-brand-50"
        }`}
      >
        <span className={compact ? "text-sm font-bold text-ink" : "text-lg font-bold text-ink"}>
          {table.name}
        </span>
        <span className="text-xs text-ink-muted">
          {minutes} dk
          {!compact && openOrder.pendingCount > 0 ? ` · ${openOrder.pendingCount} gönderilmedi` : ""}
        </span>
        <span className="mt-1 text-sm font-semibold tabular-nums text-ink">
          {formatMoney(money(openOrder.total))}
        </span>
      </Link>
    </div>
  );
}
