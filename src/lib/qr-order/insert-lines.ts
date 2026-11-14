import type { Tx } from "@/lib/db/engine";

// `server-only` yok: yalnızca tipi içe aktarır, sahte bir Tx ile birim test edilir.

export type LineDraft = {
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  vat_rate?: number;
  recipe_version_id: string | null;
  note: string;
};

/**
 * QR sipariş satırlarını sınır kontrolüyle birlikte yazar. Sayma ve ekleme tek
 * transaction'dadır ve adisyon başına `pg_advisory_xact_lock` alınır; paralel
 * istekler birbirini bekler, böylece sınır eşzamanlı isteklerle aşılamaz.
 * Sınır aşılacaksa hiçbir şey yazılmaz ve `"limit"` döner.
 */
export async function insertLinesWithinLimit(
  tx: Tx,
  params: {
    tenantId: string;
    orderId: string;
    drafts: LineDraft[];
    windowMs: number;
    maxLines: number;
    newClientKey: () => string;
  },
): Promise<"ok" | "limit"> {
  const { tenantId, orderId, drafts, windowMs, maxLines, newClientKey } = params;

  await tx.query("select pg_advisory_xact_lock(hashtextextended($1::text, 0))", [`qr-order:${orderId}`]);

  const { rows } = await tx.query<{ count: number }>(
    `select count(*)::int as count
       from order_lines
      where order_id = $1 and created_by is null and created_at >= $2::timestamptz`,
    [orderId, new Date(Date.now() - windowMs).toISOString()],
  );
  if ((rows[0]?.count ?? 0) + drafts.length > maxLines) return "limit";

  for (const draft of drafts) {
    // KDV oranı yoksa sütunun varsayılanı geçerli kalır.
    const withVat = draft.vat_rate !== undefined;
    await tx.query(
      `insert into order_lines (tenant_id, order_id, client_key, menu_item_id, quantity, unit_price,
                                recipe_version_id, note${withVat ? ", vat_rate" : ""})
       values ($1, $2, $3, $4, $5, $6, $7, $8${withVat ? ", $9" : ""})`,
      [
        tenantId,
        orderId,
        newClientKey(),
        draft.menu_item_id,
        draft.quantity,
        draft.unit_price,
        draft.recipe_version_id,
        draft.note,
        ...(withVat ? [draft.vat_rate] : []),
      ],
    );
  }
  return "ok";
}
