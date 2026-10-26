export type PriceRow = {
  menu_item_id: string;
  price: number | string;
  vat_rate?: number | string | null;
  branch_id?: string | null;
  valid_from: string;
};

export type CurrentPrice = { price: number; vatRate: number | null };

/**
 * Her ürünün `now` anında geçerli fiyatı: şubeye özel en yeni kayıt, yoksa en
 * yeni genel (branch_id null) kayıt. İleri tarihli ve başka şubeye ait kayıtlar
 * yok sayılır; girdinin sırası önemli değildir.
 */
export function currentPrices(
  rows: readonly PriceRow[],
  branchId: string | null,
  now: Date = new Date(),
): Map<string, CurrentPrice> {
  const nowMs = now.getTime();
  const best = new Map<string, { row: PriceRow; branchSpecific: boolean; from: number }>();

  for (const row of rows) {
    const from = Date.parse(row.valid_from);
    if (!Number.isFinite(from) || from > nowMs) continue;

    const rowBranch = row.branch_id ?? null;
    const branchSpecific = branchId !== null && rowBranch === branchId;
    if (rowBranch !== null && !branchSpecific) continue;

    const current = best.get(row.menu_item_id);
    if (
      !current ||
      (branchSpecific && !current.branchSpecific) ||
      (branchSpecific === current.branchSpecific && from > current.from)
    ) {
      best.set(row.menu_item_id, { row, branchSpecific, from });
    }
  }

  const result = new Map<string, CurrentPrice>();
  for (const [itemId, { row }] of best) {
    result.set(itemId, {
      price: Number(row.price),
      vatRate: row.vat_rate === undefined || row.vat_rate === null ? null : Number(row.vat_rate),
    });
  }
  return result;
}
