import { describe, expect, it } from "vitest";

import { didCloseOrder } from "./close-guard";

describe("didCloseOrder", () => {
  it("bir satır kapandıysa true", () => {
    expect(didCloseOrder({ error: null, data: [{ id: "o1" }] })).toBe(true);
  });

  it("0 satır etkilendiyse (zaten kapanmış) false", () => {
    expect(didCloseOrder({ error: null, data: [] })).toBe(false);
    expect(didCloseOrder({ error: null, data: null })).toBe(false);
  });

  it("hata varsa false", () => {
    expect(didCloseOrder({ error: { message: "x" }, data: null })).toBe(false);
  });
});
