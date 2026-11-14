import { describe, expect, it } from "vitest";

import type { Tx } from "@/lib/db/engine";

import { insertLinesWithinLimit, type LineDraft } from "./insert-lines";

const draft = (overrides: Partial<LineDraft> = {}): LineDraft => ({
  menu_item_id: "item",
  quantity: 1,
  unit_price: 10,
  recipe_version_id: null,
  note: "QR sipariş",
  ...overrides,
});

function fakeTx(existingCount: number) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const tx: Tx = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      return { rows: sql.includes("count(*)") ? [{ count: existingCount } as never] : [] };
    },
  };
  return { tx, queries };
}

const options = { tenantId: "t", orderId: "o", windowMs: 600_000, maxLines: 50, newClientKey: () => "k" };

describe("insertLinesWithinLimit", () => {
  it("önce adisyon kilidini alır, sonra sayar, sonra yazar", async () => {
    const { tx, queries } = fakeTx(0);
    const result = await insertLinesWithinLimit(tx, { ...options, drafts: [draft(), draft({ vat_rate: 20 })] });

    expect(result).toBe("ok");
    expect(queries[0].sql).toContain("pg_advisory_xact_lock");
    expect(queries[1].sql).toContain("count(*)");
    expect(queries.filter((q) => q.sql.includes("insert into order_lines"))).toHaveLength(2);
    expect(queries[3].sql).toContain("vat_rate");
    expect(queries[2].sql).not.toContain("vat_rate");
  });

  it("sınır aşılacaksa hiçbir satır yazmaz", async () => {
    const { tx, queries } = fakeTx(49);
    const result = await insertLinesWithinLimit(tx, { ...options, drafts: [draft(), draft()] });

    expect(result).toBe("limit");
    expect(queries.some((q) => q.sql.includes("insert into"))).toBe(false);
  });

  it("tam sınırda kabul eder", async () => {
    const { tx } = fakeTx(48);
    expect(await insertLinesWithinLimit(tx, { ...options, drafts: [draft(), draft()] })).toBe("ok");
  });
});
