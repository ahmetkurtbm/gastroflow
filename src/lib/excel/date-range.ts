import { z } from "zod";

const isoDate = z.iso.date();

/**
 * Dışa aktarma uçlarındaki `from`/`to` parametreleri dosya adına yazıldığı için
 * yalnızca `YYYY-MM-DD` kabul edilir; geçersizse `null` döner.
 */
export function parseDateRange(
  from: string | null,
  to: string | null,
  defaults: { from: string; to: string },
): { from: string; to: string } | null {
  const fromDate = isoDate.safeParse(from ?? defaults.from);
  const toDate = isoDate.safeParse(to ?? defaults.to);
  if (!fromDate.success || !toDate.success) return null;
  return { from: fromDate.data, to: toDate.data };
}
