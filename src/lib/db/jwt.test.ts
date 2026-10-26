import { describe, expect, it } from "vitest";

import { signJwt, verifyJwt } from "./jwt";

const SECRET = "test-secret-test-secret-test-secret-123";

describe("jwt", () => {
  it("imzalanan token doğrulanır", () => {
    const token = signJwt({ sub: "u1", role: "authenticated" }, SECRET);
    expect(verifyJwt(token, SECRET)).toMatchObject({ sub: "u1", role: "authenticated" });
  });

  it("içeriği değiştirilmiş token reddedilir", () => {
    const [header, , signature] = signJwt({ role: "authenticated" }, SECRET).split(".");
    const forged = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    expect(verifyJwt(`${header}.${forged}.${signature}`, SECRET)).toBeNull();
  });

  it("başka anahtarla imzalanan token reddedilir", () => {
    expect(verifyJwt(signJwt({ role: "service_role" }, `${SECRET}x`), SECRET)).toBeNull();
  });

  it("süresi dolmuş token reddedilir", () => {
    const token = signJwt({ role: "authenticated", exp: Math.floor(Date.now() / 1000) - 1 }, SECRET);
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it("alg=none token reddedilir", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    expect(verifyJwt(`${header}.${body}.`, SECRET)).toBeNull();
  });
});
