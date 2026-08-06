"use client";

import { useEffect, useRef, useState } from "react";

import { advanceKitchenTicket } from "@/lib/orders/actions";
import type { KitchenTicket } from "@/lib/orders/queries";
import { createClient } from "@/lib/supabase/client";

const KDS_STATUSES: readonly KitchenTicket["status"][] = ["sent", "preparing", "ready"];

function mapTicketRow(
  line: {
    id: string;
    quantity: number | string;
    note: string | null;
    status: string;
    sent_at: string | null;
    menu_items: { name: string } | null;
    orders: { order_no: number | null; tables: { name: string } | null } | null;
    order_line_modifiers: { name: string }[] | null;
  },
): KitchenTicket {
  return {
    id: line.id,
    menuItemName: line.menu_items?.name ?? "Bilinmeyen ürün",
    quantity: Number(line.quantity),
    modifierSummary:
      (line.order_line_modifiers ?? []).length > 0
        ? line.order_line_modifiers!.map((m) => m.name).join(", ")
        : null,
    note: line.note,
    status: line.status as KitchenTicket["status"],
    tableName: line.orders?.tables?.name ?? null,
    orderNo: line.orders?.order_no ?? null,
    sentAt: line.sent_at as string,
  };
}

const COLUMNS: {
  status: KitchenTicket["status"];
  title: string;
  actionLabel: string;
}[] = [
  { status: "sent", title: "Bekliyor", actionLabel: "Hazırlanıyor" },
  { status: "preparing", title: "Hazırlanıyor", actionLabel: "Hazır" },
  { status: "ready", title: "Hazır", actionLabel: "Teslim edildi" },
];

/**
 * Geçen süreye göre ton: yeşil → amber → kırmızı.
 * Mutfağın "bu ne kadar bekledi?" sorusunu okumak için rakama bakmasına
 * gerek kalmasın — renk yeterli olsun.
 */
function urgencyClass(minutes: number): string {
  if (minutes < 5) return "border-line";
  if (minutes < 10) return "border-warn/60 bg-warn/5";
  return "border-danger/60 bg-danger/5";
}

function useElapsedMinutes(iso: string): number {
  const [minutes, setMinutes] = useState(() =>
    Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setMinutes(Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)));
    }, 15_000);
    return () => clearInterval(id);
  }, [iso]);

  return minutes;
}

function TicketCard({ ticket }: { ticket: KitchenTicket }) {
  const minutes = useElapsedMinutes(ticket.sentAt);
  const column = COLUMNS.find((c) => c.status === ticket.status);

  return (
    <li className={`rounded-xl border-2 bg-surface-raised p-3 ${urgencyClass(minutes)}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-ink-muted">
            {ticket.tableName ? `Masa ${ticket.tableName}` : "Paket"}
            {ticket.orderNo ? ` · #${ticket.orderNo}` : ""}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-ink">
            {ticket.quantity}× {ticket.menuItemName}
          </p>
          {ticket.modifierSummary ? (
            <p className="mt-0.5 text-xs font-medium text-brand-700">{ticket.modifierSummary}</p>
          ) : null}
          {ticket.note ? (
            <p className="mt-0.5 text-xs text-ink-muted">{ticket.note}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-ink-muted">
          {minutes} dk
        </span>
      </div>

      {column ? (
        <form action={advanceKitchenTicket} className="mt-2.5">
          <input type="hidden" name="id" value={ticket.id} />
          <input type="hidden" name="from" value={ticket.status} />
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
          >
            {column.actionLabel}
          </button>
        </form>
      ) : null}
    </li>
  );
}

export function KdsBoard({
  initialTickets,
  tenantId,
}: {
  initialTickets: KitchenTicket[];
  tenantId: string;
}) {
  // İlk değer yalnızca mount anında kullanılır; sonrası realtime'a bırakılıyor.
  const [tickets, setTickets] = useState(initialTickets);
  const [supabase] = useState(() => createClient());

  // Event handler'ın (yalnızca bir kez, effect mount'unda) o ANDAKİ listeye
  // erişmesi gerekiyor — state'in kendisi closure'a hapsolmasın diye ref'te
  // aynala. Yoğun serviste dakikada onlarca durum değişimi oluyor (sent →
  // preparing → ready → served); her birinde TÜM açık biletleri yeniden
  // çekmek (eski davranış) gereksiz sorgu yükü demekti. Artık yalnızca:
  //   - Durum değişimi (mevcut bilet elimizde) → yerel state'i yama, sorgu YOK.
  //   - Gerçekten yeni bir bilet (INSERT ya da elimizde hiç yoksa) → yalnızca
  //     O SATIRI join'li halinde tek satır sorgusuyla al, tüm listeyi değil.
  const ticketsRef = useRef(tickets);
  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  useEffect(() => {
    async function fetchTicket(id: string): Promise<KitchenTicket | null> {
      const { data } = await supabase
        .from("order_lines")
        .select(
          "id, quantity, note, status, sent_at, menu_items(name), orders(order_no, tables(name)), order_line_modifiers(name)",
        )
        .eq("id", id)
        .maybeSingle();
      return data ? mapTicketRow(data) : null;
    }

    // Realtime, RLS'ten geçer: bu kanal başka bir işletmenin verisini asla
    // taşımaz. tenant_id filtresi burada bir güvenlik sınırı değil, gereksiz
    // olay trafiğini azaltmak için — asıl sınır RLS.
    const channel = supabase
      .channel("kds-order-lines")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_lines",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            setTickets((prev) => prev.filter((t) => t.id !== oldId));
            return;
          }

          const row = payload.new as { id: string; status: string };

          if (!KDS_STATUSES.includes(row.status as KitchenTicket["status"])) {
            // served/cancelled/pending'e döndü — KDS'den düşer.
            setTickets((prev) => prev.filter((t) => t.id !== row.id));
            return;
          }

          if (ticketsRef.current.some((t) => t.id === row.id)) {
            // Yalnızca durum değişti — ürün adı/masa gibi join'li alanlar
            // değişmez, sorgu atmadan yerinde güncelle.
            setTickets((prev) =>
              prev.map((t) =>
                t.id === row.id ? { ...t, status: row.status as KitchenTicket["status"] } : t,
              ),
            );
            return;
          }

          // Gerçekten yeni bir bilet — tek satırı join'li çek, listeye ekle.
          void fetchTicket(row.id).then((ticket) => {
            if (!ticket) return;
            setTickets((prev) =>
              prev.some((t) => t.id === ticket.id)
                ? prev
                : [...prev, ticket].sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
            );
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, tenantId]);

  const byStatus = (status: KitchenTicket["status"]) =>
    tickets.filter((t) => t.status === status);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {COLUMNS.map((column) => {
        const columnTickets = byStatus(column.status);
        return (
          <section key={column.status}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
              {column.title}
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs tabular-nums">
                {columnTickets.length}
              </span>
            </h2>

            {columnTickets.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-ink-muted">
                Boş
              </p>
            ) : (
              <ul className="space-y-2">
                {columnTickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
