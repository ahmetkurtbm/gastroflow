import type { Metadata } from "next";

import { ROLE_LABEL, type AppRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Loglar" };

const ACTION_LABEL: Record<string, string> = {
  INSERT: "Eklendi",
  UPDATE: "Değiştirildi",
  DELETE: "Silindi",
};

const TABLE_LABEL: Record<string, string> = {
  branches: "Şube",
  memberships: "Personel",
};

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

export default async function AuditPage() {
  const supabase = await createClient();

  // Politika gereği yalnızca patron ve yalnızca kendi işletmesinin kaydını
  // görebilir. Rol kontrolünü burada tekrarlamıyoruz — veritabanı zaten yapıyor.
  const { data: entries, error } = await supabase
    .from("audit_log")
    .select("id, action, table_name, record_id, actor_id, actor_role, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Denetim kaydı
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Bu kayıtları veritabanı yazar, uygulama değil — dolayısıyla hiçbir işlem
          kayıt bırakmadan yapılamaz. Kayıtlar değiştirilemez ve silinemez.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          Kayıtlar okunamadı: {error.message}
        </p>
      ) : !entries || entries.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
          Henüz kayıt yok.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Zaman</th>
                <th scope="col" className="px-4 py-3 font-medium">Nesne</th>
                <th scope="col" className="px-4 py-3 font-medium">İşlem</th>
                <th scope="col" className="px-4 py-3 font-medium">Yapan</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">
                    {dateFormatter.format(new Date(entry.occurred_at))}
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {TABLE_LABEL[entry.table_name] ?? entry.table_name}
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {ACTION_LABEL[entry.action] ?? entry.action}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {entry.actor_role
                      ? ROLE_LABEL[entry.actor_role as AppRole]
                      : "Sistem"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-muted">
        Filtreleme, önce/sonra karşılaştırması ve dışa aktarma Faz 6&apos;da gelecek.
      </p>
    </div>
  );
}
