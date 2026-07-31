import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import { ROLE_LABEL, navFor } from "@/lib/auth/access";
import { signOut } from "@/lib/auth/actions";
import { requireAppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

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

  const [tenantResult, branchResult, profileResult] = await Promise.all([
    supabase.from("tenants").select("name").maybeSingle(),
    user.branchId
      ? supabase.from("branches").select("name").eq("id", user.branchId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("full_name").eq("id", user.userId).maybeSingle(),
  ]);

  const tenantName = tenantResult.data?.name ?? "İşletme";
  const branchName = branchResult.data?.name ?? null;
  const fullName = profileResult.data?.full_name ?? "Kullanıcı";

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="border-b border-line bg-surface-raised md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-3 md:block md:px-4 md:py-4">
          <Link href="/" className="block">
            <span className="text-lg font-bold tracking-tight text-ink">
              Gastro<span className="text-brand-600">Flow</span>
            </span>
          </Link>
          <p className="truncate text-xs text-ink-muted md:mt-1">
            {tenantName}
            {branchName ? ` · ${branchName}` : ""}
          </p>
        </div>

        <AppNav items={navFor(user.role)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-line px-4 py-3">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-ink">{fullName}</p>
            <p className="text-xs text-ink-muted">{ROLE_LABEL[user.role]}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
            >
              Çıkış
            </button>
          </form>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
