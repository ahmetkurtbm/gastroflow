import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./unique-violation";

describe("isUniqueViolation", () => {
  it("yalnızca 23505 kodunu tanır", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "42501" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
