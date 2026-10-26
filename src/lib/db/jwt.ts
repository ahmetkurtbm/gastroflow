import { createHmac, timingSafeEqual } from "node:crypto";

export type JwtPayload = Record<string, unknown> & { exp?: number; role?: string; sub?: string };

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Oturum token'larını imzalayan anahtar. Tanımlı değilse build sırasında
 * üretilen anahtar kullanılır (next.config.ts); bu durumda her yeni build
 * açık oturumları geçersiz kılar.
 */
export function authSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.GASTROFLOW_BUILD_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET en az 32 karakter olmalı.");
  }
  return secret;
}

export function signJwt(payload: JwtPayload, secret = authSecret()): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

/** İmzası ve süresi geçerliyse içeriği, değilse `null` döner. */
export function verifyJwt(token: string, secret = authSecret()): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;

  try {
    const { alg } = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    if (alg !== "HS256") return null;

    const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest();
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as JwtPayload;
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Anahtarı olmayan istekler bu değerle gelir ve `anon` rolüyle çalışır. */
export const ANON_KEY = "anon";

export function serviceRoleKey(): string {
  return signJwt({ iss: "gastroflow", role: "service_role" });
}
