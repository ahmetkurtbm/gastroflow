import "server-only";

import { randomUUID } from "node:crypto";

import { ANON_KEY, signJwt, verifyJwt, type JwtPayload } from "./jwt";

/**
 * supabase-js'in kullandığı Auth uçlarının karşılığı: şifreyle giriş, token
 * yenileme, oturumdaki kullanıcı, çıkış ve personel hesabı için yönetici uçları.
 * Erişim token'ı HS256 ile imzalanır; kiracı ve rol claim'lerini veritabanındaki
 * `custom_access_token_hook` yazar.
 */

const ACCESS_TOKEN_TTL = 60 * 60;
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

type UserRow = {
  id: string;
  email: string;
  raw_app_meta_data: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
  created_at: string;
  updated_at: string;
};

const USER_COLUMNS =
  "id, email, raw_app_meta_data, raw_user_meta_data, email_confirmed_at, last_sign_in_at, banned_until, created_at, updated_at";

export type AuthResponse = { status: number; body: unknown };

function authError(status: number, code: string, message: string): AuthResponse {
  return { status, body: { code, error_code: code, msg: message, message } };
}

function userJson(user: UserRow) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    phone: "",
    email_confirmed_at: user.email_confirmed_at,
    confirmed_at: user.email_confirmed_at,
    last_sign_in_at: user.last_sign_in_at,
    app_metadata: user.raw_app_meta_data ?? {},
    user_metadata: user.raw_user_meta_data ?? {},
    identities: [],
    created_at: user.created_at,
    updated_at: user.updated_at,
    is_anonymous: false,
  };
}

/** İstek başlığındaki token'a göre veritabanı rolü ve claim'ler. */
export function resolveRequestRole(headers: Headers):
  | { role: "anon" | "authenticated" | "service_role"; claims: JwtPayload }
  | null {
  const authorization = headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : headers.get("apikey") ?? ANON_KEY;
  if (token === ANON_KEY) return { role: "anon", claims: { role: "anon" } };

  const claims = verifyJwt(token);
  if (!claims || claims.typ === "refresh") return null;
  if (claims.role === "authenticated" || claims.role === "service_role") {
    return { role: claims.role, claims };
  }
  return null;
}

const failedLogins = new Map<string, { count: number; until: number }>();

function isLockedOut(email: string): boolean {
  const entry = failedLogins.get(email);
  return entry !== undefined && entry.count >= MAX_FAILED_LOGINS && entry.until > Date.now();
}

function recordFailure(email: string) {
  const entry = failedLogins.get(email);
  const active = entry && entry.until > Date.now() ? entry : { count: 0, until: 0 };
  failedLogins.set(email, { count: active.count + 1, until: Date.now() + LOCKOUT_MS });
}

async function issueSession(user: UserRow): Promise<AuthResponse> {
  const { asSystem } = await import("./engine");
  const now = Math.floor(Date.now() / 1000);
  const sessionId = randomUUID();

  const baseClaims = {
    iss: "gastroflow",
    sub: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL,
    session_id: sessionId,
    aal: "aal1",
    amr: [{ method: "password", timestamp: now }],
    is_anonymous: false,
    app_metadata: user.raw_app_meta_data ?? {},
    user_metadata: user.raw_user_meta_data ?? {},
  };

  const claims = await asSystem(async (tx) => {
    const { rows } = await tx.query<{ event: { claims: JwtPayload } }>(
      "select public.custom_access_token_hook($1::text::jsonb) as event",
      [JSON.stringify({ user_id: user.id, claims: baseClaims, authentication_method: "password" })],
    );
    await tx.query("update auth.users set last_sign_in_at = now() where id = $1", [user.id]);
    return rows[0].event.claims;
  });

  return {
    status: 200,
    body: {
      access_token: signJwt(claims),
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL,
      expires_at: now + ACCESS_TOKEN_TTL,
      refresh_token: signJwt({ typ: "refresh", sub: user.id, sid: sessionId, exp: now + REFRESH_TOKEN_TTL }),
      user: userJson(user),
    },
  };
}

async function findUser(where: string, params: unknown[]): Promise<UserRow | null> {
  const { asSystem } = await import("./engine");
  return asSystem(async (tx) => {
    const { rows } = await tx.query<UserRow>(
      `select ${USER_COLUMNS} from auth.users where ${where} and (banned_until is null or banned_until < now())`,
      params,
    );
    return rows[0] ?? null;
  });
}

async function passwordGrant(body: { email?: unknown; password?: unknown }): Promise<AuthResponse> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return authError(400, "validation_failed", "E-posta ve şifre gerekli");
  if (isLockedOut(email)) return authError(429, "over_request_rate_limit", "Çok fazla hatalı deneme");

  const user = await findUser("lower(email) = $1 and encrypted_password = extensions.crypt($2, encrypted_password)", [
    email,
    password,
  ]);
  if (!user) {
    recordFailure(email);
    return authError(400, "invalid_credentials", "Invalid login credentials");
  }

  failedLogins.delete(email);
  return issueSession(user);
}

