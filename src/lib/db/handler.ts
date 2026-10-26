import "server-only";

import { handleAuth, resolveRequestRole } from "./auth";

/**
 * supabase-js'in istek attığı `/rest/v1`, `/auth/v1` ve `/storage/v1` uçlarını
 * uygulama içinde karşılar. Sunucu tarafındaki istemciler bu fonksiyonu
 * doğrudan `fetch` olarak kullanır; ağ üzerinden açılan tek yol
 * `src/app/api/db/[...path]/route.ts`'tir.
 */

export const API_BASE_PATH = "/api/db";

// İstekler ağa çıkmaz; adres yalnızca çerez adı ve dosya yolu üretimi için.
export const INTERNAL_API_URL = `http://gastroflow.internal${API_BASE_PATH}`;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function invalidJwt(): Response {
  return new Response(JSON.stringify({ code: "PGRST301", message: "JWT geçersiz veya süresi dolmuş", details: null, hint: null }), {
    status: 401,
    headers: JSON_HEADERS,
  });
}

export async function handleDbRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.startsWith(API_BASE_PATH) ? url.pathname.slice(API_BASE_PATH.length) : url.pathname;
  const method = request.method.toUpperCase();

  if (path.startsWith("/auth/v1/")) {
    const body = method === "GET" || method === "HEAD" ? null : await readBody(request);
    const headers = { ...JSON_HEADERS, "x-supabase-api-version": "2024-01-01" };
    try {
      const result = await handleAuth(method, path.slice("/auth/v1/".length), url.searchParams, request.headers, body);
      return new Response(result.body === null ? null : JSON.stringify(result.body), { status: result.status, headers });
    } catch (error) {
      console.error("Kimlik isteği işlenemedi:", error);
      return new Response(JSON.stringify({ code: "unexpected_failure", error_code: "unexpected_failure", msg: "Beklenmeyen hata" }), {
        status: 500,
        headers,
      });
    }
  }

  if (path.startsWith("/storage/v1/object/public/")) {
    const { handlePublicObject } = await import("./storage");
    const [bucket, ...name] = path.slice("/storage/v1/object/public/".length).split("/");
    const result = await handlePublicObject(bucket, decodeURIComponent(name.join("/")));
    return new Response(result.body, { status: result.status, headers: result.headers });
  }

  const caller = resolveRequestRole(request.headers);

  if (path.startsWith("/storage/v1/object/") && (method === "POST" || method === "PUT")) {
    if (!caller) return invalidJwt();
    const { handleUpload } = await import("./storage");
    const [bucket, ...name] = path.slice("/storage/v1/object/".length).split("/");
    const result = await handleUpload(request, bucket, decodeURIComponent(name.join("/")), caller.role, caller.claims);
    return new Response(result.body, { status: result.status, headers: result.headers });
  }

  const rest = /^\/rest\/v1\/([a-z_][a-z0-9_]*)$/.exec(path);
  if (rest) {
    if (!caller) return invalidJwt();
    const { handleRest, restErrorResponse } = await import("./rest");
    const body = method === "POST" || method === "PATCH" ? await readBody(request) : null;
    if (body === undefined) {
      return new Response(JSON.stringify({ code: "PGRST102", message: "Geçersiz JSON gövdesi", details: null, hint: null }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    try {
      const result = await handleRest({
        method,
        table: rest[1],
        search: url.searchParams,
        headers: request.headers,
        body,
        role: caller.role,
        claims: caller.claims,
      });
      return new Response(result.body, { status: result.status, headers: result.headers });
    } catch (error) {
      const result = restErrorResponse(error, caller.role);
      return new Response(result.body, { status: result.status, headers: result.headers });
    }
  }

  return new Response(JSON.stringify({ message: "Bulunamadı" }), { status: 404, headers: JSON_HEADERS });
}

/** supabase-js istemcilerine verilen `fetch`: istekler ağa çıkmadan bu süreçte işlenir. */
export const inProcessFetch: typeof fetch = (input, init) => handleDbRequest(new Request(input, init));
