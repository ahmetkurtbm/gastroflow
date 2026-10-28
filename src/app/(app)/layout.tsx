import { LogOut } from "lucide-react";
import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import { BrandMark, BrandName } from "@/components/brand";
import { GlobalSyncIndicator } from "@/components/global-sync-indicator";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { navFor } from "@/lib/auth/access";
import { signOut } from "@/lib/auth/actions";
import { requireAppUser } from "@/lib/auth/current-user";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getServerDictionary } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/lib/i18n/language-switcher";
import { I18nProvider } from "@/lib/i18n/provider";
import { createClient } from "@/lib/db/client";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { cookies } from "next/headers";

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

/** Oturum açmış kullanıcıların kabuğu. */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAppUser();
  const supabase = await createClient();
  const { locale, dict } = await getServerDictionary();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

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

  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toLocaleUpperCase("tr"))
    .join("");

  return (
    <I18nProvider locale={locale} dict={dict}>
      <div className="flex min-h-full flex-col md:flex-row">
        {/* Mobil üst çubuk ve açılır menü. */}
        <div className="sticky top-0 z-30 flex items-center justify-between bg-slate-900 px-2 py-1.5 md:hidden">
          <div className="flex min-w-0 items-center gap-1">
            <MobileNavDrawer
              items={navItems}
              groupLabels={dict.navGroup}
              tenantName={tenantName}
              branchName={branchName}
              fullName={fullName}
              roleLabel={dict.role[user.role]}
              signOutLabel={dict.shell.signOut}
              installDict={dict.install}
              onSignOut={signOut}
            />
            <Link href="/" className="flex min-w-0 items-center gap-2">
              <BrandMark size={26} />
              <BrandName className="truncate text-base text-white" />
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2 pr-1">
            <GlobalSyncIndicator />
            <ThemeSwitcher initial={theme} tone="dark" />
            <LanguageSwitcher locale={locale} tone="dark" />
          </div>
        </div>

        <aside className="hidden bg-slate-900 md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col">
          <Link href="/" className="flex items-center gap-2.5 px-5 pb-2 pt-5">
            <BrandMark size={30} />
            <BrandName className="text-lg text-white" />
          </Link>
          <p className="truncate px-5 text-xs text-slate-400">
            {tenantName}
            {branchName ? ` · ${branchName}` : ""}
          </p>

          <div className="flex-1 overflow-y-auto [scrollbar-color:rgb(255_255_255/0.15)_transparent] [scrollbar-width:thin]">
            <AppNav items={navItems} groupLabels={dict.navGroup} />
          </div>

          <div className="flex items-center justify-between gap-2 px-4 pb-3">
            <GlobalSyncIndicator />
            <div className="ml-auto flex items-center gap-2">
              <ThemeSwitcher initial={theme} tone="dark" />
              <LanguageSwitcher locale={locale} tone="dark" />
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
            >
              {initials || "?"}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-white">{fullName}</p>
              <p className="truncate text-xs text-slate-400">{dict.role[user.role]}</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                aria-label={dict.shell.signOut}
                title={dict.shell.signOut}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut size={17} aria-hidden="true" />
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </I18nProvider>
  );
}
