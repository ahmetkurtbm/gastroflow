import { describe, expect, it } from "vitest";

import { currentPrices, type PriceRow } from "./pricing";

const NOW = new Date("2026-08-10T12:00:00Z");
const BRANCH = "branch-a";

function row(partial: Partial<PriceRow> & { valid_from: string; price: number }): PriceRow {
  return { menu_item_id: "item-1", branch_id: null, vat_rate: 10, ...partial };
}

describe("currentPrices", () => {
  it("en yeni genel fiyatı seçer", () => {
    const prices = currentPrices(
      [row({ price: 100, valid_from: "2026-08-01T00:00:00Z" }), row({ price: 120, valid_from: "2026-08-05T00:00:00Z" })],
      BRANCH,
      NOW,
    );
    expect(prices.get("item-1")).toEqual({ price: 120, vatRate: 10 });
  });

  it("ileri tarihli fiyatı henüz uygulamaz", () => {
    const prices = currentPrices(
      [row({ price: 100, valid_from: "2026-08-01T00:00:00Z" }), row({ price: 150, valid_from: "2026-09-01T00:00:00Z" })],
      BRANCH,
      NOW,
    );
    expect(prices.get("item-1")?.price).toBe(100);
  });

  it("şubeye özel fiyatı genel fiyattan önce tutar", () => {
    const prices = currentPrices(
      [
        row({ price: 200, valid_from: "2026-08-09T00:00:00Z" }),
        row({ price: 90, branch_id: BRANCH, valid_from: "2026-08-01T00:00:00Z" }),
      ],
      BRANCH,
      NOW,
    );
    expect(prices.get("item-1")?.price).toBe(90);
  });

  it("şubeye özel kayıtlar arasında eskisini değil en yenisini seçer", () => {
    const rows = [
      row({ price: 110, branch_id: BRANCH, valid_from: "2026-08-08T00:00:00Z" }),
      row({ price: 90, branch_id: BRANCH, valid_from: "2026-08-01T00:00:00Z" }),
    ];
    expect(currentPrices(rows, BRANCH, NOW).get("item-1")?.price).toBe(110);
    expect(currentPrices([...rows].reverse(), BRANCH, NOW).get("item-1")?.price).toBe(110);
  });

  it("başka şubenin fiyatını kullanmaz", () => {
    const prices = currentPrices([row({ price: 80, branch_id: "branch-b", valid_from: "2026-08-01T00:00:00Z" })], BRANCH, NOW);
    expect(prices.has("item-1")).toBe(false);
  });

  it("şube verilmezse yalnızca genel fiyatlara bakar", () => {
    const prices = currentPrices(
      [
        row({ price: 100, valid_from: "2026-08-01T00:00:00Z" }),
        row({ price: 90, branch_id: BRANCH, valid_from: "2026-08-05T00:00:00Z" }),
      ],
      null,
      NOW,
    );
    expect(prices.get("item-1")?.price).toBe(100);
  });

  it("PostgREST'in string döndürdüğü numeric değerleri sayıya çevirir", () => {
    const prices = currentPrices(
      [{ menu_item_id: "item-1", price: "45.5000", vat_rate: "20.00", branch_id: null, valid_from: "2026-08-01T00:00:00Z" }],
      BRANCH,
      NOW,
    );
    expect(prices.get("item-1")).toEqual({ price: 45.5, vatRate: 20 });
  });
});
