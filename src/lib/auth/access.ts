import { z } from "zod";

/**
 * Rol ve yol erişim kuralları. Bu kontrol kullanıcı deneyimi içindir; veri
 * erişimini RLS belirler, buraya rol eklemek erişim vermez.
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

/** Oturum gerektirmeyen yollar. `/siparis` QR müşteri ekranıdır; sınırı `qr_token`. */
const PUBLIC_PATHS = ["/", "/login", "/auth", "/siparis"] as const;

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

/** Yol öneki → erişebilen roller. Listede olmayan yol kapalıdır. */
const PATH_ACCESS: Record<string, readonly AppRole[]> = {
  "/pos": ["waiter", "cashier", "manager", "owner"],
  "/orders": ["waiter", "cashier", "chef", "manager", "owner"],
  "/kds": ["chef", "manager", "owner"],
  "/cash": ["cashier", "manager", "owner"],
  "/inventory": ["storekeeper", "chef", "manager", "owner", "accountant"],
  "/recipes": ["chef", "manager", "owner", "accountant"],
  "/purchasing": ["storekeeper", "manager", "owner", "accountant"],
  "/reports": ["manager", "owner", "accountant"],
  "/approvals": ["manager", "owner"],
  "/audit": ["owner"],
  "/m": ["manager", "owner"],
  "/settings": ["owner"],
  // Dışa aktarım uçlarında rol kontrolü her route'un kendisindedir.
  "/api/export": ["waiter", "cashier", "chef", "manager", "owner", "storekeeper", "accountant"],
};

/** Kenar çubuğu menüsü; her bağlantı `canAccessPath` ile süzülür. */
export const NAV_ITEMS = [
  { href: "/pos", label: "Sipariş Al" },
  { href: "/orders", label: "Siparişler" },
  { href: "/kds", label: "Mutfak" },
  { href: "/cash", label: "Kasa" },
  { href: "/inventory", label: "Stok" },
  { href: "/recipes", label: "Reçeteler" },
  { href: "/purchasing", label: "Satın Alma" },
  { href: "/reports", label: "Raporlar" },
  { href: "/m", label: "Patron Paneli" },
  { href: "/approvals", label: "Onaylar" },
  { href: "/audit", label: "Loglar" },
  { href: "/settings", label: "Ayarlar" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

export function navFor(role: AppRole): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => canAccessPath(role, item.href));
}

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Patron",
  manager: "Müdür",
  chef: "Mutfak",
  waiter: "Garson",
  cashier: "Kasa",
  storekeeper: "Depo",
  accountant: "Muhasebe",
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

  if (!entry) return false;

  return entry[1].includes(role);
}

/** JWT claim'leri; custom access token hook yazar, kullanıcı değiştiremez. */
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
