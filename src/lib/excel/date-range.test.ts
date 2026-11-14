import { describe, expect, it } from "vitest";

import { parseDateRange } from "./date-range";

const defaults = { from: "2026-10-01", to: "2026-10-31" };

describe("parseDateRange", () => {
  it("parametre yoksa varsayılanları kullanır", () => {
    expect(parseDateRange(null, null, defaults)).toEqual(defaults);
  });

  it("geçerli YYYY-MM-DD değerlerini kabul eder", () => {
    expect(parseDateRange("2026-01-05", "2026-02-06", defaults)).toEqual({ from: "2026-01-05", to: "2026-02-06" });
  });

  it("başlık enjeksiyonu ve biçim dışı değerleri reddeder", () => {
    expect(parseDateRange('2026-01-05"\r\nX-Evil: 1', null, defaults)).toBeNull();
    expect(parseDateRange(null, "../../etc", defaults)).toBeNull();
    expect(parseDateRange("2026-13-45", null, defaults)).toBeNull();
    expect(parseDateRange("", null, defaults)).toBeNull();
  });
});