async function refreshGrant(body: { refresh_token?: unknown }): Promise<AuthResponse> {
  const token = typeof body.refresh_token === "string" ? verifyJwt(body.refresh_token) : null;
  if (!token || token.typ !== "refresh" || typeof token.sub !== "string") {
    return authError(400, "refresh_token_not_found", "Invalid Refresh Token");
  }
  const user = await findUser("id = $1", [token.sub]);
  if (!user) return authError(400, "refresh_token_not_found", "Invalid Refresh Token");
  return issueSession(user);
}

const createUserInput = (body: Record<string, unknown>) => ({
  email: typeof body.email === "string" ? body.email.trim().toLowerCase() : "",
  password: typeof body.password === "string" ? body.password : "",
  confirmed: body.email_confirm === true,
  metadata: (typeof body.user_metadata === "object" && body.user_metadata) || {},
});

async function adminCreateUser(body: Record<string, unknown>): Promise<AuthResponse> {
  const input = createUserInput(body);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return authError(400, "validation_failed", "Geçersiz e-posta");
  if (input.password.length < 8) return authError(422, "weak_password", "Şifre en az 8 karakter olmalı");

  const { asSystem } = await import("./engine");
  return asSystem(async (tx) => {
    const existing = await tx.query("select 1 from auth.users where lower(email) = $1", [input.email]);
    if (existing.rows.length > 0) return authError(422, "email_exists", "A user with this email address has already been registered");

    const id = randomUUID();
    const { rows } = await tx.query<UserRow>(
      `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                               raw_app_meta_data, raw_user_meta_data)
       values ($1, 'authenticated', 'authenticated', $2, extensions.crypt($3, extensions.gen_salt('bf')),
               case when $4::boolean then now() end,
               '{"provider":"email","providers":["email"]}'::jsonb, $5::text::jsonb)
       returning ${USER_COLUMNS}`,
      [id, input.email, input.password, input.confirmed, JSON.stringify(input.metadata)],
    );
    await tx.query(
      `insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
       values ($1::uuid, $2::uuid, $2::text, 'email', jsonb_build_object('sub', $2::text, 'email', $3::text), now(), now())`,
      [randomUUID(), id, input.email],
    );
    return { status: 200, body: userJson(rows[0]) };
  });
}

async function adminUser(method: string, id: string): Promise<AuthResponse> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return authError(404, "user_not_found", "User not found");
  const { asSystem } = await import("./engine");
  return asSystem(async (tx) => {
    const sql = method === "DELETE"
      ? `delete from auth.users where id = $1 returning ${USER_COLUMNS}`
      : `select ${USER_COLUMNS} from auth.users where id = $1`;
    const { rows } = await tx.query<UserRow>(sql, [id]);
    if (rows.length === 0) return authError(404, "user_not_found", "User not found");
    return { status: 200, body: userJson(rows[0]) };
  });
}

export async function handleAuth(method: string, route: string, search: URLSearchParams, headers: Headers, body: unknown): Promise<AuthResponse> {
  const payload = (typeof body === "object" && body ? body : {}) as Record<string, unknown>;

  if (method === "POST" && route === "token") {
    const grant = search.get("grant_type");
    if (grant === "password") return passwordGrant(payload);
    if (grant === "refresh_token") return refreshGrant(payload);
    return authError(400, "unsupported_grant_type", "Desteklenmeyen grant_type");
  }

  if (method === "POST" && route === "logout") return { status: 204, body: null };

  if (method === "GET" && route === "user") {
    // Token imzası doğrulanır; kullanıcı bilgisi claim'lerden kurulur, veritabanına gidilmez.
    const caller = resolveRequestRole(headers);
    if (!caller || caller.role !== "authenticated") return authError(401, "bad_jwt", "invalid JWT");
    const claims = caller.claims;
    return {
      status: 200,
      body: {
        ...userJson({
          id: String(claims.sub),
          email: String(claims.email ?? ""),
          raw_app_meta_data: (claims.app_metadata as Record<string, unknown>) ?? {},
          raw_user_meta_data: (claims.user_metadata as Record<string, unknown>) ?? {},
          email_confirmed_at: null,
          last_sign_in_at: null,
          banned_until: null,
          created_at: "",
          updated_at: "",
        }),
      },
    };
  }

  if (route === "admin/users" || route.startsWith("admin/users/")) {
    if (resolveRequestRole(headers)?.role !== "service_role") return authError(403, "not_admin", "User not allowed");
    if (method === "POST" && route === "admin/users") return adminCreateUser(payload);
    const id = route.slice("admin/users/".length);
    if (id && (method === "GET" || method === "DELETE")) return adminUser(method, id);
  }

  return authError(404, "not_found", "Bulunamadı");
}
