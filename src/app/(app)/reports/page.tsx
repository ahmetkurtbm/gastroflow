import type { Metadata } from "next";

import { ROLE_LABEL, type AppRole } from "@/lib/auth/access";
import { requireAppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Genel Bakış" };

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}

export default async function ReportsPage() {
  const user = await requireAppUser();
  const supabase = await createClient();

  // Hiçbir sorguda `where tenant_id = ...` yazmıyoruz. Yazmamıza gerek yok:
  // RLS politikaları bunu zaten zorunlu kılıyor. Bir gün burada filtre koymayı
  // unutsak bile başka bir işletmenin verisi gelmez.
  const [tenantResult, branchesResult, membersResult, auditResult] =
    await Promise.all([
      supabase.from("tenants").select("name, created_at").maybeSingle(),
      supabase.from("branches").select("id", { count: "exact", head: true }),
      supabase.from("memberships").select("role"),
      supabase.from("audit_log").select("id", { count: "exact", head: true }),
    ]);

  const members = membersResult.data ?? [];
  const roleCounts = members.reduce<Partial<Record<AppRole, number>>>(
    (acc, m) => {
      acc[m.role] = (acc[m.role] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {tenantResult.data?.name ?? "Genel bakış"}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Sistem kurulumu tamamlandı. Satış, maliyet ve varyans raporları
          Faz 6&apos;da bu ekrana gelecek.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Şube" value={branchesResult.count ?? 0} />
        <StatTile label="Personel" value={members.length} />
        <StatTile label="Log kaydı" value={auditResult.count ?? 0} />
      </div>

      <section className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Ekip dağılımı</h2>
        {members.length === 0 ? (
          <p className="text-sm text-ink-muted">Henüz personel eklenmemiş.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {Object.entries(roleCounts).map(([role, count]) => (
              <li
                key={role}
                className="rounded-full border border-line px-3 py-1 text-sm text-ink-muted"
              >
                {ROLE_LABEL[role as AppRole]}
                <span className="ml-1.5 font-semibold tabular-nums text-ink">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Oturum bilgisi</h2>
        <p className="mb-3 text-xs text-ink-muted">
          Bu değerler JWT&apos;den geliyor ve tüm veri erişimini belirliyor.
        </p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-ink-muted">Rol</dt>
            <dd className="font-medium text-ink">{ROLE_LABEL[user.role]}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-ink-muted">İşletme kimliği</dt>
            <dd className="truncate font-mono text-xs text-ink">
              {user.tenantId}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
