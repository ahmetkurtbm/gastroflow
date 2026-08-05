import { requireAppUser } from "@/lib/auth/current-user";
import type { AppRole } from "@/lib/auth/access";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export type StaffMember = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: AppRole;
  branchId: string | null;
  branchName: string | null;
  isActive: boolean;
};

/**
 * Personel listesi.
 *
 * `memberships`/`profiles` RLS'ten (owner kendi tenant'ını görür) okunuyor —
 * bu kısım normal, oturumlu istemciyle. E-posta ise `auth.users`'ta yaşıyor;
 * PostgREST bu şemaya erişemez, yalnızca service_role admin API'siyle
 * okunabilir. Kiracı sızıntısı riski yok: hangi `user_id`'lerin sorgulanacağı
 * zaten RLS'ten geçmiş `memberships` sonucundan geliyor, kullanıcıdan gelen
 * bir girdi değil.
 */
export async function loadStaff(): Promise<StaffMember[]> {
  await requireAppUser();
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, user_id, role, branch_id, is_active, branches(name)")
    .order("is_active", { ascending: false })
    .order("role");

  if (!memberships || memberships.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in(
      "id",
      memberships.map((m) => m.user_id),
    );
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const admin = createServiceRoleClient();
  const emails = await Promise.all(
    memberships.map((m) => admin.auth.admin.getUserById(m.user_id)),
  );
  const emailById = new Map(
    memberships.map((m, i) => [m.user_id, emails[i].data.user?.email ?? "—"]),
  );

  return memberships.map((m) => ({
    id: m.id,
    userId: m.user_id,
    fullName: nameById.get(m.user_id) ?? "—",
    email: emailById.get(m.user_id) ?? "—",
    role: m.role,
    branchId: m.branch_id,
    branchName: m.branches?.name ?? null,
    isActive: m.is_active,
  }));
}

export async function loadBranchOptions() {
  const supabase = await createClient();
  const { data } = await supabase.from("branches").select("id, name").order("name");
  return data ?? [];
}
