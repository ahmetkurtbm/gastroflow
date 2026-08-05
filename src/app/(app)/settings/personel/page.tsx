import type { Metadata } from "next";
import Link from "next/link";

import { requireAppUser } from "@/lib/auth/current-user";
import { loadBranchOptions, loadStaff } from "@/lib/staff/queries";

import { AddStaffForm } from "./add-staff-form";
import { StaffRow } from "./staff-row";

export const metadata: Metadata = { title: "Personel" };

/**
 * Personel (garson/müdür/kasa/...) ekleme ve rol yönetimi.
 *
 * Daha önce bunun tek yolu SQL çalıştırmaktı — bir restoran sahibi kendi
 * başına personel ekleyemiyordu. `addStaffMember` hem auth.users'ta hesap
 * açıyor hem memberships'e yazıyor; şifre yalnızca oluşturma anında bir kez
 * gösteriliyor (bkz. add-staff-form.tsx).
 */
export default async function PersonelSettingsPage() {
  const user = await requireAppUser();
  const [staff, branches] = await Promise.all([loadStaff(), loadBranchOptions()]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/settings" className="text-sm text-ink-muted hover:text-ink">
        ← Ayarlar
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold tracking-tight text-ink">Personel</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Rol/pasif etme değişikliği, personelin oturumu yenilenene ya da yeniden giriş
        yapana kadar (en geç ~1 saat) etkili olmayabilir.
      </p>

      <section className="rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Yeni personel
        </h2>
        <AddStaffForm branches={branches} />
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Ekip ({staff.length})
        </h2>
        {staff.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">Henüz personel yok.</p>
        ) : (
          <ul className="divide-y divide-line">
            {staff.map((member) => (
              <StaffRow key={member.id} member={member} isSelf={member.userId === user.userId} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
