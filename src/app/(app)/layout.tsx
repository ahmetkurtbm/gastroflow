import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import { navFor } from "@/lib/auth/access";
import { signOut } from "@/lib/auth/actions";
import { requireAppUser } from "@/lib/auth/current-user";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getServerDictionary } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/lib/i18n/language-switcher";
import { I18nProvider } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/server";

const NAV_KEY_BY_HREF: Record<string, keyof Dictionary["nav"]> = {
  "/pos": "pos",
  "/orders": "orders",
  "/kds": "kds",
  "/cash": "cash",
  "/inventory": "inventory",
  "/recipes": "recipes",
  "/purchasing": "purchasing",
  "/reports": "reports",
  "/m": "m",
  "/approvals": "approvals",
  "/audit": "audit",
  "/settings": "settings",
};

/**
 * Oturum açmış kullanıcıların kabuğu.
 *
 * Buradaki sorgular aynı zamanda canlı bir RLS kanıtı: `tenants` tablosundan
 * filtresiz `select` çekiyoruz ve tek satır dönüyor — çünkü politika zaten
 * kullanıcının kendi işletmesinden başkasını göstermiyor.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAppUser();
  const supabase = await createClient();
  const { locale, dict } = await getServerDictionary();

  const [tenantResult, branchResult, profileResult] = await Promise.all([
    supabase.from("tenants").select("name").maybeSingle(),
    user.branchId
      ? supabase.from("branches").select("name").eq("id", user.branchId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("full_name").eq("id", user.userId).maybeSingle(),
  ]);

  const tenantName = tenantResult.data?.name ?? dict.shell.business;
  const branchName = branchResult.data?.name ?? null;
  const fullName = profileResult.data?.full_name ?? "—";

  const navItems = navFor(user.role).map((item) => ({
    ...item,
    label: dict.nav[NAV_KEY_BY_HREF[item.href]] ?? item.label,
  }));

  return (
    <I18nProvider locale={locale} dict={dict}>
      <div className="flex min-h-full flex-col md:flex-row">
        {/* Mobil üst çubuk: hamburger → kayar menü. Kenar çubuğunun dikey
            listesi telefonda kullanılamıyordu (yatay kaydırmalı şerite
            dönüşüyordu) — artık masaüstüyle birebir aynı gezinme deseni. */}
        <div className="flex items-center justify-between border-b border-line bg-surface-raised px-3 py-2.5 md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNavDrawer
              items={navItems}
              tenantName={tenantName}
              branchName={branchName}
              fullName={fullName}
              roleLabel={dict.role[user.role]}
              signOutLabel={dict.shell.signOut}
              onSignOut={signOut}
            />
            <Link href="/" className="truncate text-base font-bold tracking-tight text-ink">
              Gastro<span className="text-brand-600">Flow</span>
            </Link>
          </div>
          <LanguageSwitcher locale={locale} />
        </div>

        <aside className="hidden bg-surface-raised md:block md:w-56 md:shrink-0 md:border-r md:border-line">
          <div className="px-4 py-4">
            <Link href="/" className="block">
              <span className="text-lg font-bold tracking-tight text-ink">
                Gastro<span className="text-brand-600">Flow</span>
              </span>
            </Link>
            <p className="mt-1 truncate text-xs text-ink-muted">
              {tenantName}
              {branchName ? ` · ${branchName}` : ""}
            </p>
          </div>

          <AppNav items={navItems} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="hidden items-center justify-end gap-3 border-b border-line px-4 py-3 md:flex">
            <LanguageSwitcher locale={locale} />
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-ink">{fullName}</p>
              <p className="text-xs text-ink-muted">{dict.role[user.role]}</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                {dict.shell.signOut}
              </button>
            </form>
          </header>

          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </I18nProvider>
  );
}
