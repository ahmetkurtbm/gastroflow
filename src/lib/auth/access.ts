import { z } from "zod";

/**
 * Rol ve yol erişim kuralları.
 *
 * Bu dosya saf mantıktır — veritabanı, çerez, Next.js bilmez. Sebebi: erişim
 * kurallarını DB olmadan test edebilmek. Ama unutma:
 *
 *   BURASI GÜVENLİĞİN KENDİSİ DEĞİL, SADECE KULLANICI DENEYİMİDİR.
 *
 * Gerçek koruma veritabanındaki RLS politikalarıdır. Buradaki kontrol yalnızca
 * kullanıcıyı göremeyeceği bir ekrana boşuna götürmemek içindir. Bir rolü buradan
 * eklemek, ona veri erişimi VERMEZ; RLS politikası yazılmadıkça hiçbir satır gelmez.
 */

export const APP_ROLES = [
  "owner", // patron
  "manager", // müdür
  "chef", // mutfak
  "waiter", // garson
  "cashier", // kasa
  "storekeeper", // depo
  "accountant", // muhasebe
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Oturum gerektirmeyen yollar. */
const PUBLIC_PATHS = ["/", "/login", "/auth"] as const;

/** Her rolün giriş sonrası düşeceği ekran. */
export const ROLE_HOME: Record<AppRole, string> = {
  owner: "/reports",
  manager: "/reports",
  chef: "/kds",
  waiter: "/pos",
  cashier: "/pos",
  storekeeper: "/inventory",
  accountant: "/reports",
};

/**
 * Yol öneki → o yola girebilen roller.
 * Burada listelenmeyen bir önek hiçbir role açık değildir (deny-by-default).
 */
const PATH_ACCESS: Record<string, readonly AppRole[]> = {
  "/pos": ["waiter", "cashier", "manager", "owner"],
  "/orders": ["waiter", "cashier", "chef", "manager", "owner"],
  "/kds": ["chef", "manager", "owner"],
  "/cash": ["cashier", "manager", "owner"],
  "/inventory": ["storekeeper", "chef", "manager", "owner"],
  "/recipes": ["chef", "manager", "owner", "accountant"],
  "/purchasing": ["storekeeper", "manager", "owner", "accountant"],
  "/reports": ["manager", "owner", "accountant"],
  "/audit": ["owner"],
  "/m": ["manager", "owner"],
  "/settings": ["owner"],
};

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

export function canAccessPath(role: AppRole, pathname: string): boolean {
  const entry = Object.entries(PATH_ACCESS).find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Tanımsız yol = kapalı yol.
  if (!entry) return false;

  return entry[1].includes(role);
}

/**
 * JWT claim'leri. `tenant_id`, `branch_id` ve `app_role` veritabanındaki
 * custom access token hook tarafından yazılır (bkz. supabase/migrations).
 * Kullanıcı bunları kendi değiştiremez.
 */
const appClaimsSchema = z.object({
  sub: z.uuid(),
  tenant_id: z.uuid(),
  branch_id: z.uuid().nullable().optional(),
  app_role: z.enum(APP_ROLES),
});

export type AppClaims = {
  userId: string;
  tenantId: string;
  branchId: string | null;
  role: AppRole;
};

export function parseAppClaims(claims: unknown): AppClaims | null {
  const parsed = appClaimsSchema.safeParse(claims);
  if (!parsed.success) return null;

  return {
    userId: parsed.data.sub,
    tenantId: parsed.data.tenant_id,
    branchId: parsed.data.branch_id ?? null,
    role: parsed.data.app_role,
  };
}
